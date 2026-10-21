# Security test results

**Date:** 2026-10-20  
**Branch:** `security-hardening`  
**Git baseline for this review:** clean on `security-hardening`, tracking `origin/security-hardening` at `cdf88b5`. Earlier hardening changes are already in history; this review did not create a commit.

## In-app notifications — 2026-10-20

| Check | Command | Result | Notes |
|---|---|---|---|
| Configured Supabase notification table | Read-only REST and Management API metadata queries | VERIFIED PRESENT | Initial REST call returned HTTP 404 / `PGRST205`. After authorization, metadata queries found the table, RPC, four triggers, recipient-only RLS policy, expected role privileges, and Realtime publication. The migration version was absent at first and was recorded after verification. This session did not execute the migration DDL. |
| Notification migration ledger | `npx supabase db query --linked` | RECORDED | After verifying the remote objects, recorded version `20261020000500` in `supabase_migrations.schema_migrations` to prevent future reapplication. No other pending migration was applied. |
| Anonymous notification read | Read-only GET `/rest/v1/user_notifications?select=id&limit=0` using configured public anon key | DENIED AS EXPECTED | Returned HTTP 401 / `42501` permission denied. Authenticated live read was not tested. |
| Notification/login regressions | `npm --prefix frontend test -- --pool=threads --maxWorkers=1 src/tests/notificationCenter.test.tsx src/tests/loginRedirect.test.tsx src/tests/authGuard.test.tsx` | PASS | 3 files, 8 tests. |
| Frontend type-check | `npm --prefix frontend run lint` | PASS | Rerun after the diagnostic and dashboard redirect changes. |
| Frontend tests | `npm --prefix frontend test -- --pool=threads --maxWorkers=1` | PASS | Latest run: 9 files; 30 passed, 1 existing todo. |
| Frontend type-check | `npm --prefix frontend run lint` | PASS | `tsc --noEmit`. |
| Frontend production build | `npm --prefix frontend run build` | PASS | Vite build succeeded; existing minified chunk exceeds 500 KiB. |
| Edge Function type-check | `npm run typecheck:functions` | PASS | All Edge Function entrypoints and shared files checked. |
| Notification DB tests | `npx vitest run supabase/tests/db/notifications.test.ts` | BLOCKED | Connection refused at `127.0.0.1:54329`; 5 tests skipped during suite setup, none executed. |
| Signed-in live notification UI | Not run | NOT TESTED | Database objects are present, but no test user session was used to verify a newly shared document, toast, or Realtime delivery. No frontend/function deployment occurred. |

## Audit activity change — 2026-10-20

| Check | Command | Result | Notes |
|---|---|---|---|
| Frontend tests | `npm --prefix frontend test -- --pool=threads --maxWorkers=1` | PASS | 7 files, 26 passed, 1 existing todo. Includes readable grant/preview/download/revocation/denial wording and legacy delivery caveat. Log: `test-logs/audit-activity-frontend-tests.log`. |
| Frontend production build | `npm --prefix frontend run build` | PASS | TypeScript and Vite succeeded; existing >500 KiB chunk warning. Log: `test-logs/audit-activity-frontend-build.log`. |
| Frontend type-check | `npm --prefix frontend run lint` | PASS | `tsc --noEmit` succeeded. Log: `test-logs/audit-activity-frontend-lint.log`. |
| Edge Function type-check | `npm run typecheck:functions` | PASS | Deno check succeeded. Log: `test-logs/audit-activity-function-check.log`. |
| DB audit/security tests | `npm run test:db` | BLOCKED | Latest rerun: PostgreSQL refused `127.0.0.1:54329`; all 161 current tests skipped, none ran. Result summary: `test-logs/audit-activity-db-tests-rerun.md`. Earlier console capture: `test-logs/audit-activity-db-tests.log` (160 tests before the filename-history assertion was added). |
| API audit/security tests | `npm run test:api` | BLOCKED | PostgreSQL refused `127.0.0.1:54329`; 26 tests skipped, none ran. Log: `test-logs/audit-activity-api-tests.log`. |
| Migration execution / live audit UI | Not run | NOT TESTED | No local database, hosted project, browser session, migration apply, or deployment was used. |

The DB/API tests cover share levels, preview/download, revoke and denied access, plus an integrity-failure case that must not create a successful delivery event. A DB regression also checks that a grant event retains the filename current at grant time after a later replacement. These cases remain unverified until the local disposable backend is available.

## Automated checks

| Check | Command | Result | Notes |
|---|---|---|---|
| Frontend production build | `npm --prefix frontend run build` | PASS | Rerun during the seven-requirement review. TypeScript and Vite succeeded; Vite warned that a minified JavaScript chunk exceeds 500 KiB. See `test-logs/security-review-frontend-build.log`. |
| Frontend lint/type check | `npm --prefix frontend run lint` | PASS | Rerun during the seven-requirement review; `tsc --noEmit` completed successfully. See `test-logs/security-review-frontend-lint.log`. |
| Frontend Vitest suite | `npm --prefix frontend test` | FAIL on first attempt | Three fork workers timed out during startup; one file reported 5 passing tests before Vitest reported unhandled worker errors. This is recorded as an environment/worker failure, not a clean pass. |
| Frontend Vitest retry | `npm --prefix frontend test -- --pool=threads --maxWorkers=1` | PASS | At that review checkpoint: 6 test files, 21 passed, 1 existing todo. Latest audit activity run (7 files, 26 passed, 1 todo) is above. |
| Focused recipient and account-switch regressions | `npm --prefix frontend test -- --pool=threads --maxWorkers=1 src/tests/upload.test.tsx src/tests/authContext.test.tsx` | PASS | 2 test files, 7 tests passed. |
| Focused account-switch regression | `npm --prefix frontend test -- --pool=threads --maxWorkers=1 src/tests/authContext.test.tsx` | PASS | 1 test passed. It asserts that no render pairs Owner B's session with Owner A's profile. See `test-logs/auth-context-test.log`. |
| Edge Function type-check before correction | `npm run typecheck:functions` | FAIL | The script omitted `supabase/functions/deno.json`; Deno could not find the configured `npm:@supabase/supabase-js` package. |
| Configured Deno type-check | `deno check --config supabase/functions/deno.json supabase/functions/*/index.ts supabase/functions/_shared/*.ts` | PASS | The project-configured check passed. |
| Edge Function type-check after correction | `npm run typecheck:functions` | PASS | Rerun during this review using `supabase/functions/deno.json`. See `test-logs/security-review-function-check.log`. |
| Demo provisioning script syntax | `node --check scripts/provision-demo.mjs` | PASS | Syntax check passed after adding the upload fields. This does not test requests against Supabase. See `test-logs/demo-script-syntax.log`. |

Command output is stored in `test-logs/`. It contains sanitized local build/test output. The latest review run is in files beginning `security-review-`.

During test development, the first account-switch assertion queried an accessible name the spinner did not expose; the assertion was changed to check its visible text and the focused test then passed. A separate test-log invocation using `--minWorkers=1` was rejected by Vitest; the supported single-worker command above passed.

## Security review and test scope

- The broad read-only review found no confirmed exploit; its focused account-transition follow-up found the transient display issue fixed in this worktree. Recipient search now intentionally supports display-name/email-username suggestions and full email after three characters, capped at 20 and audited/rate-limited. Frontend regression tests passed; DB/API regression cases are present but their test bodies could not run because PostgreSQL was unavailable. See `../SECURITY_AUDIT.md`.
- A focused follow-up found the direct account-replacement gap described in `../SECURITY_AUDIT.md`; the auth context fix and regression test passed locally. Real Supabase Auth and browser account switching remain untested.
- A pattern scan of tracked working-tree files and Git-reachable history found no recognizable Supabase service-role/secret values. This does not cover untracked files, unreachable Git objects, or unrecognized/encoded formats.
- Frontend tests ran locally. They do not establish server-side authorization, RLS, Storage policy behavior, or deployment status.
- Existing DB/API tests cover many negative cases in source, but test definitions are not pass evidence.

## Blocked or not run

| Check | Result | Reason |
|---|---|---|
| `npm run test:db` | ATTEMPTED, BLOCKED | Earlier review run: 159 tests skipped. Latest audit activity run: 160 tests skipped. No test bodies ran; latest log is `test-logs/audit-activity-db-tests.log`. |
| `npm run test:api` | ATTEMPTED, BLOCKED | Earlier review run: 25 tests skipped. Latest audit activity run: 26 tests skipped. No test bodies ran; latest log is `test-logs/audit-activity-api-tests.log`. |
| `npx supabase status` | BLOCKED | CLI could not inspect local container health because Docker and Podman are unavailable. No remote project was changed or tested. |
| `npm run test:backend:local` | NOT RUN | The disposable backend harness prerequisites remain unavailable; direct DB/API attempts above confirm no PostgreSQL server was listening. |
| `npm run test:mutation` | NOT RUN | Same missing backend harness prerequisites. |
| Single-worker invocation with unsupported `--minWorkers=1` option | FAILED | Vitest rejected the option in that invocation; rerun using the supported `--pool=threads --maxWorkers=1` command above passed. The failed command output is preserved in `test-logs/frontend-tests-invalid-option.log`. |
| Direct Supabase Auth/API/Storage authorization | PARTIAL | Follow-up read-only anonymous checks against the owner-confirmed dedicated test project are recorded below. No valid test-user session was available. |
| Manual UI login, grant, revoke, account switch, and direct ID manipulation | NOT TESTED | No browser session/test identities were exercised during this session. Procedures are in `manual-test-cases.md`. |
| Hosted migration/function/deployment verification | PARTIAL | On 2026-10-20 the linked project's notification objects and migration ledger were inspected; four other migrations appeared pending in a dry-run. No application deployment or migration DDL was performed. The direct migration list could not connect without the database password. |

## Interpretation

The latest results show that the frontend builds and its suite passes when run with one worker, and the Edge Function sources pass the configured Deno type-check. The new audit event semantics and SQL migration have not been exercised against PostgreSQL; the DB/API cases are definitions only. The results do **not** establish hosted authentication, RLS, Storage denial, revocation, audit integrity or actual browser receipt/display end-to-end.

## Pre-deployment audit — 2026-10-21

| Check | Command / activity | Result | Notes |
|---|---|---|---|
| Frontend production build | `npm --prefix frontend run build` | PASS | TypeScript and Vite succeeded. Minified JS chunk was 630.56 kB, above Vite's 500 kB warning threshold. |
| Frontend type-check | `npm --prefix frontend run lint` | PASS | `tsc --noEmit`. |
| Frontend tests, first run | `npm --prefix frontend test -- --pool=threads --maxWorkers=1` | FLAKY | 8 files passed; one permission UI test timed out at 5 seconds (29 passed, 1 existing todo). |
| Frontend tests, full rerun | `npm --prefix frontend test -- --pool=threads --maxWorkers=1` | PASS | 9 files passed; 30 passed, 1 existing todo. |
| Focused permission UI rerun | `npm --prefix frontend test -- src/tests/permissions.test.tsx --pool=threads --maxWorkers=1 --testTimeout=15000` | PASS | 1 file; 4 passed, 1 existing todo. |
| Edge Function type-check | `npm run typecheck:functions` | PASS | Deno checked the configured Edge Function entrypoints and shared modules. |
| Frontend dependency audit | `npm audit --prefix frontend --audit-level=high` | PASS | Reported zero known vulnerabilities. |
| Root dependency audit | `npm audit --audit-level=high` | PASS | Reported zero known vulnerabilities. These are point-in-time registry results. |
| Database security tests | `npm run test:db` | BLOCKED | Setup failed with `ECONNREFUSED 127.0.0.1:54329`; all 166 tests skipped before test bodies ran. |
| Edge API security tests | `npm run test:api` | BLOCKED | Setup failed with `ECONNREFUSED 127.0.0.1:54329`; all 26 tests skipped before test bodies ran. |
| Vercel configuration | PowerShell JSON parse and policy assertion | PASS | JSON parsed; SPA rewrite and `frame-src 'self' blob:` are present. Live headers/rendering still require deployment verification. |
| Local unauthenticated browser smoke | Vite served from `frontend` with `VITE_SUPABASE_URL=http://127.0.0.1:9` and a non-credential placeholder key | PARTIAL | Login loaded; signup empty-submit validation rendered required-field errors; direct `/documents/new` navigation redirected to `/login`; a 390px viewport measurement returned no horizontal overflow. No credentials were submitted and no Supabase service was contacted. |
| Worktree credential-shaped scan | Tracked `HEAD` and worktree files scanned by `git grep`; only filenames/no values would be emitted | PASS | No matching credential-shaped values. Ignored local `.env` files were not read or scanned. |
| Hosted Supabase/Vercel behavior | Follow-up checks below | PARTIAL | Limited anonymous Auth/API/Storage and Edge Function checks were run against the owner-confirmed dedicated test project. Authenticated workflows, deployed Vercel behavior, migrations, and account operations remain untested. |

The copy review removed unsupported frontend claims of application-provided AES-256 encryption, complete audit coverage, tag search, and quota status. Vercel CSP was updated to allow the `blob:` preview iframe; deployed headers and rendering still require verification. Provider-managed encryption-at-rest settings were not independently inspected. The observed deletion of `frontend/.env.example` was preserved at the owner's direction; local setup docs now describe manual creation of `frontend/.env`. No migration, remote data, push, or deployment was performed.

## Dedicated test-project authorization checks — 2026-10-21

The owner confirmed the configured hosted Supabase project is dedicated to testing and authorized checks against it. Requests used only the frontend public anon key, no bearer identity, and a fixed nonexistent UUID. Responses were summarized without logging response bodies or credentials. No accounts, rows, files, or settings were created or changed.

| Check | Activity | Result | Notes |
|---|---|---|---|
| Auth service reachability/config | Read-only `GET /auth/v1/settings` | PASS — HTTP 200 | Signup is enabled and email auto-confirm is disabled in the returned public Auth settings. No sign-up or login request was sent. |
| Anonymous profile and document table access | Read-only PostgREST `GET` requests for one `id` from `profiles` and `documents` | PASS — both HTTP 401 | Anonymous Data API reads were rejected. This does not verify authenticated RLS policies. |
| Private Storage bucket metadata | Read-only `GET /storage/v1/bucket/documents` without a user token | PASS — HTTP 400 | Anonymous metadata request was denied/not found. No object download was attempted; private object-level policy was not verified with a real file. |
| Unauthenticated document operation | `POST /functions/v1/document-get` with a fixed nonexistent UUID and no bearer token | PASS — HTTP 401 | Edge Function rejected the request before returning document data. |
| Malformed bearer token | Same document-get operation with a deliberately invalid token | PASS — HTTP 401 | Invalid token was rejected. A valid user token was unavailable. |
| Unauthenticated document/admin functions | POST with no bearer token to preview, download, edit, delete, share, upload, set-role, and audit-query functions | PASS — all HTTP 401 | All eight deployed function routes denied unauthenticated requests. No function was invoked as a user or admin. |
| Function CORS | Read-only `OPTIONS` preflight from `http://127.0.0.1:4173` to document-get | PASS — HTTP 204 | Exact local origin was allowed. Production-origin behavior was not checked. |
| Authenticated sign-in/session and role workflows | No valid isolated test-user session supplied | NOT TESTED | Sign-up, login, logout, session persistence, Admin/Owner/Editor/Viewer permissions, upload, grant/revoke, audit visibility, and post-revocation access still require test identities. |
| Local DB/API suites and mutation harness | Not run | BLOCKED | Bash, Docker, Supabase CLI, and a local PostgreSQL test server are unavailable here. Hosted project was not used for destructive test suites. |

These checks establish only that the hosted test project's public Auth endpoint is reachable and that the tested anonymous routes deny requests. They do not establish valid-token identity handling, role authority, authenticated RLS, owner/viewer permissions, Storage object access, audit outcomes, database migration state, or Vercel deployment behavior.
