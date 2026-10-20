# TrustVault

TrustVault is a secure document-sharing application: signed-in users upload PDF/PNG/JPEG documents, retain ownership, and grant named people read or edit access. Owners may also publish a document to every signed-in TrustVault account. Authorization is enforced by PostgreSQL RLS/service functions and Supabase Edge Functions; React visibility controls are user experience, not the security boundary.

## Implemented features

- Supabase email/password sign-in and sign-up; database profiles start as `viewer`.
- Every registered profile may upload and own documents. Account role does not grant access to another user's private documents.
- Exact-email recipient lookup for multi-recipient upload sharing, reader/editor selection, grant changes, individual or batch revoke. Partial names and email prefixes are not searchable.
- Optional visibility to all signed-in accounts (not anonymous/public-link access).
- Readers can view metadata and get an audited inline preview; owners/editors can download current and historical versions. Editors can edit/replace files but cannot share or delete. Owners control sharing and deletion.
- Private Storage bucket, byte-level upload validation, server-generated object keys, SHA-256 checking on preview/download, and append-only hash-linked audit events.
- Admin user-role management (`owner`/`viewer`) and read-only audit query/chain verification. Admin status alone does not provide document access.

## Stack and architecture

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, Supabase JS.
- Backend: Supabase Auth, PostgreSQL, RLS, private Storage, Deno TypeScript Edge Functions; Supabase CLI for migrations/deployments; Vercel configuration in `frontend/`.
- Flow: browser Auth token → Edge Function verifies token with `auth.getUser()` → service-role-only `svc_*` database operation authorizes and audits → only after success the function accesses private Storage.
- Main directories: `frontend/src/{pages,features,services}`; `supabase/migrations`; `supabase/functions`; `supabase/tests`; `scripts`; `docs`.
- Current database sequence: 0100 core schema, 0200 authorization helpers, 0300 audit chain, 0400 RLS/privileges, 0500 service functions, 0600 private bucket, 0700 all-account upload/global visibility/preview, 0800 upload-time sharing/recipient lookup/sender names, 0900 editor history downloads, 20261020000100 exact-email recipient lookup.

See [architecture](docs/architecture.md), [permission model](docs/permission-model.md), and [security design](docs/security-design.md).

## Requirements and local setup

Requires Node.js 20+, npm, Docker Desktop, and Supabase CLI. The frontend-only build does not require Docker. The full local backend requires the CLI's Docker services.

1. At the repository root run `npm install` and `npm --prefix frontend install`.
2. Start Docker Desktop. Run `npx supabase start`. It applies `supabase/migrations/` and `supabase/seed.sql`; the seed is strictly local-development-only.
3. Create `frontend/.env` with the local Supabase URL and publishable/anon key printed by the CLI:
	- `VITE_SUPABASE_URL=http://127.0.0.1:54321`
	- `VITE_SUPABASE_ANON_KEY=<local-publishable-or-anon-key>`
	Never use a service-role/secret key in frontend configuration.
4. `supabase/functions/.env` supplies local `ALLOWED_ORIGINS` and `MAX_UPLOAD_BYTES`. Run `npx supabase functions serve --env-file supabase/functions/.env` in its own terminal.
5. Run `npm run dev` and open the Vite URL (normally `http://localhost:5173`). The current local Edge Function source allows HTTP localhost/loopback on any development port; non-local origins must be explicitly configured. Redeploy functions after source changes. If you change frontend project URL/key, restart Vite.

Local seed accounts (fictional; **never hosted**): `admin@trustvault.test`, `owner@trustvault.test`, `owner2@trustvault.test`, `viewer@trustvault.test`, `outsider@trustvault.test`; password for all is `LocalDemo-Only-1234`. `scripts/provision-demo.mjs` can provision demo accounts and documents in a dedicated test project. It uses the privileged service key from the environment, resets passwords for already existing demo accounts, and prints the demo password once. Use only with a disposable local/test project; never publish its output. See [local development](docs/local-development.md).

## Environment and secrets

- Frontend `frontend/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public/publishable key only).
- Edge Function secrets: `ALLOWED_ORIGINS` (comma-separated exact non-local origins; no wildcard), `MAX_UPLOAD_BYTES` (implementation allows up to 20 MiB, but the current Storage bucket is capped at 10 MiB, so keep the effective upload limit at or below 10 MiB).
- Supabase injects `SUPABASE_URL`, anon/publishable key and service-role/secret key into Edge Functions. Never expose service-role/secret values in frontend env, source control, documentation, or chat.
- Copy `frontend/.env.example` to `frontend/.env` and `supabase/functions/.env.example` to `supabase/functions/.env`; fill them only with local public values and non-secret development settings. Both actual env files are ignored by Git. Never put a service-role key in the frontend env file.

## Run and test

- Frontend dev server: `npm run dev`.
- Frontend production build: `npm --prefix frontend run build`.
- Frontend lint/type check: `npm --prefix frontend run lint`.
- Frontend tests: `npm --prefix frontend test -- --pool=threads --maxWorkers=1` (single worker; avoids the startup timeout seen with the default pool in this environment).
- Edge Function type check: `npm run typecheck:functions` (Deno required).
- Backend DB/API tests: `npm run test:backend:local` (Bash, disposable PostgreSQL 16 test cluster, PostgREST binary, Deno, and helper tools; see [testing](docs/testing.md)).
- DB or API suite separately: `npm run test:db`, `npm run test:api` once the harness services are running/configured.
- Mutation test: `npm run test:mutation`; intentionally changes the test authorization helper and expects negative tests to fail under the mutant. It rebuilds its disposable database.
- `npm run test:functions` is currently a placeholder; there are no separate Deno unit tests.

Tests do not substitute for real Supabase Auth/Storage or browser E2E checks. The current local build, lint, frontend test and Deno type-check results are in [test scope/status](docs/testing.md) and [the evidence report](evidence/security-test-results.md). The backend suite has not been run against the latest schema in this environment.

Fresh local verification for the security-hardening work is recorded in [evidence/security-test-results.md](evidence/security-test-results.md), with sanitized command output in [evidence/test-logs/](evidence/test-logs/). The [security audit](SECURITY_AUDIT.md), [requirements matrix](docs/requirements-evidence.md), and [security testing guide](docs/security-testing.md) distinguish source coverage from checks not run. The backend database/API suites and real Supabase Auth/Storage checks were not run in this environment; do not interpret local frontend or type-check results as proof of deployed authorization.

## Database and deployment

For a new hosted project, create the Supabase project, verify the `project_ref`, then use `npx supabase login`, `npx supabase link --project-ref <ref>`, review `npx supabase migration list --linked` and `npx supabase db push --dry-run`, and only then push. Deploy Edge Functions with `npx supabase functions deploy`; configure production `ALLOWED_ORIGINS`; configure Auth site/redirect URLs and email confirmation. Provision the first admin via a trusted operator process after the Auth profile exists. Configure Vercel root directory as `frontend` and set the two public VITE variables.

**Last recorded deployment inspection (2026-10-19):** linked project ref `twyfmmtzbcjwlkfwwijm` had migrations 0100–0800 recorded and all nine functions active; migration 0900 was pending at that time. This is historical CLI evidence, not a current check. Check the verified target and its migration/function versions before making any hosted change. No hosted operation was performed for this work. Detailed steps: [deployment](docs/deployment.md).

## Known limitations and unfinished work

- No antivirus, content sanitization, or polyglot-file detection; only PDF/PNG/JPEG signatures/terminators, extension/MIME consistency and size are checked.
- Preview sends bytes to the browser, so screenshots/copying cannot be prevented. Downloads already obtained cannot be recalled.
- A request authorized before a revoke commits may finish; every subsequent request re-evaluates access. No signed URLs are used.
- Audit chain is tamper-evident, not tamper-proof against database owners; writes serialize globally and use a 5-second lock timeout.
- Storage deletion can be incomplete; soft-delete/access revocation occurs before byte purge, so inaccessible orphan objects may require cleanup. Backups/retention are not configured here.
- Recipient lookup intentionally reveals limited matching registered names/emails (3-character minimum, 20 results, audited/rate-limited); exact grant calls can probe whether an email is registered.
- No Playwright E2E suite; real hosted Auth/Storage/browser testing and Deno unit tests are not established. One frontend test is marked `todo`; the production JS bundle exceeds Vite's 500 KiB warning threshold.
- Admin cannot promote accounts to admin through the app; initial/admin provisioning is out-of-band. Admin is not a document-access role.
- The sign-up page's current explanatory sentence says an administrator can grant upload rights; this is stale UI copy. Current migration 0700 allows every profile-backed signed-in account to upload.
- `scripts/provision-demo.mjs` does not send the currently required upload sharing fields, so its end-to-end provisioning flow is unfinished and is not verified.
