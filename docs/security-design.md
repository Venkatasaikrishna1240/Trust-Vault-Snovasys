# Security design (source-based)

## Identity and trusted roles

The browser is untrusted. Each Edge Function is configured `verify_jwt=true`; `supabase/functions/_shared/core.ts` also calls Supabase Auth `getUser()` on the bearer token. Handlers use the resulting verified `user.id`, never a request-body actor field. Authorization role comes from `public.profiles.role`, not JWT/user metadata (`20261018000100_core_schema.sql`). The service-role key is loaded only in the function runtime. Admin role does not imply document access.

## Authorization and database access

`app.access_level(actor,document)` is the shared decision function, with caller-bound `app.my_access_level()` for RLS. `app.authorize_or_deny()` enforces required level, throttling and audited decisions (`20261018000200_access_helpers.sql`, `20261018000500_service_functions.sql`). Functions which perform writes lock the document row and re-evaluate access after locking. Every request uses current DB state; positive results are not cached.

Migration 0400 revokes broad public/anon/authenticated privileges, enables RLS on public application tables, grants explicit read columns, and provides no client write policies for documents, versions, permissions, or audit events. `svc_*` are SECURITY DEFINER operations restricted to service_role; the RLS tests enumerate that exposure. Profile users may update their own display name only.

## File and Storage boundary

Migration 0600 configures `documents` as private (10 MiB, PDF/PNG/JPEG) and applies a restrictive client-deny policy on `storage.objects`. The browser never calls Storage directly and no signed URLs are issued. Edge Functions authorize and audit before byte access. Keys are server-generated as `<owner UUID>/<document UUID>/<random UUID>`; DB enforces the convention and client SELECT grants omit `storage_key`.

Uploads are size-limited while reading the request, then checked by content signature/terminator, extension and declared MIME. Filename is sanitized. SHA-256 and size are stored and rechecked when current/history bytes are downloaded or previewed. There is no antivirus, content disarm/sanitization or robust polyglot detection. The restrictive policy is SQL-shim tested; real Supabase Storage API behavior is not established by those tests.

## Permission and revocation behavior

Owner controls named grants, visibility, revocation and deletion. Edit grants allow metadata/file replacement and, after migration 0900, current and historical downloads. Read grants allow metadata and current inline preview only. Global visibility is optional and only applies to signed-in profiles. Admin is not a content role.

No reusable URL is issued. A committed revoke blocks new authorized requests. Because a read/download may have passed its authorization decision before revocation commits, that in-flight response may still finish. Already delivered data cannot be recalled. Delete soft-tombstones and revokes access, then the function attempts removal of stored versions; purge may be incomplete and provider backups are not managed.

## Audit integrity and fail-closed behavior

Migration 0300 defines append-only `audit_events`, `audit_chain_head`, a trigger assigning sequence/previous/event hashes, and `app.write_audit()`. Application roles cannot insert/update/delete/truncate audit events; service functions audit successful/denied decisions. Sensitive-looking detail keys and detail size are constrained. Admin audit queries resolve actor, document name/owner, affected user and permission labels from database rows, without exposing file contents or Storage keys. Audit writes serialize on one head row; a 5-second lock timeout prevents indefinite blocking.

For downloads/previews, authorization is audited before Storage access. The handler fetches bytes and checks stored byte length and SHA-256, then invokes a service-role-only operation to recheck current permission and append the success event before returning a response. If retrieval, integrity verification, access recheck, or required audit fails, no bytes are returned. Storage/integrity error-event writes are required and their failures are surfaced rather than silently ignored. A success means verified bytes were prepared for an HTTP response; the server cannot prove that a client fully received, displayed, or saved them. Older success events were written at authorization time and are therefore labelled by the UI as delivery-unverified. Some malformed requests/functions return before creating an audit event, so this is not a log of every HTTP attempt.

Hash chaining detects partial/ordinary edits but is not tamper-proof: a database owner can disable triggers, rewrite events and recompute the whole chain. `supabase/tests/db/audit.test.ts` includes a known-limitation test. Export the chain head to independent storage for stronger detection.

## Sessions, browser, CORS and CSRF

Supabase JS persists a user session in browser storage by default. A stolen session can act with that user's permissions until invalidated/expired; MFA is not enforced by repository code. React escapes rendered text. Edge preview/download responses set `nosniff`, CSP sandbox and no-store; the frontend fetches preview bytes and embeds a `blob:` URL, so those response headers are not proof of the final browser document's isolation. The Vercel CSP permits `blob:` in `frame-src` for that preview; `frame-ancestors 'none'` prevents the app from being embedded. Vercel also sets `nosniff` and `no-referrer`; the policy includes `style-src 'unsafe-inline'`. Browser-specific PDF preview isolation remains to be verified.

API authorization uses an explicit bearer header rather than ambient cookies, so ordinary cookie-based CSRF does not apply. CORS source accepts configured non-local origins and HTTP localhost/loopback ports for development. On 2026-10-21, a hosted preflight from `http://127.0.0.1:4173` returned 204; this does not confirm authenticated function behavior or that hosted code matches current source. CORS is not authorization: production origins must be explicitly listed in `ALLOWED_ORIGINS`; do not set wildcard. Check hosted function versions after deploying source changes.

## Abuse controls and remaining risks

Recipient lookup is available only through the verified Edge Function and service-role database operation. It searches case-insensitive partial display names and email usernames (the part before `@`), requires at least three characters, excludes the caller, returns at most 20 matches, and is rate-limited and audited. The audit records query length and result count, not the query itself. Because suggestions reveal matching account emails to signed-in users, this supports sharing but still permits limited account discovery; do not treat the rate limit as eliminating that privacy risk. Migration `20261020000200_recipient_name_and_username_search.sql` restores this UX after the temporary exact-email-only restriction.

## User notification privacy and delivery

Migration `20261020000500_user_notifications.sql` writes notices only from database triggers after a direct permission grant, transition to global visibility, or a successful `document.edit`/`document.replace` audit event. The notification table has RLS restricting reads to `recipient_id = auth.uid()` and no client write grants. A narrowly scoped `mark_notifications_read` SECURITY DEFINER function uses `auth.uid()` and accepts at most 100 IDs per request; it cannot modify another recipient's rows. Realtime filters INSERT events by the same recipient ID; RLS remains the authorization boundary. The frontend also polls every 30 seconds to recover missed Realtime events. Notice text contains title and actor display-name snapshots but no document content or storage key. A notice click performs no authorization; the existing document route rechecks current access.

No system/browser notification permission is requested: the popup is the in-app TrustVault toast style. Database functions and Supabase Realtime delivery must be applied/enabled in the target environment; the migration/test database were unavailable during implementation.
