# Testing — what ran, what it proves, what it doesn't
Executed in the author's sandbox (Linux, PostgreSQL 16, PostgREST 12.2.12, Deno 2.9, Node 22):
- **156 DB tests** (`supabase/tests/db`): RLS per table/role, anon denial, column privileges, function-exposure audit, Storage denial (+ restrictive policy vs. a broad permissive one), svc_* behaviour, revocation, audit append-only/hash chain/tamper/concurrency/fail-closed. Uses a Supabase *shim* (roles, `auth.uid()`, default privileges) — `supabase_shim.sql`.
- **22 HTTP tests** (`supabase/tests/api`): the real Edge Function handlers + PostgREST: 401s, cross-user denial with no metadata/bytes, grants, immediate revocation, upload validation, direct Data-API writes denied, audit over HTTP, fail-closed. Harness differences: HS256 test-token verifier instead of the Auth server; in-memory object store instead of Storage API.
- **Mutation test**: with `app.access_level` forced to 'owner', 25 tests fail (baseline passes).
- **Frontend**: build + 17 tests pass, 1 `it.todo`; `npm audit` 0 vulns. **Deno type-check** of all functions passes.
**NOT run:** `supabase start` stack (no Docker here), real GoTrue login, real Storage API, seed.sql, provision-demo.mjs, Playwright, browser/manual UI test, deployment. Run `supabase start` then the same suites against it with `TV_BASE_URL`/`TEST_DATABASE_URL` (token minting in api tests is harness-specific — adapt to sign-in tokens).
Commands: `npm run test:backend:local`, `npm run test:mutation`, `npm --prefix frontend test`.
