# Security testing guide

Run tests only against a disposable local Supabase stack or a dedicated test project with dummy files and accounts. Do not run provisioning, reset, mutation, or destructive cases against production. Never put service-role keys, passwords, access tokens, or document contents in test logs or chat.

## Local setup

1. Install dependencies and start a local Supabase stack using the steps in `local-development.md`.
2. Use `frontend/.env.example` and `supabase/functions/.env.example` as templates. The frontend receives only the local URL and public anon/publishable key. Supabase supplies service credentials to local Edge Functions.
3. Use the fictional local seed identities or a separate disposable project. Keep owner A, owner B, viewer, and admin as distinct Auth users. The local seed password is documented in `docs/local-development.md`; do not use it outside local development.
4. Start local functions and the frontend. Confirm the URL is local before using `scripts/provision-demo.mjs`; that script has privileged behavior and resets passwords for matching existing demo accounts.

## Repeatable automated checks

From repository root:

```powershell
npm --prefix frontend run build
npm --prefix frontend test -- --pool=threads --maxWorkers=1
npm run typecheck:functions
```

The constrained frontend worker command avoids a worker-start timeout observed in this environment. To run DB/API suites, install Bash, PostgreSQL 16 server tools, PostgREST, Deno, and the helper utilities, then run:

```sh
npm run test:backend:local
```

That script rebuilds its disposable backend test database. It must not be pointed at a hosted/production project. `npm run test:mutation` intentionally breaks authorization in that disposable harness and expects negative tests to fail. `npm run test:functions` is a placeholder, not a test suite.

See `../evidence/security-test-results.md` for the exact commands that were run in this workspace and which were blocked.

## Manual authorization checks

`../evidence/manual-test-cases.md` provides step-by-step cases with expected outcomes. At minimum:

1. As owner A, upload a harmless dummy PDF and grant viewer B read access.
2. As viewer B, confirm metadata and preview work; confirm download/edit/delete are denied.
3. As owner A, revoke viewer B. Repeat preview, download, history, edit and delete requests. Each subsequent protected request should fail without document metadata or bytes.
4. Attempt direct Data API and Storage requests with viewer B's own access token; never substitute an admin/service-role key.
5. Confirm owner B/admin/outsider cannot access owner A's private document by changing IDs in URLs or request bodies.
6. Inspect the audit events as an authorized admin; attempt ordinary-client changes only in the disposable DB harness and confirm they are rejected.

Expected HTTP status codes and metadata behavior are in `API.md`. Keep an already downloaded copy out of the test evidence; revocation cannot erase data already delivered to a user's device.

## Evidence rules

- Record command, date, exit result, counts, and relevant warnings.
- Keep raw output sanitized. Never capture secrets, login forms, private documents, or real-user information.
- Mark a test NOT TESTED if credentials, local services, or a browser session are unavailable.
- Do not convert a static code review, a test definition, a mocked test, or an old pass count into a runtime PASS.
- Hosted Auth, Storage, CORS, migration state and deployment must be verified separately against the intended project. No such hosted check was performed for this review.
