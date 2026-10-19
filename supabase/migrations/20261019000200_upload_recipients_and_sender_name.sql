-- TrustVault migration 0800 — upload-time sharing and sender identity in received documents.
-- Recipient lookup runs only through verified Edge Functions, is rate-limited,
-- returns a small result set, and is audited. It never grants access by itself.

create function public.svc_search_share_recipients(p_actor uuid, p_query text, p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipients jsonb;
begin
  if p_actor is null or p_request is null or p_query is null or char_length(btrim(p_query)) not between 3 and 100 then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if app.actor_role(p_actor) is null then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if app.throttle_check(p_actor, p_request) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  if (select count(*) from public.audit_events e
       where e.actor_id = p_actor and e.action = 'permission.recipient_search'
         and e.occurred_at > clock_timestamp() - interval '1 minute') >= 30 then
    if not exists (select 1 from public.audit_events e where e.actor_id = p_actor
                    and e.action = 'request.rate_limited'
                    and e.occurred_at > clock_timestamp() - interval '1 minute') then
      perform app.write_audit(p_actor, null, 'request.rate_limited', 'denied', p_request,
                              jsonb_build_object('reason', 'recipient_search_limit'));
    end if;
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'email', r.email, 'display_name', r.display_name)
                            order by r.display_name, r.email), '[]'::jsonb)
    into v_recipients
    from (
      select p.id, p.email, p.display_name
        from public.profiles p
       where p.id <> p_actor
         and (p.email ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
              or p.display_name ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\')
       order by p.display_name, p.email
       limit 20
    ) r;

  perform app.write_audit(p_actor, null, 'permission.recipient_search', 'success', p_request,
                          jsonb_build_object('query_length', char_length(btrim(p_query)),
                                             'results', jsonb_array_length(v_recipients)));
  return jsonb_build_object('ok', true, 'recipients', v_recipients);
end;
$$;

-- Create metadata, initial version, optional global visibility and named grants
-- as one DB transaction. Missing recipients abort the object record and avoid
-- a partially shared upload. The caller removes uploaded bytes on any failure.
create function public.svc_create_document_with_shares(
  p_actor uuid, p_document uuid, p_title text, p_description text, p_category text,
  p_filename text, p_storage_key text, p_mime text, p_size bigint, p_sha256 text,
  p_share_emails text[], p_permission text, p_is_global boolean, p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created jsonb;
  v_grantee public.profiles%rowtype;
  v_result jsonb;
  v_email text;
  v_emails text[] := '{}'::text[];
  v_document public.documents%rowtype;
begin
  if p_actor is null or p_document is null or p_request is null or p_is_global is null
     or p_permission is null or p_permission not in ('read', 'edit')
     or coalesce(cardinality(p_share_emails), 0) > 20 then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  foreach v_email in array coalesce(p_share_emails, '{}'::text[]) loop
    v_email := lower(btrim(v_email));
    if char_length(v_email) not between 3 and 320
       or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      return jsonb_build_object('ok', false, 'code', 'invalid');
    end if;
    if not (v_email = any(v_emails)) then
      v_emails := array_append(v_emails, v_email);
    end if;
  end loop;

  -- Validate every recipient before creating the document or writing its bytes
  -- into metadata. A missing/self recipient fails the entire operation.
  foreach v_email in array v_emails loop
    select * into v_grantee from public.profiles where lower(email) = v_email;
    if not found then
      perform app.write_audit(p_actor, p_document, 'permission.grant', 'denied', p_request,
                              jsonb_build_object('reason', 'grantee_not_found'));
      return jsonb_build_object('ok', false, 'code', 'grantee_not_found');
    end if;
    if v_grantee.id = p_actor then
      perform app.write_audit(p_actor, p_document, 'permission.grant', 'denied', p_request,
                              jsonb_build_object('reason', 'cannot_grant_to_self'));
      return jsonb_build_object('ok', false, 'code', 'invalid');
    end if;
  end loop;

  v_created := public.svc_create_document(
    p_actor, p_document, p_title, p_description, p_category, p_filename,
    p_storage_key, p_mime, p_size, p_sha256, p_request);
  if coalesce((v_created ->> 'ok')::boolean, false) is not true then
    return v_created;
  end if;

  update public.documents set is_global = p_is_global
   where id = p_document and owner_id = p_actor and deleted_at is null
   returning * into v_document;
  if not found then
    raise exception 'newly created document missing after insert';
  end if;

  if p_is_global then
    perform app.write_audit(p_actor, p_document, 'document.visibility_change', 'success', p_request,
                            jsonb_build_object('is_global', true, 'source', 'upload'));
  end if;

  foreach v_email in array v_emails loop
    v_result := public.svc_grant_access(p_actor, p_document, v_email, p_permission, p_request);
    if coalesce((v_result ->> 'ok')::boolean, false) is not true then
      raise exception 'initial document grant failed';
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'document', app.document_json(v_document),
    'shared_with', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'email', p.email, 'display_name', p.display_name,
                                          'permission', g.permission)
                       order by p.display_name, p.email)
        from public.document_permissions g
        join public.profiles p on p.id = g.user_id
       where g.document_id = p_document and g.revoked_at is null
    ), '[]'::jsonb));
end;
$$;

-- Safe sender-name accessor for a caller who already has access to this document.
create function app.visible_document_owner_name(p_document uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name
    from public.documents d
    join public.profiles p on p.id = d.owner_id
   where d.id = p_document and d.deleted_at is null
     and app.access_level((select auth.uid()), d.id) is not null;
$$;
revoke all on function app.visible_document_owner_name(uuid) from public, anon, authenticated, service_role;
grant execute on function app.visible_document_owner_name(uuid) to authenticated, service_role;

create or replace function app.document_json(d public.documents)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', d.id, 'owner_id', d.owner_id,
    'owner_display_name', (select p.display_name from public.profiles p where p.id = d.owner_id),
    'title', d.title, 'description', d.description, 'category', d.category,
    'original_filename', d.original_filename, 'mime_type', d.mime_type,
    'size_bytes', d.size_bytes, 'sha256', d.sha256, 'current_version', d.current_version,
    'is_global', d.is_global, 'created_at', d.created_at, 'updated_at', d.updated_at
  );
$$;

create or replace function public.search_documents(
  p_query text default null, p_category text default null, p_owner text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_scope text default 'all', p_limit integer default 20, p_offset integer default 0
)
returns table (
  id uuid, title text, description text, category text, original_filename text,
  mime_type text, size_bytes bigint, current_version integer,
  owner_id uuid, owner_display_name text, owner_email text,
  my_access text, created_at timestamptz, updated_at timestamptz, total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select nullif(btrim(p_query), '') as txt, nullif(btrim(p_owner), '') as own
  ), esc as (
    select '%' || replace(replace(replace(txt, '\', '\\'), '%', '\%'), '_', '\_') || '%' as like_txt,
           '%' || replace(replace(replace(own, '\', '\\'), '%', '\%'), '_', '\_') || '%' as like_own,
           txt, own
    from q
  ), matched as (
    select d.id, d.title, d.description, d.category, d.original_filename, d.mime_type,
           d.size_bytes, d.current_version, d.owner_id,
           coalesce(p.display_name, app.visible_document_owner_name(d.id)) as owner_display_name,
           p.email as owner_email, app.my_access_level(d.id) as my_access,
           d.created_at, d.updated_at
      from public.documents d
      left join public.profiles p on p.id = d.owner_id
      cross join esc
     where d.deleted_at is null
       and (esc.txt is null or d.title ilike esc.like_txt escape '\'
            or d.original_filename ilike esc.like_txt escape '\')
       and (esc.own is null or p.display_name ilike esc.like_own escape '\'
            or p.email ilike esc.like_own escape '\'
            or app.visible_document_owner_name(d.id) ilike esc.like_own escape '\')
       and (p_category is null or d.category = p_category)
       and (p_from is null or d.created_at >= p_from)
       and (p_to is null or d.created_at < p_to)
       and (coalesce(p_scope, 'all') = 'all'
            or (p_scope = 'owned' and d.owner_id = (select auth.uid()))
            or (p_scope = 'shared' and d.owner_id <> (select auth.uid())))
  )
  select m.id, m.title, m.description, m.category, m.original_filename, m.mime_type,
         m.size_bytes, m.current_version, m.owner_id, m.owner_display_name, m.owner_email,
         m.my_access, m.created_at, m.updated_at, count(*) over () as total_count
    from matched m
   where m.my_access is not null
   order by m.updated_at desc, m.id
   limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.svc_search_share_recipients(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.svc_search_share_recipients(uuid, text, uuid) to service_role;
revoke all on function public.svc_create_document_with_shares(uuid, uuid, text, text, text, text, text, text, bigint, text, text[], text, boolean, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.svc_create_document_with_shares(uuid, uuid, text, text, text, text, text, text, bigint, text, text[], text, boolean, uuid)
  to service_role;

-- Re-assert the client RPC grant after CREATE OR REPLACE; this migration makes
-- no general-function execute grants and does not expose the internal helper.
revoke all on function public.search_documents(text, text, text, timestamptz, timestamptz, text, integer, integer)
  from public, anon;
grant execute on function public.search_documents(text, text, text, timestamptz, timestamptz, text, integer, integer)
  to authenticated;
