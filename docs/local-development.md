# Local development

## Requirements

- Node.js 20+ and npm.
- Supabase CLI (`npx supabase ...` works with the project dev dependency).
- Docker Desktop for local Supabase services (`supabase start`).
- Deno for Edge Function serving/type checking.
- For Docker-free backend tests: Bash, PostgreSQL 16 server binaries, PostgREST and Deno, plus utilities used by scripts.

A Deno VS Code workspace setup is present in `.vscode/settings.json`; the Deno extension/runtime are separate developer tools.

## Start local Supabase and app

From repository root:

1. `npm install`
2. `npm --prefix frontend install`
3. Start Docker Desktop.
4. `npx supabase start` — applies local migrations and `supabase/seed.sql` and prints local API URL/keys. This is your local database, not hosted data.
5. Copy `frontend/.env.example` to `frontend/.env` and replace its placeholders using only the printed local public values:
   - `VITE_SUPABASE_URL=http://127.0.0.1:54321`
   - `VITE_SUPABASE_ANON_KEY=<local-anon-or-publishable-key>`
6. In another terminal: `npx supabase functions serve --env-file supabase/functions/.env`.
7. In another terminal: `npm run dev`, then use the displayed Vite URL. The configured redirect list has common ports; updated Edge Function CORS allows any HTTP localhost/loopback port. Do not put a service-role key in frontend `.env`.

If running local function serving, copy `supabase/functions/.env.example` to `supabase/functions/.env`. It contains only local CORS and upload-size settings; that env file is ignored and must not be committed. Supabase injects `SUPABASE_URL`, anon/publishable and service-role values into local functions.

## Demo users

The configured local seed creates `admin@trustvault.test`, `owner@trustvault.test`, `owner2@trustvault.test`, `viewer@trustvault.test`, and `outsider@trustvault.test`, all using `LocalDemo-Only-1234`. Local only; never use that password outside disposable local development. `scripts/provision-demo.mjs` creates accounts/documents through the real API and includes the required upload fields. It needs a dedicated test Supabase project and privileged environment variables; it can reset demo-account passwords and prints the generated password once. Its end-to-end behavior was not run in this workspace. Do not use it against production or expose its output.

## Stop and reset

- `npx supabase stop` stops the local stack.
- `npx supabase db reset` destructively recreates the local DB, reapplies migrations and seed. Never use against hosted DB; CLI reset targets local stack only when invoked without linked remote workflow.
- `npm run db:reset` is a separate Bash/PostgreSQL test-harness reset, not the Supabase CLI stack.

## Troubleshooting

- Browser says function/network/CORS error: check the frontend URL points at the intended local/hosted project, the function is being served/deployed there, and inspect browser network preflight. Current local code accepts loopback ports dynamically; hosted function deployment must contain the same code. Non-local origins need explicit `ALLOWED_ORIGINS`.
- `npm run typecheck:functions`: install Deno and ensure its binary is on PATH; VS Code can use `.vscode/settings.json` Deno settings.
- Backend test runner: Bash/PG/PostgREST/Deno requirements differ from `supabase start`; see `docs/testing.md` and `scripts/run-local-backend-tests.sh`.
