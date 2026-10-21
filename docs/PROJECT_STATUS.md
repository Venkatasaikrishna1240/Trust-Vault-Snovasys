# Project status and verification ledger

Last reviewed: **2026-10-21**. This is a local source and test report, not a production security certification. Fresh command results are in `evidence/security-test-results.md`.

## Implemented in source

- React/Vite/TypeScript application with Supabase Auth, document upload, search, sharing, history, and admin pages.
- RLS-protected reads and nine Edge Functions backed by service-role-only `svc_*` operations.
- Private Storage bucket, upload validation, document hashing, access checks, and audit events. The newest local migration adds human-readable audit labels and post-verification preview/download success records; it is not deployed.
- Notification feature in migration `20261020000500_user_notifications.sql`: recipient-only notices for direct/global shares and successful edits/replacements; top-right UI, unread/read state, Realtime plus polling fallback. The configured project's notification table, RPC, four triggers, RLS, grants, and Realtime publication were verified present on 2026-10-20, and the migration version is recorded.
- The configured Supabase project initially returned `PGRST205` for `public.user_notifications`, explaining the reported panel error. On post-authorization inspection the schema objects were already present; this session did not execute the migration DDL. It recorded the verified migration version only. A follow-up anonymous REST request returned permission denied as expected; authenticated browser notification delivery has not been exercised.
- Login now always routes to `/` (dashboard) after sign-in, including when the sign-in page was reached from a protected document URL.
- Migrations 0100–0900, including signed-in global visibility, upload-time sharing, and editor historical downloads, plus recipient lookup updates 20261020000100 and 20261020000200 and audit update 20261020000300.
- Migration `20261020000200_recipient_name_and_username_search.sql` restores bounded suggestions by display name/email username; neither recipient-search migration has been applied to a hosted project.
- Demo provisioning now includes the required upload fields. Its network workflow has not been exercised in a disposable Supabase project.

## Fresh checks run on 2026-10-20

- `npm --prefix frontend run build`: passed; Vite reported a JavaScript chunk over 500 KiB.
- `npm --prefix frontend run lint`: passed (`tsc --noEmit`).
- `npm --prefix frontend test -- --pool=threads --maxWorkers=1`: passed, 9 files, 30 tests passed, 1 existing todo.
- `npm run typecheck:functions`: passed after the script was corrected to use `supabase/functions/deno.json`. Before that change, the script failed because it did not load the Deno project's dependency configuration.
- Focused notification/login/guard tests passed: 3 files, 8 tests.
- `node --check scripts/provision-demo.mjs`: passed; this checks syntax only, not requests against Supabase.
- At the earlier audit baseline the worktree was clean on `main`. This review began on clean `security-hardening` at `cdf88b5`, tracking `origin/security-hardening`; no commit was created for this review.
- A read-only static review found a transient cross-account display gap during direct A→B session replacement. The auth context now clears the old profile and gates protected content until B's profile loads; a regression test covers the transition. Recipient suggestions now match display names, email usernames, and full email addresses, returning the account email. This supports the requested picker experience but retains limited account-discovery risk. Backend tests for this migration/API change have not been run here.
- Migration `20261020000300_audit_activity_details.sql` moves preview/download success logging until after byte retrieval, size/hash verification, and a final access recheck; the admin UI resolves names and summarizes activity. This migration is local only and has not been applied.
- The focused notification DB test was attempted; all 5 cases were skipped when connection to `127.0.0.1:54329` was refused. No live signed-in notification/browser test was performed. A linked `db push --dry-run` showed four other pending migrations; none were applied. The CLI migration-list/direct database connection failed because no remote database password was configured.

## Not run or not established

- Latest notification DB test attempt could not connect to PostgreSQL at `127.0.0.1:54329`; 5 cases were skipped before their bodies ran. Earlier DB/API suite results and unavailable local Docker/Podman remain recorded in prior evidence; the mutation suite remains unrun because the backend harness is unavailable.
- The frontend test harness and static review do not exercise real Supabase Auth or the actual Storage API.
- No real signed-in browser account-switch run, live Storage denial, or signed-in hosted API test was performed. No migration DDL or app deployment was performed. A read-only metadata inspection and a migration-ledger version record were performed against the linked Supabase project with authorization; no document/user data was accessed or changed.
- The previous hosted CLI notes (2026-10-19) reported migrations 0100–0800 and nine functions active, with 0900 pending. On 2026-10-20, Management API metadata queries showed the notification migration's objects present and four other migrations pending in a dry run. The general migration list could not connect without the DB password; do not infer other deployment state.
- Historical backend pass counts in older repository documents are not fresh evidence for the current migration set.
- One frontend test remains marked `todo`; Deno has no separate unit-test suite; Vite reports a large chunk.
- SQL-like and wildcard recipient-search regression cases are now defined in DB/API tests, but have not executed because the local database is unavailable.
- Historical AI prompt summaries are in Git history, but original transcripts and independent proof of their reported tests are not.

Check the target project and run the backend and live integration procedures before claiming those behaviors are verified. Do not use production data for tests.

## Pre-deployment verification — 2026-10-21

- Production frontend build, frontend TypeScript check, and Edge Function Deno type-check passed; the production bundle still triggers Vite's >500 KiB chunk warning.
- `npm audit --prefix frontend --audit-level=high` and `npm audit --audit-level=high` reported zero known vulnerabilities.
- First full frontend test run: one permission UI test timed out, 29 passed, 1 existing todo. A subsequent full rerun passed: 9 files, 30 passed, 1 existing todo. The isolated permission suite also passed 4 tests with 1 existing todo.
- DB tests: all 166 cases skipped during setup because `127.0.0.1:54329` refused the connection. API tests: all 26 cases skipped for the same reason.
- Local browser smoke check, with a dummy Supabase URL/key: login loaded; empty signup displayed required-field errors; `/documents/new` redirected unauthenticated users to `/login`; viewport width 390px had no horizontal overflow. No credentials were submitted.
- UI copy that overstated AES encryption, complete audit coverage, tag search, and quota status was corrected. Vercel's CSP now permits same-origin/blob PDF preview frames; build/output/rewrite/header steps and environment-template setup instructions were clarified. Deployed headers/rendering remain unverified.
- The deletion of `frontend/.env.example` surfaced during this audit; the owner requested preserving it. No real `.env` values were read or printed. Consequently, the frontend example template remains absent.
- A follow-up against the owner-confirmed dedicated test project checked public Auth settings and anonymous denial for selected Data API, Storage metadata, and Edge Function routes. No migration, remote row/file data, push, or deployment was performed. Valid-user login, upload, preview/download, grants/revocation, authenticated admin actions, object-level Storage access, and notification delivery remain unverified.
- A later read-only check of the supplied live Vercel login URL returned HTTP 200 with the configured security headers; an unauthenticated `document-share` preflight from that origin returned HTTP 204. This does not establish authenticated application behavior or current hosted migration state. See `evidence/security-test-results.md`.
