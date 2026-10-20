# Testing: commands, coverage, evidence, limits

Fresh results from 2026-10-20 are in `evidence/security-test-results.md`; command output is under `evidence/test-logs/`. Older pass counts are historical, not current-run evidence.

## Commands in this repository

| Command | What it runs | Requirements / notes |
|---|---|---|
| `npm --prefix frontend run build` | Frontend TypeScript check and Vite production build. | Passed on 2026-10-20; Vite reports one minified chunk above 500 KiB. Does not check Deno functions, SQL behavior, or deployment. |
| `npm --prefix frontend run lint` | Frontend TypeScript check (`tsc --noEmit`). | Passed on 2026-10-20. |
| `npm --prefix frontend test -- --pool=threads --maxWorkers=1` | Frontend Vitest suite with one worker. | Passed on 2026-10-20: 5 files, 19 passed, 1 todo. The default worker invocation first timed out starting workers in this environment. |
| `npm run typecheck:functions` | Deno check of all Edge Function entrypoints and shared TS using the function project config. | Passed on 2026-10-20 after the script was updated to pass `supabase/functions/deno.json`. |
| `npm run test:backend:local` | DB + HTTP integration suites against a disposable PostgreSQL/PostgREST/Deno test harness. | Bash, PostgreSQL 16 server tooling, PostgREST, Deno and helper commands; environment variables `TV_POSTGREST_BIN` and `TV_DENO` can specify binaries. Script resets its disposable test database. Not the hosted project. |
| `npm run test:db` | Vitest DB suite (`supabase/tests/db`). | Requires the harness/test database to be running. |
| `npm run test:api` | Vitest API HTTP suite (`supabase/tests/api`). | Requires harness/PostgREST services and test DB. API harness uses HS256 test-token verification and in-memory Storage, not real Auth/Storage. |
| `npm run test:mutation` | Rebuilds disposable backend DB and runs authorization mutation against negative tests. | A healthy baseline passes, then the deliberately broken authorization mutant is expected to cause failures. Never run against production data. |
| `npm run test:functions` | Placeholder message only. | There are no separate Deno unit tests; use `npm run typecheck:functions` and API harness tests. |

## Test organization and examples

- `supabase/tests/db/rls.test.ts`: per-table RLS, anonymous denial, guessed/cross-user IDs, column grants, client write denial, profile/role escalation, audit visibility, safe search, storage-policy denial and svc privilege enumeration.
- `supabase/tests/db/svc.test.ts`: upload authorization, exact-email-only recipient lookup, current/historical download, read/edit behavior, grants and revocation, metadata/file edits, delete, role changes, audit queries, fail-closed service operations.
- `supabase/tests/db/audit.test.ts`: append-only triggers, hash chain, sequence/link correctness, tampering, known recomputed-chain limitation, concurrency, lock/revocation timing.
- `supabase/tests/api/security.test.ts`: function authentication, CORS preflight, upload-time sharing/global visibility, exact-email recipient lookup (including partial-query denials), preview/download, edit/history, revoke, direct PostgREST bypass, audit/admin, malformed and malicious uploads.
- `frontend/src/tests`: `apiClient.test.ts`, `authContext.test.tsx`, `authGuard.test.tsx`, `permissions.test.tsx`, `upload.test.tsx`.

## Evidence and caveats

- Fresh build, frontend test, and type-check results are recorded in `evidence/security-test-results.md`; sanitized command output is under `evidence/test-logs/`.
- Historical repository text reports 156 DB and 22 API tests plus a passing mutation baseline for an earlier snapshot. These counts are **not a fresh run after migrations 0700–0900**. Migration 0900 was pending in the last linked hosted migration list, and no full backend run after that change is recorded.
- SQL harness shim does not emulate GoTrue or the actual Supabase Storage API. It cannot prove remote gateway JWT, real Storage byte access, hosted CORS secrets, or browser end-to-end behavior.
- No Playwright suite exists. Real sign-in, Storage API direct-denial, hosted upload/preview/download, actual Vercel deployment, and backup retention require manual/integration verification.

Run the exact command and record its complete outcome before changing this section. Never convert a historical count into a claim that the latest code passed.
