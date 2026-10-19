-- TrustVault migration 0700 — account uploads, global signed-in visibility,
-- read-only preview, and edit-only attachment downloads.
-- This is NOT anonymous/public internet access. Every caller must have a verified
-- Auth identity and a profile; the private Storage bucket remains unchanged.

alter table public.documents
  add column is_global boolean not null default false;

grant select (is_global) on public.documents to authenticated;

-- Any registered account may create and own its documents. This does not give
-- the account access to other users' private documents (including admins).
create or replace function public.svc_authorize_upload(p_actor uuid, p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if app.throttle_check(p_actor, p_request) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  if app.actor_role(p_actor) is null then
    perform app.write_audit(p_actor, null, 'document.upload', 'denied', p_request,
                            jsonb_build_object('reason', 'profile_missing'));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.svc_create_document(
  p_actor uuid, p_document uuid, p_title text, p_description text, p_category text,
  p_filename text, p_storage_key text, p_mime text, p_size bigint, p_sha256 text,
  p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents%rowtype;
begin
  if p_actor is null or p_document is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  if app.actor_role(p_actor) is null then
    perform app.write_audit(p_actor, null, 'document.upload', 'denied', p_request,
                            jsonb_build_object('reason', 'profile_missing'));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if p_storage_key is null
     or p_storage_key !~ ('^' || p_actor::text || '/' || p_document::text || '/[0-9a-f-]{36}$') then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  insert into public.documents (id, owner_id, title, description, original_filename,
                                storage_key, category, mime_type, size_bytes, sha256)
  values (p_document, p_actor, btrim(p_title), coalesce(p_description, ''), p_filename,
          p_storage_key, coalesce(p_category, 'general'), p_mime, p_size, p_sha256)
  returning * into d;

  insert into public.document_versions (document_id, version, storage_key, original_filename,
                                        mime_type, size_bytes, sha256, created_by)
  values (d.id, 1, d.storage_key, d.original_filename, d.mime_type, d.size_bytes, d.sha256, p_actor);

  perform app.write_audit(p_actor, d.id, 'document.upload', 'success', p_request,
                          jsonb_build_object('size_bytes', d.size_bytes, 'mime_type', d.mime_type,
                                             'sha256', d.sha256, 'category', d.category));
  return jsonb_build_object('ok', true, 'document', app.document_json(d));
end;
$$;

create or replace function app.access_level(p_actor uuid, p_doc uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_actor is null then null
    when d.owner_id = p_actor then 'owner'
    when exists (
      select 1 from public.document_permissions g
      where g.document_id = d.id and g.user_id = p_actor
        and g.revoked_at is null and g.permission = 'edit'
    ) then 'edit'
    when exists (
      select 1 from public.document_permissions g
      where g.document_id = d.id and g.user_id = p_actor
        and g.revoked_at is null and g.permission = 'read'
    ) then 'read'
    when d.is_global and exists (
      select 1 from public.profiles p where p.id = p_actor
    ) then 'read'
    else null
  end
  from public.documents d
  where d.id = p_doc and d.deleted_at is null;
$$;

create or replace function app.document_json(d public.documents)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', d.id,
    'owner_id', d.owner_id,
    'title', d.title,
    'description', d.description,
    'category', d.category,
    'original_filename', d.original_filename,
    'mime_type', d.mime_type,
    'size_bytes', d.size_bytes,
    'sha256', d.sha256,
    'current_version', d.current_version,
    'is_global', d.is_global,
    'created_at', d.created_at,
    'updated_at', d.updated_at
  );
$$;

-- The invoker's profile RLS must not hide globally visible documents. A LEFT
-- JOIN preserves their discoverability without publishing the owner's e-mail.
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
           p.display_name as owner_display_name, p.email as owner_email,
           app.my_access_level(d.id) as my_access, d.created_at, d.updated_at
      from public.documents d
      left join public.profiles p on p.id = d.owner_id
      cross join esc
     where d.deleted_at is null
       and (esc.txt is null or d.title ilike esc.like_txt escape '\'
            or d.original_filename ilike esc.like_txt escape '\')
       and (esc.own is null or p.display_name ilike esc.like_own escape '\'
            or p.email ilike esc.like_own escape '\')
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

create function public.svc_set_document_visibility(
  p_actor uuid, p_document uuid, p_is_global boolean, p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res text;
  d public.documents%rowtype;
begin
  if p_actor is null or p_document is null or p_is_global is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  v_res := app.authorize_or_deny(p_actor, p_document, 'owner', 'document.visibility_change', p_request, true);
  if v_res in ('not_found', 'forbidden', 'rate_limited') then
    return jsonb_build_object('ok', false, 'code', v_res);
  end if;

  update public.documents
     set is_global = p_is_global
   where id = p_document and deleted_at is null
   returning * into d;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  perform app.write_audit(p_actor, p_document, 'document.visibility_change', 'success', p_request,
                          jsonb_build_object('is_global', p_is_global));
  return jsonb_build_object('ok', true, 'document', app.document_json(d));
end;
$$;

-- Read-only grants may preview current content but cannot use the attachment
-- download endpoint. Preview still delivers bytes to a browser and cannot
-- prevent screenshots, printing, or saving through browser tooling.
create function public.svc_authorize_preview(p_actor uuid, p_document uuid, p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res text;
  d public.documents%rowtype;
begin
  if p_actor is null or p_document is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  v_res := app.authorize_or_deny(p_actor, p_document, 'read', 'document.preview', p_request, false);
  if v_res in ('not_found', 'forbidden', 'rate_limited') then
    return jsonb_build_object('ok', false, 'code', v_res);
  end if;

  select * into d from public.documents where id = p_document and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  perform app.write_audit(p_actor, p_document, 'document.preview', 'success', p_request,
                          jsonb_build_object('level', v_res, 'version', d.current_version));
  return jsonb_build_object('ok', true, 'storage_key', d.storage_key, 'mime_type', d.mime_type,
    'original_filename', d.original_filename, 'size_bytes', d.size_bytes,
    'sha256', d.sha256, 'version', d.current_version);
end;
$$;

-- Attachment downloads require edit-level access. Historical versions remain owner-only.
create or replace function public.svc_authorize_download(
  p_actor uuid, p_document uuid, p_version integer, p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res text;
  d public.documents%rowtype;
  dv public.document_versions%rowtype;
begin
  if p_actor is null or p_document is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  v_res := app.authorize_or_deny(p_actor, p_document,
    case when p_version is null then 'edit' else 'owner' end,
    'document.download', p_request, false);
  if v_res in ('not_found', 'forbidden', 'rate_limited') then
    return jsonb_build_object('ok', false, 'code', v_res);
  end if;

  select * into d from public.documents where id = p_document and deleted_at is null;
  if not found then
    perform app.write_audit(p_actor, p_document, 'document.download', 'denied', p_request,
                            jsonb_build_object('reason', 'no_access'));
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if p_version is null or p_version = d.current_version then
    perform app.write_audit(p_actor, p_document, 'document.download', 'success', p_request,
                            jsonb_build_object('level', v_res, 'version', d.current_version));
    return jsonb_build_object('ok', true, 'storage_key', d.storage_key, 'mime_type', d.mime_type,
      'original_filename', d.original_filename, 'size_bytes', d.size_bytes, 'sha256', d.sha256,
      'version', d.current_version);
  end if;

  select * into dv from public.document_versions where document_id = p_document and version = p_version;
  if not found then
    perform app.write_audit(p_actor, p_document, 'document.download', 'denied', p_request,
                            jsonb_build_object('reason', 'version_not_found', 'version', p_version));
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  perform app.write_audit(p_actor, p_document, 'document.download', 'success', p_request,
                          jsonb_build_object('level', v_res, 'version', dv.version));
  return jsonb_build_object('ok', true, 'storage_key', dv.storage_key, 'mime_type', dv.mime_type,
    'original_filename', dv.original_filename, 'size_bytes', dv.size_bytes, 'sha256', dv.sha256,
    'version', dv.version);
end;
$$;

create or replace function public.svc_record_event(
  p_actor uuid, p_document uuid, p_action text, p_outcome text, p_request uuid, p_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_request is null
     or (p_action, p_outcome) not in (
          ('auth.failure', 'denied'),
          ('document.download', 'error'),
          ('document.preview', 'error'),
          ('document.upload', 'error'),
          ('document.replace', 'error'),
          ('document.purge', 'success'),
          ('document.purge', 'error'),
          ('storage.orphan', 'error')) then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  perform app.write_audit(p_actor, p_document, p_action, p_outcome::public.audit_outcome,
                          p_request, coalesce(p_details, '{}'::jsonb));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.svc_set_document_visibility(uuid, uuid, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_set_document_visibility(uuid, uuid, boolean, uuid)
  to service_role;
revoke all on function public.svc_authorize_preview(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_authorize_preview(uuid, uuid, uuid)
  to service_role;
revoke all on function public.svc_authorize_download(uuid, uuid, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_authorize_download(uuid, uuid, integer, uuid)
  to service_role;
