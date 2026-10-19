-- TrustVault migration 0900 — let document editors download older versions.
-- Read-only grants remain preview-only. Every version download still passes
-- through this authorization + audit function before the Edge Function reads
-- any bytes from private Storage.

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

  -- Owners and current edit-grantees may download current or historical bytes.
  -- Read grants can preview current content but cannot download any version.
  v_res := app.authorize_or_deny(p_actor, p_document, 'edit', 'document.download', p_request, false);
  if v_res in ('not_found', 'forbidden', 'rate_limited') then
    return jsonb_build_object('ok', false, 'code', v_res);
  end if;

  select * into d from public.documents where id = p_document and deleted_at is null;
  if not found then
    perform app.write_audit(p_actor, p_document, 'document.download', 'denied', p_request,
                            jsonb_build_object('reason', 'no_access'));
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if p_version is null then
    perform app.write_audit(p_actor, p_document, 'document.download', 'success', p_request,
                            jsonb_build_object('level', v_res, 'version', d.current_version));
    return jsonb_build_object('ok', true, 'storage_key', d.storage_key, 'mime_type', d.mime_type,
      'original_filename', d.original_filename, 'size_bytes', d.size_bytes,
      'sha256', d.sha256, 'version', d.current_version);
  end if;

  select * into dv from public.document_versions
   where document_id = p_document and version = p_version;
  if not found then
    perform app.write_audit(p_actor, p_document, 'document.download', 'denied', p_request,
                            jsonb_build_object('reason', 'version_not_found', 'version', p_version));
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  perform app.write_audit(p_actor, p_document, 'document.download', 'success', p_request,
                          jsonb_build_object('level', v_res, 'version', dv.version));
  return jsonb_build_object('ok', true, 'storage_key', dv.storage_key, 'mime_type', dv.mime_type,
    'original_filename', dv.original_filename, 'size_bytes', dv.size_bytes,
    'sha256', dv.sha256, 'version', dv.version);
end;
$$;

revoke all on function public.svc_authorize_download(uuid, uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.svc_authorize_download(uuid, uuid, integer, uuid)
  to service_role;
