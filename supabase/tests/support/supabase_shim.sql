-- =====================================================================
-- TEST SUPPORT ONLY — NOT a migration, never deployed.
--
-- Emulates the parts of a Supabase project that TrustVault's migrations rely
-- on, so the real migrations can be applied unchanged to a plain PostgreSQL 16
-- server (used by the Docker-free local harness in supabase/tests/harness).
--
-- It reproduces, as faithfully as needed:
--   * roles anon / authenticated / service_role / authenticator
--   * schemas auth and storage with minimal users / buckets / objects tables
--   * auth.uid(), auth.role(), auth.jwt() reading the same settings that
--     PostgREST sets for every request
--   * Supabase's DEFAULT PRIVILEGES in schema public (new tables/functions are
--     granted to anon/authenticated/service_role). This matters: the
--     migrations must work against that permissive default, not against a
--     clean slate.
--
-- It does NOT emulate GoTrue (password login, token issuing) or the Storage
-- API. Those are covered by the live tests that need `supabase start`.
-- =====================================================================

create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;
create role authenticator login noinherit password 'authenticator-test-only';
grant anon, authenticated, service_role to authenticator;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

-- ---- auth ------------------------------------------------------------------
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

-- ---- storage ---------------------------------------------------------------
create table storage.buckets (
  id                 text primary key,
  name               text not null unique,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;

-- ---- public schema defaults, as on a fresh Supabase project -----------------
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
