-- =====================================================================
-- TrustVault migration 0200 — access-decision helpers (schema "app")
--
-- app.access_level() is the SINGLE source of truth for "what may this user
-- do with this document right now". It is used by
--   * the RLS policies (with auth.uid()), and
--   * every svc_* function (with the verified actor id passed by the Edge
--     Function).
-- It reads current rows on every call — nothing is cached — so a revoked
-- grant stops working with the very next call.
--
-- All helpers are SECURITY DEFINER with an empty search_path. Being
-- SECURITY DEFINER they bypass RLS on the tables they read, which is what
-- prevents the infinite recursion you get when two tables' policies query
-- each other.
-- =====================================================================

-- The caller's trusted role, read from the table (never from the JWT).
create function app.actor_role(p_actor uuid)
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = p_actor;
$$;

-- 'owner' | 'edit' | 'read' | NULL   (NULL = no access, doc missing or deleted)
create function app.access_level(p_actor uuid, p_doc uuid)
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
    else null
  end
  from public.documents d
  where d.id = p_doc and d.deleted_at is null;
$$;

-- True for the owner even if the document has been soft-deleted (audit history).
create function app.is_document_owner(p_doc uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_doc and d.owner_id = (select auth.uid())
  );
$$;

create function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.actor_role((select auth.uid())) = 'admin', false);
$$;

-- Is there a live document relationship between the caller and p_other?
-- (caller owns a doc p_other can access, or p_other owns a doc the caller can
-- access). Used so people can see the display name / e-mail of the person they
-- share a document with — and nobody else.
create function app.shares_document_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    join public.document_permissions g
      on g.document_id = d.id and g.revoked_at is null
    where d.deleted_at is null
      and (
        (d.owner_id = p_other           and g.user_id = (select auth.uid()))
        or
        (d.owner_id = (select auth.uid()) and g.user_id = p_other)
      )
  );
$$;

-- Convenience wrapper for RLS policies: always evaluates for the CALLER, so
-- the policies never need an actor argument that could be spoofed.
create function app.my_access_level(p_doc uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select app.access_level((select auth.uid()), p_doc);
$$;

-- Execution rights.
--  * RLS policies are evaluated as the invoking role, so 'authenticated'
--    needs EXECUTE on the caller-bound helpers (my_access_level, is_admin,
--    is_document_owner, shares_document_with).
--  * The helpers that take an arbitrary actor id (actor_role, access_level)
--    are only called from SECURITY DEFINER svc_* functions (which run as the
--    function owner), so NO API role gets EXECUTE: a client can never ask
--    "what can user X do?".
--  * anon never evaluates policies (it has no table privileges at all).
revoke all on function app.actor_role(uuid)              from public, anon, authenticated, service_role;
revoke all on function app.access_level(uuid, uuid)      from public, anon, authenticated, service_role;
revoke all on function app.my_access_level(uuid)         from public, anon;
revoke all on function app.is_document_owner(uuid)       from public, anon;
revoke all on function app.is_admin()                    from public, anon;
revoke all on function app.shares_document_with(uuid)    from public, anon;

grant execute on function app.my_access_level(uuid)      to authenticated, service_role;
grant execute on function app.is_document_owner(uuid)    to authenticated, service_role;
grant execute on function app.is_admin()                 to authenticated, service_role;
grant execute on function app.shares_document_with(uuid) to authenticated, service_role;
