# Security test results

**Date:** 2026-10-20  
**Branch:** `security-hardening`  
**Initial worktree:** clean on `main`; no commit created.

## Automated checks

| Check | Command | Result | Notes |
|---|---|---|---|
| Frontend production build | `npm --prefix frontend run build` | PASS | Latest rerun after recipient-search changes: TypeScript and Vite build succeeded. Vite warned that a minified JavaScript chunk is larger than 500 KiB. See `test-logs/frontend-build-recipient-fix.log`. |
| Frontend lint/type check | `npm --prefix frontend run lint` | PASS | Latest rerun after recipient-search changes: `tsc --noEmit` completed successfully. See `test-logs/frontend-lint-recipient-fix.log`. |
| Frontend Vitest suite | `npm --prefix frontend test` | FAIL on first attempt | Three fork workers timed out during startup; one file reported 5 passing tests before Vitest reported unhandled worker errors. This is recorded as an environment/worker failure, not a clean pass. |
| Frontend Vitest retry | `npm --prefix frontend test -- --pool=threads --maxWorkers=1` | PASS | Latest rerun: 5 test files, 20 passed, 1 existing todo, including account-switch and exact-email lookup regressions. See `test-logs/frontend-tests-recipient-fix.log`. |
| Focused recipient and account-switch regressions | `npm --prefix frontend test -- --pool=threads --maxWorkers=1 src/tests/upload.test.tsx src/tests/authContext.test.tsx` | PASS | 2 test files, 7 tests passed. |
| Focused account-switch regression | `npm --prefix frontend test -- --pool=threads --maxWorkers=1 src/tests/authContext.test.tsx` | PASS | 1 test passed. It asserts that no render pairs Owner B's session with Owner A's profile. See `test-logs/auth-context-test.log`. |
| Edge Function type-check before correction | `npm run typecheck:functions` | FAIL | The script omitted `supabase/functions/deno.json`; Deno could not find the configured `npm:@supabase/supabase-js` package. |
| Configured Deno type-check | `deno check --config supabase/functions/deno.json supabase/functions/*/index.ts supabase/functions/_shared/*.ts` | PASS | The project-configured check passed. |
| Edge Function type-check after correction | `npm run typecheck:functions` | PASS | The corrected npm script passed using `supabase/functions/deno.json`; rerun log: `test-logs/typecheck-functions-recipient-fix.log`. |
| Demo provisioning script syntax | `node --check scripts/provision-demo.mjs` | PASS | Syntax check passed after adding the upload fields. This does not test requests against Supabase. See `test-logs/demo-script-syntax.log`. |

Command output is stored in `test-logs/`. It contains only local build/test output. The latest frontend build, lint and suite results are in files ending in `-recipient-fix.log`.

During test development, the first account-switch assertion queried an accessible name the spinner did not expose; the assertion was changed to check its visible text and the focused test then passed. A separate test-log invocation using `--minWorkers=1` was rejected by Vitest; the supported single-worker command above passed.

## Security review and test scope

- The broad read-only review found no confirmed exploit; its focused account-transition follow-up found the transient display issue fixed in this worktree. A further follow-up found partial recipient search exposed matching accounts; source now requires exact email matching, with frontend, DB and API regression cases added. The frontend tests passed; DB/API test bodies could not run because PostgreSQL was unavailable. Exact-address account confirmation remains possible. See `../SECURITY_AUDIT.md`.
- A focused follow-up found the direct account-replacement gap described in `../SECURITY_AUDIT.md`; the auth context fix and regression test passed locally. Real Supabase Auth and browser account switching remain untested.
- A pattern scan of tracked working-tree files and Git-reachable history found no recognizable Supabase service-role/secret values. This does not cover untracked files, unreachable Git objects, or unrecognized/encoded formats.
- Frontend tests ran locally. They do not establish server-side authorization, RLS, Storage policy behavior, or deployment status.
- Existing DB/API tests cover many negative cases in source, but test definitions are not pass evidence.

## Blocked or not run

| Check | Result | Reason |
|---|---|---|
| `npm run test:db` | ATTEMPTED, BLOCKED | Failed during fixture setup with `ECONNREFUSED 127.0.0.1:54329`; 159 tests were skipped and none ran. See `test-logs/db-tests-unavailable-recipient-fix.log`. |
| `npm run test:api` | ATTEMPTED, BLOCKED | Failed during fixture setup with `ECONNREFUSED 127.0.0.1:54329`; 25 tests were skipped and none ran. See `test-logs/api-tests-unavailable-recipient-fix.log`. |
| `npm run test:backend:local` | NOT RUN | The disposable backend harness prerequisites remain unavailable; direct DB/API attempts above confirm no PostgreSQL server was listening. |
| `npm run test:mutation` | NOT RUN | Same missing backend harness prerequisites. |
| Single-worker invocation with unsupported `--minWorkers=1` option | FAILED | Vitest rejected the option in that invocation; rerun using the supported `--pool=threads --maxWorkers=1` command above passed. The failed command output is preserved in `test-logs/frontend-tests-invalid-option.log`. |
| Direct Supabase Auth/API/Storage authorization | NOT TESTED | No disposable Supabase environment or test credentials were used. No hosted project was accessed. |
| Manual UI login, grant, revoke, account switch, and direct ID manipulation | NOT TESTED | No browser session/test identities were exercised during this session. Procedures are in `manual-test-cases.md`. |
| Hosted migration/function/deployment verification | NOT TESTED | No hosted project was inspected or changed. The last recorded CLI state in older docs is from 2026-10-19 and may be stale. |

## Interpretation

The results show that the frontend builds and its current suite passes when run with one worker, and the Edge Function sources pass the configured Deno type-check. They do **not** show that hosted authentication, RLS, Storage denial, revocation, or audit integrity work end-to-end. Those checks remain open.
