-- =====================================================================
-- TrustVault migration 0100 — core schema
--
-- Creates: types, profiles, documents, document_versions,
--          document_permissions, the profile-provisioning triggers and
--          the role/email tamper guard.
--
-- Security notes
--  * Role is stored ONLY in public.profiles.role. It is never read from
--    JWT claims or user_metadata (both are user-influenced).
--  * New sign-ups always become 'viewer'. Promotion is a trusted action
--    (svc_admin_set_role, or direct SQL by the project owner).
--  * Table privileges and RLS are defined in migration 0400.
-- =====================================================================

-- Internal schema for helpers. NOT listed in the API's exposed schemas, so
-- nothing in here is reachable as /rest/v1/rpc/... .
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type public.user_role as enum ('admin', 'owner', 'viewer');
create type public.doc_permission as enum ('read', 'edit');
create type public.audit_outcome as enum ('success', 'denied', 'error');

-- ---------------------------------------------------------------------
-- Generic trigger helpers
-- ---------------------------------------------------------------------
create function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null,
  role         public.user_role not null default 'viewer',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_display_name_len check (char_length(display_name) between 1 and 100),
  constraint profiles_email_len check (char_length(email) <= 320)
);
create unique index profiles_email_lower_key on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role);

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function app.touch_updated_at();

-- Block role / email / id changes made by client roles. Column privileges
-- (migration 0400) already stop this; the trigger is the second layer.
-- Inside SECURITY DEFINER functions current_user is the function owner, so
-- trusted code paths are not affected.
create function app.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.email is distinct from old.email then
      raise exception 'profiles.id, profiles.email and profiles.role cannot be changed by clients'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function app.profiles_guard();

-- Create a profile when a Supabase Auth user is created. The role is ALWAYS
-- 'viewer'; raw_user_meta_data (which the user controls at sign-up) is only
-- used for the display name.
create function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := coalesce(new.email, new.id::text || '@invalid.local');
  v_name  text;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if v_name is null then
    v_name := nullif(split_part(v_email, '@', 1), '');
  end if;
  v_name := left(coalesce(v_name, 'user'), 100);

  insert into public.profiles (id, email, display_name, role)
  values (new.id, v_email, v_name, 'viewer');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- Keep profiles.email in step with auth.users.email.
create function app.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function app.sync_user_email();

-- ---------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------
create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles (id) on delete restrict,
  title             text not null,
  description       text not null default '',
  original_filename text not null,
  -- Server-generated key inside the private 'documents' bucket. Never
  -- derived from user input and never sent to clients.
  storage_key       text not null unique,
  category          text not null default 'general',
  mime_type         text not null,
  size_bytes        bigint not null,
  sha256            text not null,
  current_version   integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint documents_title_len check (char_length(btrim(title)) between 1 and 200),
  constraint documents_description_len check (char_length(description) <= 2000),
  constraint documents_filename_len check (char_length(original_filename) between 1 and 255),
  constraint documents_category_allowed check (category in
    ('general', 'contract', 'salary_letter', 'technical_drawing', 'audit', 'customer_record')),
  constraint documents_mime_allowed check (mime_type in ('application/pdf', 'image/png', 'image/jpeg')),
  constraint documents_size_positive check (size_bytes > 0),
  constraint documents_sha256_format check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint documents_version_positive check (current_version >= 1)
);

create index documents_owner_idx      on public.documents (owner_id) where deleted_at is null;
create index documents_category_idx   on public.documents (category) where deleted_at is null;
create index documents_created_at_idx on public.documents (created_at desc) where deleted_at is null;

create trigger documents_touch_updated_at
  before update on public.documents
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------
-- document_versions — history of replaced content (integrity + recovery)
-- ---------------------------------------------------------------------
create table public.document_versions (
  id                uuid primary key default gen_random_uuid(),
  document_id       uuid not null references public.documents (id) on delete cascade,
  version           integer not null,
  storage_key       text not null unique,
  original_filename text not null,
  mime_type         text not null,
  size_bytes        bigint not null,
  sha256            text not null,
  created_by        uuid not null references public.profiles (id) on delete restrict,
  created_at        timestamptz not null default now(),
  constraint document_versions_unique unique (document_id, version),
  constraint document_versions_sha256_format check (sha256 ~ '^[0-9a-f]{64}$')
);

-- ---------------------------------------------------------------------
-- document_permissions — named-user read/edit grants with history
-- ---------------------------------------------------------------------
create table public.document_permissions (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  permission  public.doc_permission not null,
  granted_by  uuid not null references public.profiles (id) on delete restrict,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  revoked_by  uuid references public.profiles (id) on delete set null,
  constraint document_permissions_no_self_grant check (user_id <> granted_by),
  -- revoked_by may only be set on a revoked grant (it can become NULL later
  -- through ON DELETE SET NULL, so the reverse is not enforced).
  constraint document_permissions_revoker_needs_revoke check (revoked_by is null or revoked_at is not null)
);

-- At most ONE active grant per (document, user). Revoked rows are history.
create unique index document_permissions_one_active
  on public.document_permissions (document_id, user_id)
  where revoked_at is null;

create index document_permissions_user_active_idx
  on public.document_permissions (user_id)
  where revoked_at is null;
create index document_permissions_document_idx
  on public.document_permissions (document_id);
