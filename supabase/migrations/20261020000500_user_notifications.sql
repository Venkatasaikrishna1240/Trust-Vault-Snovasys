-- Persist recipient-scoped notices for new shares, global shares and updates.
create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  document_title text not null,
  notification_type text not null
    check (notification_type in ('document_shared', 'document_updated')),
  source_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  constraint user_notifications_once_per_source
    unique (recipient_id, notification_type, source_id)
);

create index user_notifications_recipient_created_idx
  on public.user_notifications (recipient_id, created_at desc);
create index user_notifications_unread_idx
  on public.user_notifications (recipient_id)
  where read_at is null;

alter table public.user_notifications enable row level security;
revoke all on public.user_notifications from public, anon, authenticated, service_role;
grant select on public.user_notifications to authenticated;

create policy user_notifications_select_own
  on public.user_notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()));

create function app.notify_document_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.documents%rowtype;
  v_actor_name text;
begin
  if new.revoked_at is not null then
    return new;
  end if;

  select * into v_document
    from public.documents d
   where d.id = new.document_id and d.deleted_at is null;
  if not found or v_document.is_global then
    return new;
  end if;

  select coalesce(nullif(p.display_name, ''), p.email)
    into v_actor_name
    from public.profiles p
   where p.id = new.granted_by;

  insert into public.user_notifications (
    recipient_id, document_id, actor_id, actor_name,
    document_title, notification_type, source_id
  )
  values (
    new.user_id, v_document.id, new.granted_by,
    coalesce(v_actor_name, 'A TrustVault user'),
    v_document.title, 'document_shared', new.id
  )
  on conflict (recipient_id, notification_type, source_id) do nothing;

  return new;
end;
$$;

create trigger document_permissions_notify_grantee
  after insert on public.document_permissions
  for each row execute function app.notify_document_grant();

create function app.notify_global_document_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_name text;
  v_source_id uuid := gen_random_uuid();
begin
  if not new.is_global or new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.is_global then
      return new;
    end if;
  end if;

  select coalesce(nullif(p.display_name, ''), p.email)
    into v_actor_name
    from public.profiles p
   where p.id = new.owner_id;

  insert into public.user_notifications (
    recipient_id, document_id, actor_id, actor_name,
    document_title, notification_type, source_id
  )
  select p.id, new.id, new.owner_id,
         coalesce(v_actor_name, 'A TrustVault user'),
         new.title, 'document_shared', v_source_id
    from public.profiles p
   where p.id <> new.owner_id
  on conflict (recipient_id, notification_type, source_id) do nothing;

  return new;
end;
$$;

create trigger documents_notify_global_share_insert
  after insert on public.documents
  for each row execute function app.notify_global_document_share();
create trigger documents_notify_global_share_update
  after update of is_global on public.documents
  for each row execute function app.notify_global_document_share();

create function app.notify_document_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.documents%rowtype;
  v_actor_name text;
begin
  select * into v_document
    from public.documents d
   where d.id = new.document_id and d.deleted_at is null;
  if not found then
    return null;
  end if;

  select coalesce(nullif(p.display_name, ''), p.email)
    into v_actor_name
    from public.profiles p
   where p.id = new.actor_id;

  insert into public.user_notifications (
    recipient_id, document_id, actor_id, actor_name,
    document_title, notification_type, source_id
  )
  select recipients.user_id, v_document.id, new.actor_id,
         coalesce(v_actor_name, 'A TrustVault user'),
         v_document.title, 'document_updated', new.request_id
    from (
      select d.owner_id as user_id
        from public.documents d
       where d.id = v_document.id and d.owner_id <> new.actor_id
      union
      select p.user_id
        from public.document_permissions p
       where p.document_id = v_document.id
         and p.revoked_at is null
         and p.user_id <> new.actor_id
      union
      select p.id
        from public.profiles p
       where v_document.is_global
         and p.id <> new.actor_id
    ) recipients
  on conflict (recipient_id, notification_type, source_id) do nothing;

  return null;
end;
$$;

create trigger audit_events_notify_document_updates
  after insert on public.audit_events
  for each row
  when (
    new.outcome = 'success'
    and new.action in ('document.edit', 'document.replace')
  )
  execute function app.notify_document_update();

revoke all on function app.notify_document_grant()
  from public, anon, authenticated, service_role;
revoke all on function app.notify_global_document_share()
  from public, anon, authenticated, service_role;
revoke all on function app.notify_document_update()
  from public, anon, authenticated, service_role;

create function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
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
grant execute on function public.mark_notifications_read(uuid[])
  to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'user_notifications'
     ) then
    alter publication supabase_realtime add table public.user_notifications;
  end if;
end;
$$;
