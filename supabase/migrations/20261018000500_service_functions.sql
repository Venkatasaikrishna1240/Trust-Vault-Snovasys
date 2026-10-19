-- =====================================================================
-- TrustVault migration 0500 — trusted operations (svc_*), search, stats
--
-- How the pieces fit
--   browser --JWT--> Edge Function --(verified user id)--> svc_* function
--
--  * svc_* functions are SECURITY DEFINER and executable ONLY by
--    service_role (see the loop at the bottom + SECURITY TEST in
--    supabase/tests/db). A browser calling /rest/v1/rpc/svc_... gets
--    "permission denied".
--  * They take the actor as an explicit argument. The Edge Function fills it
--    from the VERIFIED auth token — never from the request body.
--  * Each function authorises, performs the change and writes its audit event
--    in ONE transaction. Denials are RETURNED (ok=false), not raised,
--    otherwise the rollback would erase the audit row of the denial itself.
--  * Unexpected errors ARE raised: the Edge Function then fails closed (5xx,
--    no file bytes).
--
-- Result convention: {"ok": true, ...} | {"ok": false, "code": "..."}
--   code: not_found | forbidden | invalid | conflict | rate_limited |
--         grantee_not_found
-- =====================================================================

-- ---------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------
create function app.level_satisfies(p_level text, p_required text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_required
    when 'read'  then p_level in ('owner', 'edit', 'read')
    when 'edit'  then p_level in ('owner', 'edit')
    when 'owner' then p_level = 'owner'
    else false
  end;
$$;

create function app.document_json(d public.documents)
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
    'created_at', d.created_at,
    'updated_at', d.updated_at
  );
$$;

-- Lock the document row, then re-evaluate access. Used for writes so that a
-- revocation that commits while we waited for the lock is honoured.
create function app.lock_document_level(p_actor uuid, p_document uuid)
returns text
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'   -- never queue forever behind a stuck transaction
as $$
begin
  perform 1 from public.documents d
   where d.id = p_document and d.deleted_at is null
   for update;
  return app.access_level(p_actor, p_document);
end;
$$;

-- THE authorisation gate for document-targeting operations.
--   returns  'owner' | 'edit' | 'read'            -> permitted (level held)
--            'not_found' | 'forbidden' | 'rate_limited' -> denied (already audited)
-- 'not_found' is returned both for missing documents and for documents the
-- actor may not see, so callers cannot probe which ids exist.
create function app.authorize_or_deny(
  p_actor    uuid,
  p_document uuid,
  p_required text,
  p_action   text,
  p_request  uuid,
  p_lock     boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level text;
begin
  if app.throttle_check(p_actor, p_request) then
    return 'rate_limited';
  end if;

  v_level := app.access_level(p_actor, p_document);
  if p_lock and v_level is not null and app.level_satisfies(v_level, p_required) then
    -- Re-check after taking the row lock (see app.lock_document_level).
    v_level := app.lock_document_level(p_actor, p_document);
  end if;

  if v_level is null then
    perform app.write_audit(p_actor, p_document, p_action, 'denied', p_request,
                            jsonb_build_object('reason', 'no_access'));
    return 'not_found';
  end if;

  if not app.level_satisfies(v_level, p_required) then
    perform app.write_audit(p_actor, p_document, p_action, 'denied', p_request,
                            jsonb_build_object('reason', 'insufficient_permission',
                                               'required', p_required));
    return 'forbidden';
  end if;

  return v_level;
end;
$$;

revoke all on function app.level_satisfies(text, text)                          from public, anon, authenticated, service_role;
revoke all on function app.document_json(public.documents)                      from public, anon, authenticated, service_role;
revoke all on function app.lock_document_level(uuid, uuid)                      from public, anon, authenticated, service_role;
revoke all on function app.authorize_or_deny(uuid, uuid, text, text, uuid, boolean) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Download authorisation (reads + downloads of file content)
-- Records the decision BEFORE any bytes are fetched. If the audit insert
-- fails the function raises and the Edge Function returns no content.
-- ---------------------------------------------------------------------
create function public.svc_authorize_download(
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

  -- Old versions are owner-only; the current version needs read access.
  v_res := app.authorize_or_deny(
    p_actor, p_document,
    case when p_version is null then 'read' else 'owner' end,
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
    return jsonb_build_object(
      'ok', true,
      'storage_key', d.storage_key,
      'mime_type', d.mime_type,
      'original_filename', d.original_filename,
      'size_bytes', d.size_bytes,
      'sha256', d.sha256,
      'version', d.current_version);
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
  return jsonb_build_object(
    'ok', true,
    'storage_key', dv.storage_key,
    'mime_type', dv.mime_type,
    'original_filename', dv.original_filename,
    'size_bytes', dv.size_bytes,
    'sha256', dv.sha256,
    'version', dv.version);
end;
$$;

-- ---------------------------------------------------------------------
-- Audited detail read (metadata + owner-only sharing list + version history)
-- ---------------------------------------------------------------------
create function public.svc_get_document(p_actor uuid, p_document uuid, p_request uuid)
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

  v_res := app.authorize_or_deny(p_actor, p_document, 'read', 'document.read', p_request, false);
  if v_res in ('not_found', 'forbidden', 'rate_limited') then
    return jsonb_build_object('ok', false, 'code', v_res);
  end if;

  select * into d from public.documents where id = p_document and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  perform app.write_audit(p_actor, p_document, 'document.read', 'success', p_request,
                          jsonb_build_object('level', v_res));

  return jsonb_build_object(
    'ok', true,
    'document', app.document_json(d),
    'my_access', v_res,
    'permissions', case when v_res = 'owner' then
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', g.id, 'user_id', g.user_id,
                 'display_name', p.display_name, 'email', p.email,
                 'permission', g.permission, 'granted_at', g.granted_at)
               order by g.granted_at)
        from public.document_permissions g
        join public.profiles p on p.id = g.user_id
        where g.document_id = d.id and g.revoked_at is null
      ), '[]'::jsonb)
      else null end,
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'version', v.version, 'original_filename', v.original_filename,
               'mime_type', v.mime_type, 'size_bytes', v.size_bytes,
               'sha256', v.sha256, 'created_by', v.created_by,
               'created_at', v.created_at)
             order by v.version desc)
      from public.document_versions v
      where v.document_id = d.id
    ), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------
-- Upload: step 1 (before the body is read) and step 2 (commit metadata)
-- ---------------------------------------------------------------------
create function public.svc_authorize_upload(p_actor uuid, p_request uuid)
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

  -- Only accounts with role 'owner' may create documents. Admins and viewers may not.
  if app.actor_role(p_actor) is distinct from 'owner' then
    perform app.write_audit(p_actor, null, 'document.upload', 'denied', p_request,
                            jsonb_build_object('reason', 'role_not_permitted'));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.svc_create_document(
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

  -- Re-check the role: it may have changed since step 1.
  if app.actor_role(p_actor) is distinct from 'owner' then
    perform app.write_audit(p_actor, null, 'document.upload', 'denied', p_request,
                            jsonb_build_object('reason', 'role_not_permitted'));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  -- Server convention: <owner id>/<document id>/<random id>. Enforced here too,
  -- so a bug in a caller cannot register a key that points somewhere else.
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

-- ---------------------------------------------------------------------
-- Edit: metadata, and content replacement (pre-check + commit)
-- ---------------------------------------------------------------------
create function public.svc_update_metadata(
  p_actor uuid, p_document uuid, p_title text, p_description text, p_category text, p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res text;
  d public.documents%rowtype;
  v_fields text[];
begin
  if p_actor is null or p_document is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  v_res := app.authorize_or_deny(p_actor, p_document, 'edit', 'document.edit', p_request, true);
  if v_res in ('not_found', 'forbidden', 'rate_limited') then
    return jsonb_build_object('ok', false, 'code', v_res);
  end if;

  if (p_title is null and p_description is null and p_category is null)
     or (p_title is not null and char_length(btrim(p_title)) not between 1 and 200)
     or (p_description is not null and char_length(p_description) > 2000)
     or (p_category is not null and p_category not in
         ('general', 'contract', 'salary_letter', 'technical_drawing', 'audit', 'customer_record')) then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  update public.documents
     set title       = coalesce(btrim(p_title), title),
         description = coalesce(p_description, description),
         category    = coalesce(p_category, category)
   where id = p_document and deleted_at is null
  returning * into d;

  v_fields := array_remove(array[
    case when p_title is not null then 'title' end,
    case when p_description is not null then 'description' end,
    case when p_category is not null then 'category' end], null);

  perform app.write_audit(p_actor, p_document, 'document.edit', 'success', p_request,
                          jsonb_build_object('fields', to_jsonb(v_fields), 'level', v_res));

  return jsonb_build_object('ok', true, 'document', app.document_json(d));
end;
$$;

-- Step 1 of content replacement: runs before the (large) body is read.
create function public.svc_authorize_edit(p_actor uuid, p_document uuid, p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res text;
begin
  if p_actor is null or p_document is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  v_res := app.authorize_or_deny(p_actor, p_document, 'edit', 'document.replace', p_request, false);
  if v_res in ('not_found', 'forbidden', 'rate_limited') then
    return jsonb_build_object('ok', false, 'code', v_res);
  end if;
  return jsonb_build_object('ok', true, 'owner_id',
    (select d.owner_id from public.documents d where d.id = p_document));
end;
$$;

-- Step 2: re-authorises UNDER A ROW LOCK, so an edit grant revoked while the
-- upload was in flight is honoured. The caller deletes the new object on failure.
create function public.svc_commit_replace(
  p_actor uuid, p_document uuid, p_storage_key text, p_filename text,
  p_mime text, p_size bigint, p_sha256 text, p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res text;
  d public.documents%rowtype;
  v_prev integer;
begin
  if p_actor is null or p_document is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  v_res := app.authorize_or_deny(p_actor, p_document, 'edit', 'document.replace', p_request, true);
  if v_res in ('not_found', 'forbidden', 'rate_limited') then
    return jsonb_build_object('ok', false, 'code', v_res);
  end if;

  select * into d from public.documents where id = p_document and deleted_at is null for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if p_storage_key is null
     or p_storage_key !~ ('^' || d.owner_id::text || '/' || d.id::text || '/[0-9a-f-]{36}$') then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  v_prev := d.current_version;

  insert into public.document_versions (document_id, version, storage_key, original_filename,
                                        mime_type, size_bytes, sha256, created_by)
  values (d.id, v_prev + 1, p_storage_key, p_filename, p_mime, p_size, p_sha256, p_actor);

  update public.documents
     set storage_key = p_storage_key, original_filename = p_filename, mime_type = p_mime,
         size_bytes = p_size, sha256 = p_sha256, current_version = v_prev + 1
   where id = d.id
  returning * into d;

  perform app.write_audit(p_actor, d.id, 'document.replace', 'success', p_request,
                          jsonb_build_object('from_version', v_prev, 'to_version', d.current_version,
                                             'size_bytes', p_size, 'sha256', p_sha256, 'level', v_res));

  return jsonb_build_object('ok', true, 'document', app.document_json(d));
end;
$$;

-- ---------------------------------------------------------------------
-- Delete (owner only). Policy: soft-delete the row (tombstone for audit
-- integrity), revoke every active grant, and hand the storage keys to the
-- Edge Function so the bytes are purged immediately.
-- ---------------------------------------------------------------------
create function public.svc_delete_document(p_actor uuid, p_document uuid, p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res text;
  v_keys jsonb;
  v_revoked integer;
begin
  if p_actor is null or p_document is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  v_res := app.authorize_or_deny(p_actor, p_document, 'owner', 'document.delete', p_request, true);
  if v_res in ('not_found', 'forbidden', 'rate_limited') then
    return jsonb_build_object('ok', false, 'code', v_res);
  end if;

  select coalesce(jsonb_agg(v.storage_key), '[]'::jsonb) into v_keys
    from public.document_versions v where v.document_id = p_document;

  update public.document_permissions
     set revoked_at = now(), revoked_by = p_actor
   where document_id = p_document and revoked_at is null;
  get diagnostics v_revoked = row_count;

  update public.documents set deleted_at = now() where id = p_document and deleted_at is null;

  perform app.write_audit(p_actor, p_document, 'document.delete', 'success', p_request,
                          jsonb_build_object('revoked_grants', v_revoked));

  return jsonb_build_object('ok', true, 'storage_keys', v_keys);
end;
$$;

-- ---------------------------------------------------------------------
-- Sharing (owner only). Row lock on the document serialises concurrent
-- grant / revoke / delete operations for that document.
-- ---------------------------------------------------------------------
create function public.svc_grant_access(
  p_actor uuid, p_document uuid, p_grantee_email text, p_permission text, p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res text;
  v_grantee public.profiles%rowtype;
  v_old public.document_permissions%rowtype;
  v_new public.document_permissions%rowtype;
  v_change text;
begin
  if p_actor is null or p_document is null or p_request is null
     or p_permission is null or p_permission not in ('read', 'edit')
     or p_grantee_email is null or char_length(btrim(p_grantee_email)) not between 3 and 320 then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  v_res := app.authorize_or_deny(p_actor, p_document, 'owner', 'permission.grant', p_request, true);
  if v_res in ('not_found', 'forbidden', 'rate_limited') then
    return jsonb_build_object('ok', false, 'code', v_res);
  end if;

  select * into v_grantee from public.profiles where lower(email) = lower(btrim(p_grantee_email));
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

  select * into v_old from public.document_permissions
   where document_id = p_document and user_id = v_grantee.id and revoked_at is null;

  if found and v_old.permission::text = p_permission then
    v_new := v_old;
    v_change := 'unchanged';
  else
    if found then
      update public.document_permissions
         set revoked_at = now(), revoked_by = p_actor
       where id = v_old.id;
      v_change := case when p_permission = 'edit' then 'upgraded' else 'downgraded' end;
    else
      v_change := 'created';
    end if;

    insert into public.document_permissions (document_id, user_id, permission, granted_by)
    values (p_document, v_grantee.id, p_permission::public.doc_permission, p_actor)
    returning * into v_new;
  end if;

  perform app.write_audit(p_actor, p_document, 'permission.grant', 'success', p_request,
                          jsonb_build_object('grantee_id', v_grantee.id, 'permission', p_permission,
                                             'change', v_change));

  return jsonb_build_object(
    'ok', true,
    'change', v_change,
    'permission', jsonb_build_object(
      'id', v_new.id, 'document_id', v_new.document_id, 'user_id', v_new.user_id,
      'permission', v_new.permission, 'granted_at', v_new.granted_at),
    'grantee', jsonb_build_object(
      'id', v_grantee.id, 'display_name', v_grantee.display_name, 'email', v_grantee.email));
end;
$$;

create function public.svc_revoke_access(
  p_actor uuid, p_document uuid, p_grantee uuid, p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res text;
  v_perm public.document_permissions%rowtype;
begin
  if p_actor is null or p_document is null or p_grantee is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  v_res := app.authorize_or_deny(p_actor, p_document, 'owner', 'permission.revoke', p_request, true);
  if v_res in ('not_found', 'forbidden', 'rate_limited') then
    return jsonb_build_object('ok', false, 'code', v_res);
  end if;

  update public.document_permissions
     set revoked_at = now(), revoked_by = p_actor
   where document_id = p_document and user_id = p_grantee and revoked_at is null
  returning * into v_perm;

  if not found then
    perform app.write_audit(p_actor, p_document, 'permission.revoke', 'denied', p_request,
                            jsonb_build_object('reason', 'no_active_grant'));
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- From this commit onwards every svc_authorize_* call for p_grantee is denied.
  perform app.write_audit(p_actor, p_document, 'permission.revoke', 'success', p_request,
                          jsonb_build_object('grantee_id', p_grantee, 'permission', v_perm.permission));

  return jsonb_build_object('ok', true, 'permission_id', v_perm.id);
end;
$$;

-- ---------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------
-- Admins may switch OTHER non-admin accounts between 'owner' and 'viewer'.
-- They cannot touch their own role, cannot touch other admins and cannot
-- create admins through the API (admins are provisioned out-of-band).
create function public.svc_admin_set_role(
  p_actor uuid, p_target uuid, p_role text, p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
  v_from public.user_role;
begin
  if p_actor is null or p_target is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if app.throttle_check(p_actor, p_request) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  if app.actor_role(p_actor) is distinct from 'admin' then
    perform app.write_audit(p_actor, null, 'admin.role_change', 'denied', p_request,
                            jsonb_build_object('reason', 'not_admin', 'target_id', p_target));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if p_role is null or p_role not in ('owner', 'viewer') then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  if p_target = p_actor then
    perform app.write_audit(p_actor, null, 'admin.role_change', 'denied', p_request,
                            jsonb_build_object('reason', 'cannot_change_own_role'));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select * into v_target from public.profiles where id = p_target for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_target.role = 'admin' then
    perform app.write_audit(p_actor, null, 'admin.role_change', 'denied', p_request,
                            jsonb_build_object('reason', 'target_is_admin', 'target_id', p_target));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  v_from := v_target.role;
  update public.profiles set role = p_role::public.user_role where id = p_target
  returning * into v_target;

  perform app.write_audit(p_actor, null, 'admin.role_change', 'success', p_request,
                          jsonb_build_object('target_id', p_target, 'from', v_from, 'to', p_role));

  return jsonb_build_object('ok', true, 'user', jsonb_build_object(
    'id', v_target.id, 'email', v_target.email,
    'display_name', v_target.display_name, 'role', v_target.role));
end;
$$;

-- Read-only audit query for admins (the only API over the full trail).
create function public.svc_admin_query_audit(
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
   where (p_f_actor is null    or e.actor_id = p_f_actor)
     and (p_f_document is null or e.document_id = p_f_document)
     and (p_f_action is null   or e.action = p_f_action)
     and (p_f_outcome is null  or e.outcome::text = p_f_outcome)
     and (p_from is null       or e.occurred_at >= p_from)
     and (p_to is null         or e.occurred_at <  p_to);

  select coalesce(jsonb_agg(x.j order by x.seq desc), '[]'::jsonb) into v_events
  from (
    select e.seq, jsonb_build_object(
             'seq', e.seq, 'id', e.id, 'occurred_at', e.occurred_at,
             'actor_id', e.actor_id, 'actor_email', p.email,
             'document_id', e.document_id, 'action', e.action,
             'outcome', e.outcome, 'request_id', e.request_id,
             'details', e.details, 'event_hash', e.event_hash) as j
      from public.audit_events e
      left join public.profiles p on p.id = e.actor_id
     where (p_f_actor is null    or e.actor_id = p_f_actor)
       and (p_f_document is null or e.document_id = p_f_document)
       and (p_f_action is null   or e.action = p_f_action)
       and (p_f_outcome is null  or e.outcome::text = p_f_outcome)
       and (p_from is null       or e.occurred_at >= p_from)
       and (p_to is null         or e.occurred_at <  p_to)
     order by e.seq desc
     limit least(greatest(coalesce(p_limit, 25), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  ) x;

  -- The query itself is an auditable administrative action.
  perform app.write_audit(p_actor, null, 'admin.audit_query', 'success', p_request,
                          jsonb_build_object('returned', jsonb_array_length(v_events)));

  select * into v_head from public.audit_chain_head where id = 1;

  return jsonb_build_object('ok', true, 'events', v_events, 'total', v_total,
                            'head', jsonb_build_object('seq', v_head.last_seq, 'hash', v_head.last_hash));
end;
$$;

-- Walks the whole chain and recomputes every hash. O(n): meant for on-demand
-- integrity checks, not for every page view.
create function public.svc_verify_audit_chain(p_actor uuid, p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_bad bigint;
  v_checked bigint;
  v_head public.audit_chain_head%rowtype;
  v_max_seq bigint;
  v_max_hash text;
  v_head_ok boolean;
begin
  if p_actor is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if app.actor_role(p_actor) is distinct from 'admin' then
    perform app.write_audit(p_actor, null, 'admin.audit_verify', 'denied', p_request,
                            jsonb_build_object('reason', 'not_admin'));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  with e as (
    select x.*,
           lag(x.event_hash) over (order by x.seq) as expected_prev,
           lag(x.seq)        over (order by x.seq) as prev_seq
      from public.audit_events x
  )
  select min(e.seq) into v_first_bad
  from e
  where e.event_hash <> app.audit_event_hash(e.seq, e.prev_hash, e.occurred_at, e.actor_id,
                                             e.document_id, e.action, e.outcome, e.request_id, e.details)
     or e.prev_hash  <> coalesce(e.expected_prev, repeat('0', 64))
     or (e.prev_seq is not null and e.seq <> e.prev_seq + 1)
     or (e.prev_seq is null and e.seq <> 1);

  select count(*), max(seq) into v_checked, v_max_seq from public.audit_events;
  select event_hash into v_max_hash from public.audit_events where seq = v_max_seq;
  select * into v_head from public.audit_chain_head where id = 1;

  v_head_ok := v_head.last_seq = coalesce(v_max_seq, 0)
           and v_head.last_hash = coalesce(v_max_hash, repeat('0', 64));

  perform app.write_audit(p_actor, null, 'admin.audit_verify', 'success', p_request,
                          jsonb_build_object('checked', v_checked,
                                             'valid', v_first_bad is null and v_head_ok));

  return jsonb_build_object('ok', true,
    'valid', v_first_bad is null and v_head_ok,
    'checked', v_checked,
    'first_broken_seq', v_first_bad,
    'head_matches', v_head_ok);
end;
$$;

-- ---------------------------------------------------------------------
-- Trusted audit writes for events only the Edge Function can observe
-- (identity failures, storage errors, purge results). Only specific
-- action/outcome pairs are accepted so this cannot be used to forge
-- success events such as 'document.download' / success.
-- ---------------------------------------------------------------------
create function public.svc_record_event(
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

-- ---------------------------------------------------------------------
-- Client-facing read helpers. SECURITY INVOKER: they run as the caller, so
-- RLS on documents/profiles applies. The explicit my_access_level() predicate
-- is a deliberate second layer in case a policy is ever weakened by mistake.
-- ---------------------------------------------------------------------
create function public.search_documents(
  p_query    text        default null,
  p_category text        default null,
  p_owner    text        default null,
  p_from     timestamptz default null,
  p_to       timestamptz default null,
  p_scope    text        default 'all',
  p_limit    integer     default 20,
  p_offset   integer     default 0
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
    select
      nullif(btrim(p_query), '') as txt,
      nullif(btrim(p_owner), '') as own
  ),
  esc as (
    select
      '%' || replace(replace(replace(txt, '\', '\\'), '%', '\%'), '_', '\_') || '%' as like_txt,
      '%' || replace(replace(replace(own, '\', '\\'), '%', '\%'), '_', '\_') || '%' as like_own,
      txt, own
    from q
  ),
  matched as (
    select d.id, d.title, d.description, d.category, d.original_filename, d.mime_type,
           d.size_bytes, d.current_version, d.owner_id,
           p.display_name as owner_display_name, p.email as owner_email,
           app.my_access_level(d.id) as my_access,
           d.created_at, d.updated_at
      from public.documents d
      join public.profiles p on p.id = d.owner_id
      cross join esc
     where d.deleted_at is null
       and (esc.txt is null
            or d.title ilike esc.like_txt escape '\'
            or d.original_filename ilike esc.like_txt escape '\')
       and (esc.own is null
            or p.display_name ilike esc.like_own escape '\'
            or p.email ilike esc.like_own escape '\')
       and (p_category is null or d.category = p_category)
       and (p_from is null or d.created_at >= p_from)
       and (p_to is null or d.created_at < p_to)
       and (coalesce(p_scope, 'all') = 'all'
            or (p_scope = 'owned'  and d.owner_id = (select auth.uid()))
            or (p_scope = 'shared' and d.owner_id <> (select auth.uid())))
  )
  select m.id, m.title, m.description, m.category, m.original_filename, m.mime_type,
         m.size_bytes, m.current_version, m.owner_id, m.owner_display_name, m.owner_email,
         m.my_access, m.created_at, m.updated_at,
         count(*) over () as total_count
    from matched m
   where m.my_access is not null
   order by m.updated_at desc, m.id
   limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create function public.dashboard_stats()
returns table (owned_count bigint, shared_count bigint, owned_bytes bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (where d.owner_id = (select auth.uid())),
    count(*) filter (where d.owner_id <> (select auth.uid())),
    coalesce(sum(d.size_bytes) filter (where d.owner_id = (select auth.uid())), 0)::bigint
  from public.documents d
  where d.deleted_at is null and app.my_access_level(d.id) is not null;
$$;

revoke all on function public.search_documents(text, text, text, timestamptz, timestamptz, text, integer, integer)
  from public, anon;
grant execute on function public.search_documents(text, text, text, timestamptz, timestamptz, text, integer, integer)
  to authenticated;
revoke all on function public.dashboard_stats() from public, anon;
grant execute on function public.dashboard_stats() to authenticated;

-- ---------------------------------------------------------------------
-- Lock every svc_* function down to service_role. Doing this in a loop (and
-- asserting the result) means a function added later cannot be forgotten.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'svc\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
