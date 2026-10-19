-- =====================================================================
-- TrustVault migration 0400 — table privileges and Row-Level Security
--
-- Principles
--  1. Deny by default. Start by removing every privilege that Supabase's
--     default grants hand to anon / authenticated, then add back only what
--     the client genuinely needs.
--  2. Clients (role "authenticated") may only SELECT, and only rows the
--     policies allow. There are NO insert/update/delete policies on any
--     document, permission or audit table: every write goes through an Edge
--     Function -> svc_* function, which authorises, writes and audits in one
--     transaction.
--  3. "anon" (not signed in) has no privileges on any table.
--  4. Policies call the helpers from migration 0200, which look at current
--     rows each time (no caching) and never trust JWT claims for roles.
-- =====================================================================

-- ---- 1. Start from zero --------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- Make "deny by default" the rule for objects created in future migrations too.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges revoke execute on functions from public;

-- ---- 2. Enable RLS everywhere --------------------------------------------
alter table public.profiles             enable row level security;
alter table public.documents            enable row level security;
alter table public.document_versions    enable row level security;
alter table public.document_permissions enable row level security;
alter table public.audit_events         enable row level security;

-- ---- 3. profiles ---------------------------------------------------------
-- A user sees: themselves; people they share a live document with; admins
-- see everyone (needed for user administration).
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or app.is_admin()
    or app.shares_document_with(id)
  );

-- A user may change ONLY their own display name (column grant below, plus the
-- profiles_guard trigger from migration 0100).
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- ---- 4. documents --------------------------------------------------------
-- Visible to the owner and to users with an ACTIVE grant; never when soft-
-- deleted; NOT visible to admins merely because they are admins.
create policy documents_select on public.documents
  for select to authenticated
  using (deleted_at is null and app.my_access_level(id) is not null);

-- storage_key is deliberately not granted: clients never see bucket paths.
-- (So clients must list columns explicitly instead of select=*.)
grant select (id, owner_id, title, description, original_filename, category,
              mime_type, size_bytes, sha256, current_version,
              created_at, updated_at, deleted_at)
  on public.documents to authenticated;

-- ---- 5. document_versions ------------------------------------------------
create policy document_versions_select on public.document_versions
  for select to authenticated
  using (app.my_access_level(document_id) is not null);

grant select (id, document_id, version, original_filename, mime_type,
              size_bytes, sha256, created_by, created_at)
  on public.document_versions to authenticated;

-- ---- 6. document_permissions ---------------------------------------------
-- Grantees see their own grants (including revoked history); owners see every
-- grant on their documents. Nobody else sees anything.
create policy document_permissions_select on public.document_permissions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or app.is_document_owner(document_id)
  );

grant select on public.document_permissions to authenticated;

-- ---- 7. audit_events -----------------------------------------------------
-- Admins: everything (read-only). Owners: events about their own documents.
-- Everyone: events they themselves caused.
create policy audit_events_select on public.audit_events
  for select to authenticated
  using (
    app.is_admin()
    or actor_id = (select auth.uid())
    or (document_id is not null and app.is_document_owner(document_id))
  );

grant select on public.audit_events to authenticated;

-- audit_events: keep service_role away from write privileges as well.
-- (Rows are only created by app.write_audit(), a SECURITY DEFINER function.)
revoke insert, update, delete, truncate, references, trigger
  on public.audit_events from anon, authenticated, service_role;
