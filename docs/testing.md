# Testing: commands, coverage, evidence, limits

Fresh results through 2026-10-21 are in `evidence/security-test-results.md`; command output is under `evidence/test-logs/`. Older pass counts are historical, not current-run evidence.

## Commands in this repository

| Command | What it runs | Requirements / notes |
|---|---|---|
| `npm --prefix frontend run build` | Frontend TypeScript check and Vite production build. | Passed on 2026-10-21; Vite reports one minified chunk above 500 KiB. Does not check Deno functions, SQL behavior, or deployment. |
| `npm --prefix frontend run lint` | Frontend TypeScript check (`tsc --noEmit`). | Passed on 2026-10-21. |
| `npm --prefix frontend test -- --pool=threads --maxWorkers=1` | Frontend Vitest suite with one worker. | Latest full rerun on 2026-10-21 passed: 9 files, 30 passed, 1 existing todo. The first full run had one 5-second timeout (29 passed); the isolated permission file passed with `--testTimeout=15000`. |
| `npm run typecheck:functions` | Deno check of all Edge Function entrypoints and shared TS using the function project config. | Passed on 2026-10-21 after the script was updated to pass `supabase/functions/deno.json`. |
| `npm run test:backend:local` | DB + HTTP integration suites against a disposable PostgreSQL/PostgREST/Deno test harness. | Bash, PostgreSQL 16 server tooling, PostgREST, Deno and helper commands; environment variables `TV_POSTGREST_BIN` and `TV_DENO` can specify binaries. Script resets its disposable test database. Not the hosted project. |
| `npm run test:db` | Vitest DB suite (`supabase/tests/db`). | Requires the harness/test database to be running. |
| `npm run test:api` | Vitest API HTTP suite (`supabase/tests/api`). | Requires harness/PostgREST services and test DB. API harness uses HS256 test-token verification and in-memory Storage, not real Auth/Storage. |
| `npm run test:mutation` | Rebuilds disposable backend DB and runs authorization mutation against negative tests. | A healthy baseline passes, then the deliberately broken authorization mutant is expected to cause failures. Never run against production data. |
| `npm run test:functions` | Placeholder message only. | There are no separate Deno unit tests; use `npm run typecheck:functions` and API harness tests. |
| `npm audit --prefix frontend --audit-level=high`; `npm audit --audit-level=high` | Check known advisories for frontend and root dependency trees. | Both reported zero vulnerabilities on 2026-10-21; this is point-in-time registry data, not a guarantee against future advisories. |

## Test organization and examples

- `supabase/tests/db/rls.test.ts`: per-table RLS, anonymous denial, guessed/cross-user IDs, column grants, client write denial, profile/role escalation, audit visibility, safe search, storage-policy denial and svc privilege enumeration.
- `supabase/tests/db/svc.test.ts`: upload authorization, recipient display-name/email-username suggestions, wildcard/SQL-like query probes, current/historical download, read/edit behavior, grants and revocation, metadata/file edits, delete, role changes, audit queries, post-verification delivery recording, and fail-closed service operations.
- `supabase/tests/db/notifications.test.ts`: direct and global share notices, edit/replacement notifications to current recipients and owner, global-update delivery to signed-in users, recipient-only RLS, user-bound read state, and denied direct writes.
- `supabase/tests/db/audit.test.ts`: append-only triggers, hash chain, sequence/link correctness, tampering, known recomputed-chain limitation, concurrency, lock/revocation timing.
- `supabase/tests/api/security.test.ts`: function authentication, CORS preflight, upload-time sharing/global visibility, recipient name/username suggestions and SQL-like probes, preview/download, edit/history, revoke, direct PostgREST bypass, audit/admin, malformed and malicious uploads. The audit case covers successful/denied preview, download, grant and revoke records with resolved names and permission fields.
- `frontend/src/tests/auditFormat.test.ts`: human-readable audit wording and the guarantee that older authorization-only records are not described as verified deliveries.
- `frontend/src/tests`: `apiClient.test.ts`, `authContext.test.tsx`, `authGuard.test.tsx`, `permissions.test.tsx`, `upload.test.tsx`.
- `frontend/src/tests/notificationCenter.test.tsx`: initial unread list, read-on-open behavior, toast only for newly received notices, and the message shown when the notification migration is absent; `loginRedirect.test.tsx` covers dashboard landing from a shared-document deep link.

## Evidence and caveats

- Fresh build, frontend test, and type-check results are recorded in `evidence/security-test-results.md`.
- In the preceding seven-requirement review, `npm run test:db` and `npm run test:api` failed during setup because PostgreSQL was unavailable at `127.0.0.1:54329`; 159 DB tests and 25 API tests were skipped. The audit activity run below repeats those attempts with the newer test counts.
- In the audit activity change, the DB/API attempts were repeated: all 160 DB tests and 26 API tests were skipped at fixture setup with the same connection refusal. A later DB rerun after adding the filename-at-event-time assertion again failed to connect; all 161 current DB tests were skipped. The new delivery, activity, and historical-filename assertions are test definitions, not runtime evidence. See `../evidence/test-logs/audit-activity-db-tests-rerun.md`.
- Historical repository text reports 156 DB and 22 API tests plus a passing mutation baseline for an earlier snapshot. These counts are **not a fresh run after migrations 0700–0900**. Migration 0900 was pending in the last linked hosted migration list, and no full backend run after that change is recorded.
- SQL harness shim does not emulate GoTrue or the actual Supabase Storage API. It cannot prove remote gateway JWT, real Storage byte access, hosted CORS secrets, or browser end-to-end behavior.
- No automated Playwright suite exists. A 2026-10-21 local unauthenticated browser smoke check verified the login page, empty sign-up validation, protected deep-link redirect, and no horizontal overflow at 390px using dummy local Supabase settings. A later read-only check confirmed the supplied Vercel login URL and configured response headers, plus one allowed Supabase preflight. Real sign-in, Storage API direct-denial, hosted upload/preview/download, authenticated Vercel behavior, and backup retention still require manual/integration verification.
- Notification database tests require the migration and disposable PostgreSQL harness. Realtime delivery and 30-second missed-event recovery require a live authenticated client and are not proven by frontend mocks.
- On 2026-10-20 the focused notification DB test was attempted with `npx vitest run supabase/tests/db/notifications.test.ts`; setup failed with `ECONNREFUSED 127.0.0.1:54329`, so all 5 cases were skipped before execution.
- The linked project's notification table/policies/triggers/RPC were verified through Management API metadata and its migration version recorded. That check is not a substitute for running the DB suite or performing a signed-in UI/Realtime integration test.

Run the exact command and record its complete outcome before changing this section. Never convert a historical count into a claim that the latest code passed.
