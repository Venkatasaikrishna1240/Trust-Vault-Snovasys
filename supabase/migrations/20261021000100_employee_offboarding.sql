-- Employee offboarding: database-enforced account deactivation and guarded
-- Auth-user removal. Document ownership and audit history are retained.

alter table public.profiles
  add column is_active boolean not null default true;

create or replace function app.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.email is distinct from old.email
       or new.is_active is distinct from old.is_active then
      raise exception 'protected profile fields cannot be changed by clients'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- This record has no profile/Auth foreign keys so a partial Auth deletion can
-- be retried and completed without erasing the removal state.
create table public.account_offboarding (
  user_id uuid primary key,
  email_snapshot text not null,
  display_name_snapshot text not null,
  role_snapshot public.user_role not null,
  status text not null check (status in ('removal_pending', 'removed')),
  requested_by uuid not null,
  requested_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  constraint account_offboarding_completion
    check ((status = 'removed') = (completed_at is not null))
);
alter table public.account_offboarding enable row level security;
revoke all on public.account_offboarding from public, anon, authenticated, service_role;

create or replace function app.actor_role(p_actor uuid)
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
    from public.profiles p
   where p.id = p_actor and p.is_active;
$$;

create function app.actor_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.is_active
  );
$$;
revoke all on function app.actor_is_active() from public, anon, authenticated, service_role;
grant execute on function app.actor_is_active() to authenticated, service_role;

create or replace function app.access_level(p_actor uuid, p_doc uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (
      select 1 from public.profiles p where p.id = p_actor and p.is_active
    ) then null
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
    when d.is_global then 'read'
    else null
  end
    from public.documents d
   where p_actor is not null and d.id = p_doc and d.deleted_at is null;
$$;

create or replace function app.is_document_owner(p_doc uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.actor_is_active()
     and exists (
       select 1 from public.documents d
        where d.id = p_doc and d.owner_id = (select auth.uid())
     );
$$;

create or replace function app.shares_document_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.actor_is_active() and exists (
    select 1
      from public.documents d
      join public.document_permissions g
        on g.document_id = d.id and g.revoked_at is null
     where d.deleted_at is null
       and (
         (d.owner_id = p_other and g.user_id = (select auth.uid()))
         or
         (d.owner_id = (select auth.uid()) and g.user_id = p_other)
       )
  );
$$;

-- Preserve self-profile visibility so a stale client can learn that the
-- account is inactive and sign out. No protected data policy uses this
-- exception; document access helpers reject inactive actors.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or app.is_admin()
    or (app.actor_is_active() and app.shares_document_with(id))
  );

drop policy profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and app.actor_is_active())
  with check (id = (select auth.uid()) and app.actor_is_active());

drop policy documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated
  using (deleted_at is null and app.my_access_level(id) is not null);

drop policy document_versions_select on public.document_versions;
create policy document_versions_select on public.document_versions
  for select to authenticated
  using (app.actor_is_active() and app.my_access_level(document_id) is not null);

drop policy document_permissions_select on public.document_permissions;
create policy document_permissions_select on public.document_permissions
  for select to authenticated
  using (
    app.actor_is_active()
    and (user_id = (select auth.uid()) or app.is_document_owner(document_id))
  );

drop policy audit_events_select on public.audit_events;
create policy audit_events_select on public.audit_events
  for select to authenticated
  using (
    app.actor_is_active()
    and (
      app.is_admin()
      or actor_id = (select auth.uid())
      or (document_id is not null and app.is_document_owner(document_id))
    )
  );

drop policy user_notifications_select_own on public.user_notifications;
create policy user_notifications_select_own on public.user_notifications
  for select to authenticated
  using (app.actor_is_active() and recipient_id = (select auth.uid()));

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null or not app.actor_is_active() then
    raise exception 'active account required' using errcode = '42501';
  end if;
  if p_ids is not null and cardinality(p_ids) > 100 then
    raise exception 'too many notification IDs' using errcode = '22023';
  end if;

  update public.user_notifications n
     set read_at = clock_timestamp()
   where n.recipient_id = (select auth.uid())
     and n.read_at is null
     and (p_ids is null or n.id = any(p_ids));
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;
revoke all on function public.mark_notifications_read(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- Defence in depth for every grant creation path, including upload-time
-- grants. Existing permissions to a deactivated account are revoked below.
create function app.reject_inactive_grantee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.revoked_at is null and not exists (
    select 1 from public.profiles p where p.id = new.user_id and p.is_active
  ) then
    raise exception 'recipient is inactive or unavailable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger document_permissions_reject_inactive_grantee
  before insert or update on public.document_permissions
  for each row execute function app.reject_inactive_grantee();
revoke all on function app.reject_inactive_grantee() from public, anon, authenticated, service_role;

create or replace function public.svc_search_share_recipients(
  p_actor uuid, p_query text, p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipients jsonb;
  v_query text;
  v_pattern text;
begin
  v_query := lower(btrim(p_query));
  if p_actor is null or p_request is null or v_query is null
     or char_length(v_query) not between 3 and 100 then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if app.actor_role(p_actor) is null then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if app.throttle_check(p_actor, p_request) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  if (
    select count(*) from public.audit_events e
     where e.actor_id = p_actor and e.action = 'permission.recipient_search'
       and e.occurred_at > clock_timestamp() - interval '1 minute'
  ) >= 30 then
    if not exists (
      select 1 from public.audit_events e
       where e.actor_id = p_actor and e.action = 'request.rate_limited'
         and e.occurred_at > clock_timestamp() - interval '1 minute'
    ) then
      perform app.write_audit(p_actor, null, 'request.rate_limited', 'denied', p_request,
                              jsonb_build_object('reason', 'recipient_search_limit'));
    end if;
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  v_pattern := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  select coalesce(jsonb_agg(
      jsonb_build_object('id', r.id, 'email', r.email, 'display_name', r.display_name)
      order by r.display_name, r.email
    ), '[]'::jsonb)
    into v_recipients
    from (
      select p.id, p.email, p.display_name
        from public.profiles p
       where p.id <> p_actor and p.is_active
         and (lower(p.email) = v_query
           or lower(p.display_name) like v_pattern escape '\'
           or lower(split_part(p.email, '@', 1)) like v_pattern escape '\')
       order by p.display_name, p.email
       limit 20
    ) r;

  perform app.write_audit(p_actor, null, 'permission.recipient_search', 'success', p_request,
                          jsonb_build_object('query_length', char_length(v_query),
                                             'results', jsonb_array_length(v_recipients)));
  return jsonb_build_object('ok', true, 'recipients', v_recipients);
end;
$$;

revoke all on function public.svc_search_share_recipients(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_search_share_recipients(uuid, text, uuid) to service_role;

create function public.svc_admin_list_accounts(p_actor uuid, p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_users jsonb;
begin
  if p_actor is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if app.actor_role(p_actor) is distinct from 'admin' then
    perform app.write_audit(p_actor, null, 'admin.account_list', 'denied', p_request,
                            jsonb_build_object('reason', 'not_admin'));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select coalesce(jsonb_agg(x.user_json order by x.created_at), '[]'::jsonb)
    into v_users
    from (
      select p.created_at,
             jsonb_build_object(
               'id', p.id, 'email', p.email, 'display_name', p.display_name,
               'role', p.role, 'is_active', p.is_active, 'created_at', p.created_at,
               'owned_documents', (
                 select count(*) from public.documents d where d.owner_id = p.id
               ),
               'active_incoming_grants', (
                 select count(*) from public.document_permissions g
                  where g.user_id = p.id and g.revoked_at is null
               ),
               'created_versions', (
                 select count(*) from public.document_versions v where v.created_by = p.id
               ),
               'issued_grants', (
                 select count(*) from public.document_permissions g where g.granted_by = p.id
               )
             ) as user_json
        from public.profiles p
    ) x;

  perform app.write_audit(p_actor, null, 'admin.account_list', 'success', p_request, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'users', v_users);
end;
$$;

create function public.svc_admin_deactivate_account(
  p_actor uuid, p_target uuid, p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
  v_grant record;
  v_revoked integer := 0;
begin
  if p_actor is null or p_target is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if app.actor_role(p_actor) is distinct from 'admin' then
    perform app.write_audit(p_actor, null, 'admin.account_deactivate', 'denied', p_request,
                            jsonb_build_object('reason', 'not_admin', 'target_id', p_target));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_target = p_actor then
    perform app.write_audit(p_actor, null, 'admin.account_deactivate', 'denied', p_request,
                            jsonb_build_object('reason', 'cannot_deactivate_self'));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select * into v_target from public.profiles where id = p_target for update;
  if not found then
    perform app.write_audit(p_actor, null, 'admin.account_deactivate', 'denied', p_request,
                            jsonb_build_object('reason', 'target_not_found', 'target_id', p_target));
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_target.role = 'admin' then
    perform app.write_audit(p_actor, null, 'admin.account_deactivate', 'denied', p_request,
                            jsonb_build_object('reason', 'target_is_admin', 'target_id', p_target));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  update public.profiles set is_active = false where id = p_target;
  for v_grant in
    update public.document_permissions
       set revoked_at = coalesce(revoked_at, clock_timestamp()), revoked_by = p_actor
     where user_id = p_target and revoked_at is null
     returning document_id, permission
  loop
    v_revoked := v_revoked + 1;
    perform app.write_audit(
      p_actor, v_grant.document_id, 'permission.revoke', 'success', p_request,
      jsonb_build_object('grantee_id', p_target, 'permission', v_grant.permission,
                         'reason', 'account_deactivated')
    );
  end loop;

  perform app.write_audit(
    p_actor, null, 'admin.account_deactivate', 'success', p_request,
    jsonb_build_object('target_id', p_target, 'already_inactive', not v_target.is_active,
                       'revoked_grants', v_revoked)
  );
  return jsonb_build_object('ok', true, 'is_active', false, 'revoked_grants', v_revoked);
end;
$$;

create function public.svc_admin_prepare_reactivation(
  p_actor uuid, p_target uuid, p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
begin
  if p_actor is null or p_target is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if app.actor_role(p_actor) is distinct from 'admin' then
    perform app.write_audit(p_actor, null, 'admin.account_reactivation', 'denied', p_request,
                            jsonb_build_object('reason', 'not_admin', 'target_id', p_target));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_target = p_actor then
    perform app.write_audit(p_actor, null, 'admin.account_reactivation', 'denied', p_request,
                            jsonb_build_object('reason', 'cannot_reactivate_self'));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select * into v_target from public.profiles where id = p_target for update;
  if not found then
    perform app.write_audit(p_actor, null, 'admin.account_reactivation', 'denied', p_request,
                            jsonb_build_object('reason', 'target_not_found', 'target_id', p_target));
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_target.role = 'admin' then
    perform app.write_audit(p_actor, null, 'admin.account_reactivation', 'denied', p_request,
                            jsonb_build_object('reason', 'target_is_admin', 'target_id', p_target));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if exists (
    select 1 from public.account_offboarding o
     where o.user_id = p_target and o.status in ('removal_pending', 'removed')
  ) then
    perform app.write_audit(p_actor, null, 'admin.account_reactivation', 'denied', p_request,
                            jsonb_build_object('reason', 'removal_pending', 'target_id', p_target));
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;
  return jsonb_build_object('ok', true, 'already_active', v_target.is_active);
end;
$$;

create function public.svc_admin_complete_reactivation(
  p_actor uuid, p_target uuid, p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
begin
  if p_actor is null or p_target is null or p_request is null
     or app.actor_role(p_actor) is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select * into v_target from public.profiles where id = p_target for update;
  if not found or v_target.role = 'admin'
     or exists (
       select 1 from public.account_offboarding o
        where o.user_id = p_target and o.status in ('removal_pending', 'removed')
     ) then
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;

  update public.profiles set is_active = true where id = p_target and not is_active;
  if found then
    perform app.write_audit(
      p_actor, null, 'admin.account_reactivation', 'success', p_request,
      jsonb_build_object('target_id', p_target)
    );
    perform app.write_audit(
      p_actor, null, 'admin.session_restore', 'success', p_request,
      jsonb_build_object('target_id', p_target, 'method', 'supabase_auth_unban')
    );
  end if;
  return jsonb_build_object('ok', true, 'is_active', true);
end;
$$;

create function public.svc_admin_prepare_account_removal(
  p_actor uuid, p_target uuid, p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
  v_existing public.account_offboarding%rowtype;
  v_owned bigint;
  v_versions bigint;
  v_grants bigint;
begin
  if p_actor is null or p_target is null or p_request is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if app.actor_role(p_actor) is distinct from 'admin' then
    perform app.write_audit(p_actor, null, 'admin.account_removal', 'denied', p_request,
                            jsonb_build_object('reason', 'not_admin', 'target_id', p_target));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_target = p_actor then
    perform app.write_audit(p_actor, null, 'admin.account_removal', 'denied', p_request,
                            jsonb_build_object('reason', 'cannot_remove_self'));
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select * into v_existing from public.account_offboarding where user_id = p_target for update;
  if found and v_existing.status = 'removed' then
    return jsonb_build_object('ok', true, 'status', 'removed', 'already_removed', true);
  end if;

  select * into v_target from public.profiles where id = p_target for update;
  if not found then
    if v_existing.status = 'removal_pending' then
      return jsonb_build_object('ok', true, 'status', 'removal_pending', 'resume', true);
    end if;
    perform app.write_audit(p_actor, null, 'admin.account_removal', 'denied', p_request,
                            jsonb_build_object('reason', 'target_not_found', 'target_id', p_target));
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_target.role = 'admin' or v_target.is_active then
    perform app.write_audit(p_actor, null, 'admin.account_removal', 'denied', p_request,
                            jsonb_build_object('reason', 'target_admin_or_active', 'target_id', p_target));
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;

  select count(*) into v_owned from public.documents d where d.owner_id = p_target;
  select count(*) into v_versions from public.document_versions v where v.created_by = p_target;
  select count(*) into v_grants from public.document_permissions g where g.granted_by = p_target;
  if v_owned > 0 or v_versions > 0 or v_grants > 0 then
    perform app.write_audit(
      p_actor, null, 'admin.account_removal', 'denied', p_request,
      jsonb_build_object('reason', 'retained_records', 'target_id', p_target,
                         'owned_documents', v_owned, 'created_versions', v_versions,
                         'issued_grants', v_grants)
    );
    return jsonb_build_object('ok', false, 'code', 'retained_records',
                              'owned_documents', v_owned, 'created_versions', v_versions,
                              'issued_grants', v_grants);
  end if;

  insert into public.account_offboarding (
    user_id, email_snapshot, display_name_snapshot, role_snapshot,
    status, requested_by
  )
  values (
    p_target, v_target.email, coalesce(v_target.display_name, v_target.email), v_target.role,
    'removal_pending', p_actor
  )
  on conflict (user_id) do nothing;

  if not found then
    perform app.write_audit(
      p_actor, null, 'admin.account_removal_retry', 'success', p_request,
      jsonb_build_object('target_id', p_target, 'status', 'removal_pending')
    );
  else
    perform app.write_audit(
      p_actor, null, 'admin.account_removal_started', 'success', p_request,
      jsonb_build_object('target_id', p_target, 'target_email', v_target.email,
                         'target_name', v_target.display_name)
    );
  end if;

  return jsonb_build_object('ok', true, 'status', 'removal_pending', 'resume', false);
end;
$$;

create function public.svc_admin_complete_account_removal(
  p_actor uuid, p_target uuid, p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.account_offboarding%rowtype;
begin
  if p_actor is null or p_target is null or p_request is null
     or app.actor_role(p_actor) is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select * into v_op from public.account_offboarding where user_id = p_target for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_op.status = 'removed' then
    return jsonb_build_object('ok', true, 'status', 'removed', 'already_removed', true);
  end if;
  if exists (select 1 from public.profiles p where p.id = p_target) then
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;

  update public.account_offboarding
     set status = 'removed', completed_at = clock_timestamp()
   where user_id = p_target;
  perform app.write_audit(
    p_actor, null, 'admin.account_removal', 'success', p_request,
    jsonb_build_object('target_id', p_target, 'target_email', v_op.email_snapshot,
                       'target_name', v_op.display_name_snapshot,
                       'target_role', v_op.role_snapshot)
  );
  return jsonb_build_object('ok', true, 'status', 'removed');
end;
$$;

create function public.svc_admin_record_offboarding_error(
  p_actor uuid, p_target uuid, p_request uuid, p_action text, p_stage text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor is null or p_target is null or p_request is null
     or p_action is null
     or p_action not in ('admin.account_removal', 'admin.account_reactivation',
                         'admin.session_revoke', 'admin.session_restore')
     or p_stage is null
     or p_stage not in ('auth_delete', 'auth_ban', 'auth_unban', 'database_finalize')
     or app.actor_role(p_actor) is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  perform app.write_audit(
    p_actor, null, p_action, 'error', p_request,
    jsonb_build_object('target_id', p_target, 'stage', p_stage)
  );
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.svc_admin_list_accounts(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.svc_admin_deactivate_account(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.svc_admin_prepare_reactivation(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.svc_admin_complete_reactivation(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.svc_admin_prepare_account_removal(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.svc_admin_complete_account_removal(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.svc_admin_record_offboarding_error(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.svc_admin_list_accounts(uuid, uuid) to service_role;
grant execute on function public.svc_admin_deactivate_account(uuid, uuid, uuid) to service_role;
grant execute on function public.svc_admin_prepare_reactivation(uuid, uuid, uuid) to service_role;
grant execute on function public.svc_admin_complete_reactivation(uuid, uuid, uuid) to service_role;
grant execute on function public.svc_admin_prepare_account_removal(uuid, uuid, uuid) to service_role;
grant execute on function public.svc_admin_complete_account_removal(uuid, uuid, uuid) to service_role;
grant execute on function public.svc_admin_record_offboarding_error(uuid, uuid, uuid, text, text) to service_role;
