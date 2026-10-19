-- =====================================================================
-- TrustVault migration 0300 — audit trail
--
-- Design
--  * Append-only: UPDATE / DELETE / TRUNCATE are blocked by triggers AND by
--    revoked privileges.
--  * Not client-writable: no role used by the Data API (anon, authenticated,
--    service_role) has INSERT. Rows are only created by app.write_audit(),
--    a SECURITY DEFINER function that is not executable by clients.
--  * Hash chain: a BEFORE INSERT trigger assigns seq, prev_hash and
--    event_hash while holding a row lock on audit_chain_head. Callers cannot
--    supply (and therefore cannot forge) those columns.
--
-- HONEST LIMITATION
--  The chain lives in the same database. Someone with superuser / table-owner
--  rights can disable the triggers, rewrite rows and recompute the chain.
--  What the chain DOES give you: ordinary application users (and bugs) cannot
--  alter history silently, and any partial edit is detectable by
--  svc_verify_audit_chain(). For stronger guarantees, copy the head hash
--  (returned by admin-audit-query) to storage the DB admin cannot write to.
-- =====================================================================

create table public.audit_chain_head (
  id        smallint primary key check (id = 1),
  last_seq  bigint not null,
  last_hash text not null
);
insert into public.audit_chain_head (id, last_seq, last_hash)
values (1, 0, repeat('0', 64));

-- Reject detail objects that look like they carry secrets or file contents.
create function app.details_are_safe(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_object_keys(p) k
       where lower(k) in ('password', 'token', 'access_token', 'refresh_token',
                          'jwt', 'secret', 'authorization', 'api_key', 'apikey',
                          'service_role', 'service_role_key', 'content', 'bytes',
                          'file', 'body')
     );
$$;

create table public.audit_events (
  seq         bigint primary key,
  id          uuid not null default gen_random_uuid() unique,
  occurred_at timestamptz not null default clock_timestamp(),
  -- Deliberately NO foreign keys: the audit trail must outlive users/documents.
  actor_id    uuid,
  document_id uuid,
  action      text not null,
  outcome     public.audit_outcome not null,
  request_id  uuid not null,
  details     jsonb not null default '{}'::jsonb,
  prev_hash   text not null,
  event_hash  text not null,
  constraint audit_events_action_format check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  constraint audit_events_details_safe  check (app.details_are_safe(details)),
  constraint audit_events_details_size  check (pg_column_size(details) <= 4096)
);

create index audit_events_occurred_at_idx on public.audit_events (occurred_at desc);
create index audit_events_document_idx    on public.audit_events (document_id, seq desc) where document_id is not null;
create index audit_events_actor_idx       on public.audit_events (actor_id, occurred_at desc) where actor_id is not null;
create index audit_events_denied_idx      on public.audit_events (actor_id, occurred_at desc) where outcome = 'denied';

-- ---------------------------------------------------------------------
-- Hash function (deterministic, used by the insert trigger and by verification)
-- ---------------------------------------------------------------------
create function app.audit_event_hash(
  p_seq bigint, p_prev_hash text, p_occurred_at timestamptz, p_actor uuid,
  p_document uuid, p_action text, p_outcome public.audit_outcome,
  p_request uuid, p_details jsonb
)
returns text
language sql
stable
set search_path = ''
as $$
  select encode(
    sha256(convert_to(concat_ws('|',
      p_prev_hash,
      p_seq::text,
      to_char(p_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      coalesce(p_actor::text, ''),
      coalesce(p_document::text, ''),
      p_action,
      p_outcome::text,
      p_request::text,
      p_details::text
    ), 'UTF8')),
    'hex');
$$;

-- ---------------------------------------------------------------------
-- BEFORE INSERT: assign seq / prev_hash / event_hash under a row lock
-- (serialises audit writes — simple and correct; documented throughput limit)
-- ---------------------------------------------------------------------
create function app.audit_chain_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.audit_chain_head%rowtype;
begin
  select * into h from public.audit_chain_head where id = 1 for update;

  new.seq        := h.last_seq + 1;
  new.prev_hash  := h.last_hash;
  new.event_hash := app.audit_event_hash(
    new.seq, new.prev_hash, new.occurred_at, new.actor_id, new.document_id,
    new.action, new.outcome, new.request_id, new.details);

  update public.audit_chain_head
     set last_seq = new.seq, last_hash = new.event_hash
   where id = 1;

  return new;
end;
$$;

create trigger audit_events_chain
  before insert on public.audit_events
  for each row execute function app.audit_chain_before_insert();

-- ---------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------
create function app.audit_block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_events is append-only (% blocked)', tg_op
    using errcode = '42501';
end;
$$;

create trigger audit_events_no_update_delete
  before update or delete on public.audit_events
  for each row execute function app.audit_block_mutation();

create trigger audit_events_no_truncate
  before truncate on public.audit_events
  for each statement execute function app.audit_block_mutation();

-- Same protection for the chain head (only the trigger function, running as
-- the table owner, may change it).
alter table public.audit_chain_head enable row level security;
revoke all on public.audit_chain_head from anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- The ONLY way rows get in: app.write_audit()
-- ---------------------------------------------------------------------
create function app.write_audit(
  p_actor    uuid,
  p_document uuid,
  p_action   text,
  p_outcome  public.audit_outcome,
  p_request  uuid,
  p_details  jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
-- Audit writes are serialised on the chain-head row. If another transaction
-- holds that lock for more than 5 s, fail (-> HTTP 5xx, no data returned)
-- instead of hanging every request behind it. Failing closed is intentional.
set lock_timeout = '5s'
as $$
declare
  v_seq bigint;
begin
  insert into public.audit_events (actor_id, document_id, action, outcome, request_id, details)
  values (p_actor, p_document, p_action, p_outcome, p_request, coalesce(p_details, '{}'::jsonb))
  returning seq into v_seq;
  return v_seq;
end;
$$;

revoke all on function app.write_audit(uuid, uuid, text, public.audit_outcome, uuid, jsonb)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Denied-attempt throttle (anti-enumeration / IDOR brute force).
-- Counts the actor's recent DENIED events; no extra table needed.
-- ---------------------------------------------------------------------
create function app.is_throttled(p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_actor is not null and (
    select count(*) from public.audit_events e
    where e.actor_id = p_actor
      and e.outcome = 'denied'
      and e.action <> 'request.rate_limited'   -- marker events must not extend the lock-out
      and e.occurred_at > clock_timestamp() - interval '1 minute'
  ) >= 30;
$$;

-- Returns TRUE when the actor is throttled. Writes at most one
-- 'request.rate_limited' marker per actor per minute so an attacker cannot
-- grow the audit table by hammering a throttled endpoint.
create function app.throttle_check(p_actor uuid, p_request uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_throttled(p_actor) then
    return false;
  end if;

  if not exists (
    select 1 from public.audit_events e
    where e.actor_id = p_actor
      and e.action = 'request.rate_limited'
      and e.occurred_at > clock_timestamp() - interval '1 minute'
  ) then
    perform app.write_audit(p_actor, null, 'request.rate_limited', 'denied', p_request,
                            jsonb_build_object('reason', 'too_many_denied_requests'));
  end if;
  return true;
end;
$$;

-- Only called from SECURITY DEFINER svc_* functions (which run as the owner),
-- so no API role needs EXECUTE.
revoke all on function app.is_throttled(uuid)         from public, anon, authenticated, service_role;
revoke all on function app.throttle_check(uuid, uuid) from public, anon, authenticated, service_role;
