-- TrustVault migration — trusted activity details and post-verification delivery events.
-- Successful preview/download events are written only after the Edge Function
-- fetched the private object and verified its size and SHA-256 digest.

create or replace function public.svc_authorize_preview(p_actor uuid, p_document uuid, p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level text;
  d public.documents%rowtype;
begin
  if p_actor is null or p_document is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  v_level := app.authorize_or_deny(p_actor, p_document, 'read', 'document.preview', p_request, false);
  if v_level in ('not_found', 'forbidden', 'rate_limited') then
    return jsonb_build_object('ok', false, 'code', v_level);
  end if;

  select * into d from public.documents where id = p_document and deleted_at is null;
  if not found then
    perform app.write_audit(p_actor, p_document, 'document.preview', 'denied', p_request,
                            jsonb_build_object('reason', 'no_access'));
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'storage_key', d.storage_key, 'mime_type', d.mime_type,
    'original_filename', d.original_filename, 'size_bytes', d.size_bytes,
    'sha256', d.sha256, 'version', d.current_version);
end;
$$;

create or replace function public.svc_authorize_download(
  p_actor uuid, p_document uuid, p_version integer, p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level text;
  d public.documents%rowtype;
  dv public.document_versions%rowtype;
begin
  if p_actor is null or p_document is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  v_level := app.authorize_or_deny(p_actor, p_document, 'edit', 'document.download', p_request, false);
  if v_level in ('not_found', 'forbidden', 'rate_limited') then
    return jsonb_build_object('ok', false, 'code', v_level);
  end if;

  select * into d from public.documents where id = p_document and deleted_at is null;
  if not found then
    perform app.write_audit(p_actor, p_document, 'document.download', 'denied', p_request,
                            jsonb_build_object('reason', 'no_access'));
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if p_version is null then
    p_version := d.current_version;
  end if;
  select * into dv from public.document_versions
   where document_id = p_document and version = p_version;
  if not found then
    perform app.write_audit(p_actor, p_document, 'document.download', 'denied', p_request,
                            jsonb_build_object('reason', 'version_not_found', 'version', p_version));
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'storage_key', dv.storage_key, 'mime_type', dv.mime_type,
    'original_filename', dv.original_filename, 'size_bytes', dv.size_bytes,
    'sha256', dv.sha256, 'version', dv.version);
end;
$$;

-- Final authorization check and audit occur after the private bytes have been
-- fetched and verified. If this audit/check fails, the Edge Function returns
-- no bytes. A completed server response cannot prove that a browser saved it.
create function public.svc_record_document_delivery(
  p_actor uuid, p_document uuid, p_action text, p_version integer, p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level text;
  v_required text;
  d public.documents%rowtype;
  dv public.document_versions%rowtype;
begin
  if p_actor is null or p_document is null or p_request is null
     or p_action is null or p_version is null or p_version < 1
     or p_action not in ('document.preview', 'document.download') then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  v_required := case when p_action = 'document.preview' then 'read' else 'edit' end;
  v_level := app.access_level(p_actor, p_document);
  if v_level is null or not app.level_satisfies(v_level, v_required) then
    perform app.write_audit(p_actor, p_document, p_action, 'denied', p_request,
                            jsonb_build_object('reason', 'access_changed_before_response',
                                               'required', v_required));
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select * into d from public.documents where id = p_document and deleted_at is null;
  if not found then
    perform app.write_audit(p_actor, p_document, p_action, 'denied', p_request,
                            jsonb_build_object('reason', 'document_deleted_before_response'));
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  select * into dv from public.document_versions
   where document_id = p_document and version = p_version;
  if not found or (p_action = 'document.preview' and d.current_version <> p_version) then
    perform app.write_audit(p_actor, p_document, p_action, 'denied', p_request,
                            jsonb_build_object('reason', 'version_changed_before_response',
                                               'version', p_version));
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  perform app.write_audit(p_actor, p_document, p_action, 'success', p_request,
                          jsonb_build_object('level', v_level, 'version', p_version,
                                             'document_name', dv.original_filename,
                                             'owner_id', d.owner_id,
                                             'response_prepared', true));
  return jsonb_build_object('ok', true);
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

create or replace function public.svc_admin_query_audit(
  p_actor uuid,
  p_f_actor uuid, p_f_document uuid, p_f_action text, p_f_outcome text,
  p_from timestamptz, p_to timestamptz,
  p_limit integer, p_offset integer, p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_events jsonb;
  v_total bigint;
  v_head public.audit_chain_head%rowtype;
begin
  if p_actor is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if app.throttle_check(p_actor, p_request) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  if app.actor_role(p_actor) is distinct from 'admin' then
    perform app.write_audit(p_actor, null, 'admin.audit_query', 'denied', p_request,
                            jsonb_build_object('reason', 'not_admin'));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_f_outcome is not null and p_f_outcome not in ('success', 'denied', 'error') then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  select count(*) into v_total
    from public.audit_events e
   where (p_f_actor is null or e.actor_id = p_f_actor)
     and (p_f_document is null or e.document_id = p_f_document)
     and (p_f_action is null or e.action = p_f_action)
     and (p_f_outcome is null or e.outcome::text = p_f_outcome)
     and (p_from is null or e.occurred_at >= p_from)
     and (p_to is null or e.occurred_at < p_to);

  select coalesce(jsonb_agg(x.j order by x.seq desc), '[]'::jsonb) into v_events
  from (
    select e.seq, jsonb_build_object(
             'seq', e.seq, 'id', e.id, 'occurred_at', e.occurred_at,
             'actor_id', e.actor_id, 'actor_email', actor.email,
             'actor_display_name', actor.display_name,
             'document_id', e.document_id,
             'document_name', coalesce(
               e.details ->> 'document_name', version_at_event.original_filename,
               d.original_filename, d.title),
             'document_owner_id', d.owner_id,
             'owner_email', owner_profile.email,
             'owner_display_name', owner_profile.display_name,
             'affected_user_id', coalesce(e.details ->> 'grantee_id', e.details ->> 'target_id',
               case when e.action in ('document.preview', 'document.download')
                          and e.actor_id is distinct from d.owner_id then e.actor_id::text end),
             'affected_email', affected.email,
             'affected_display_name', affected.display_name,
             'permission_type', coalesce(e.details ->> 'permission', e.details ->> 'level'),
             'action', e.action, 'outcome', e.outcome, 'request_id', e.request_id,
             'details', e.details, 'event_hash', e.event_hash) as j
      from public.audit_events e
      left join public.profiles actor on actor.id = e.actor_id
      left join public.documents d on d.id = e.document_id
      left join public.profiles owner_profile on owner_profile.id = d.owner_id
      left join lateral (
        select dv.original_filename
          from public.document_versions dv
         where dv.document_id = e.document_id and dv.created_at <= e.occurred_at
         order by dv.created_at desc, dv.version desc
         limit 1
      ) version_at_event on true
      left join public.profiles affected
        on affected.id::text = coalesce(e.details ->> 'grantee_id', e.details ->> 'target_id',
          case when e.action in ('document.preview', 'document.download')
                     and e.actor_id is distinct from d.owner_id then e.actor_id::text end)
     where (p_f_actor is null or e.actor_id = p_f_actor)
       and (p_f_document is null or e.document_id = p_f_document)
       and (p_f_action is null or e.action = p_f_action)
       and (p_f_outcome is null or e.outcome::text = p_f_outcome)
       and (p_from is null or e.occurred_at >= p_from)
       and (p_to is null or e.occurred_at < p_to)
     order by e.seq desc
     limit least(greatest(coalesce(p_limit, 25), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  ) x;

  perform app.write_audit(p_actor, null, 'admin.audit_query', 'success', p_request,
                          jsonb_build_object('returned', jsonb_array_length(v_events)));
  select * into v_head from public.audit_chain_head where id = 1;
  return jsonb_build_object('ok', true, 'events', v_events, 'total', v_total,
                            'head', jsonb_build_object('seq', v_head.last_seq, 'hash', v_head.last_hash));
end;
$$;

revoke all on function public.svc_authorize_preview(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.svc_authorize_preview(uuid, uuid, uuid) to service_role;
revoke all on function public.svc_authorize_download(uuid, uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.svc_authorize_download(uuid, uuid, integer, uuid) to service_role;
revoke all on function public.svc_record_document_delivery(uuid, uuid, text, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.svc_record_document_delivery(uuid, uuid, text, integer, uuid) to service_role;
revoke all on function public.svc_record_event(uuid, uuid, text, text, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.svc_record_event(uuid, uuid, text, text, uuid, jsonb) to service_role;
revoke all on function public.svc_admin_query_audit(uuid, uuid, uuid, text, text, timestamptz, timestamptz, integer, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.svc_admin_query_audit(uuid, uuid, uuid, text, text, timestamptz, timestamptz, integer, integer, uuid)
  to service_role;
