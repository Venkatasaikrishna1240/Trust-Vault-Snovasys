# Security test results

**Date:** 2026-10-20  
**Branch:** `security-hardening`  
**Git baseline for this review:** clean on `security-hardening`, tracking `origin/security-hardening` at `cdf88b5`. Earlier hardening changes are already in history; this review did not create a commit.

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
| Direct Supabase Auth/API/Storage authorization | NOT TESTED | No disposable Supabase environment or test credentials were used. No hosted project was accessed. |
| Manual UI login, grant, revoke, account switch, and direct ID manipulation | NOT TESTED | No browser session/test identities were exercised during this session. Procedures are in `manual-test-cases.md`. |
| Hosted migration/function/deployment verification | NOT TESTED | No hosted project was inspected or changed. The last recorded CLI state in older docs is from 2026-10-19 and may be stale. |

## Interpretation

The latest results show that the frontend builds and its suite passes when run with one worker, and the Edge Function sources pass the configured Deno type-check. The new audit event semantics and SQL migration have not been exercised against PostgreSQL; the DB/API cases are definitions only. The results do **not** establish hosted authentication, RLS, Storage denial, revocation, audit integrity or actual browser receipt/display end-to-end.
