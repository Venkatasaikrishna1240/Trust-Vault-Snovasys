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

Migration 0300 defines append-only `audit_events`, `audit_chain_head`, a trigger assigning sequence/previous/event hashes, and `app.write_audit()`. Application roles cannot insert/update/delete/truncate audit events; service functions audit successful/denied decisions. Sensitive-looking detail keys and detail size are constrained. Audit writes serialize on one head row; a 5-second lock timeout prevents indefinite blocking.

For downloads/previews, database authorization and required success audit happen before the handler fetches bytes. Handler verifies stored byte length and SHA-256; DB/audit failures return failure without bytes. Storage/integrity error recording is best-effort where the preceding authorization has already happened. Some malformed requests/functions return before creating an audit event, so this is not a log of every HTTP attempt.

Hash chaining detects partial/ordinary edits but is not tamper-proof: a database owner can disable triggers, rewrite events and recompute the whole chain. `supabase/tests/db/audit.test.ts` includes a known-limitation test. Export the chain head to independent storage for stronger detection.

## Sessions, browser, CORS and CSRF

Supabase JS persists a user session in browser storage by default. A stolen session can act with that user's permissions until invalidated/expired; MFA is not enforced by repository code. React escapes rendered text; preview response uses `nosniff`, CSP sandbox and no-store. Vercel headers set a CSP, `nosniff`, and `no-referrer`; the policy includes `style-src 'unsafe-inline'`.

API authorization uses an explicit bearer header rather than ambient cookies, so ordinary cookie-based CSRF does not apply. CORS source accepts configured non-local origins and HTTP localhost/loopback ports for development. The last hosted preflight test from port 5176 returned 204, but current source deployment was not confirmed. CORS is not authorization: production origins must be explicitly listed in `ALLOWED_ORIGINS`; do not set wildcard. Check hosted function versions after deploying source changes.

## Abuse controls and remaining risks

Recipient lookup is rate-limited and audits query length/result count without storing the address. Migration `20261020000100_exact_email_recipient_lookup.sql` restricts it to case-insensitive exact email matches; partial-name and email-prefix directory searches are not available. A person who already knows an exact address can still confirm whether it is registered, which is also inherent in granting access by email.
