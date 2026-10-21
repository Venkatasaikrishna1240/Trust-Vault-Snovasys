# Local development

## Requirements

Required to run the complete app locally:

- Windows 10/11 (the commands below use PowerShell), Node.js 20 or later, and npm.
- Docker Desktop installed, running, and permitted to start its Linux containers.
- The Supabase CLI, run through this repository's installed dependency as `npx supabase`; a separate global CLI install is not needed.

Deno is needed for `npm run typecheck:functions`, but not to run the app. The local Edge Function runtime is started by the Supabase CLI. Bash, PostgreSQL 16 server tools, PostgREST, and Deno are additional requirements only for the separate Docker-free backend test harness; see [testing](testing.md).

## Start on Windows (PowerShell)

Open PowerShell with the current directory set to the repository root (the directory containing the root `package.json`). Run these commands in order.

### Terminal 1 — install dependencies and start the local backend

```powershell
npm install
npm --prefix frontend install
npx supabase start
```

The first run may take several minutes while Docker images are downloaded. `supabase start` starts a local Supabase stack, applies the repository migrations and local-only seed, and prints the local API URL and public anon/publishable key. It uses local containers, not the hosted project.

Leave this terminal and the stack running. If the CLI reports that Docker is unavailable, start Docker Desktop, wait for it to finish starting, and rerun `npx supabase start`.

### Configure the local environment files

Open a second PowerShell terminal at the repository root. This checkout has no `frontend/.env.example`, so create `frontend/.env` manually with the values from the local Supabase CLI output. Copy the Edge Function example if you do not already have a local file:

```powershell
if (-not (Test-Path 'supabase\functions\.env')) { Copy-Item 'supabase\functions\.env.example' 'supabase\functions\.env' }
```

Create `frontend\.env` with the values from the output of `npx supabase start`:

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<the local anon or publishable key printed by Supabase CLI>
```

Keep the example's `ALLOWED_ORIGINS=http://localhost:5173` and `MAX_UPLOAD_BYTES=10485760` values in `supabase/functions/.env` for the default local Vite port. These are development settings, not hosted credentials. Never put a service-role/secret key in `frontend/.env`.

### Terminal 2 — serve the Edge Functions

Open another PowerShell terminal at the repository root and run:

```powershell
npx supabase functions serve --env-file supabase/functions/.env
```

Leave this terminal running. Supabase provides the local Supabase environment values to the functions; the env file contains only the local CORS and upload-size settings.

### Terminal 3 — start the frontend

Open another PowerShell terminal at the repository root and run:

```powershell
npm run dev
```

Open the local URL Vite prints (normally `http://localhost:5173`). For the local seeded demo, the accounts are `admin@trustvault.test`, `owner@trustvault.test`, `owner2@trustvault.test`, `viewer@trustvault.test`, and `outsider@trustvault.test`; their shared password is `LocalDemo-Only-1234`. These accounts and this password are for the local seeded database only. Never use them on a hosted project.

If the frontend URL or public key changes, edit `frontend/.env` and restart the Vite server. If you choose another frontend port, update `ALLOWED_ORIGINS` in `supabase/functions/.env` and restart the function server. Do not expose a service-role key in browser configuration.

## Stop and reset

- Press `Ctrl+C` in the frontend and function-server terminals.
- `npx supabase stop` stops the local Supabase stack.
- `npx supabase db reset` destructively recreates the local database, then reapplies migrations and seed. Use only for the local stack, never against hosted data.
- `npm run db:reset` is a separate Bash/PostgreSQL test-harness reset, not the Supabase CLI stack.

## Troubleshooting

- Browser reports a function/network/CORS error: verify `frontend/.env` points to `http://127.0.0.1:54321`, confirm the local stack and function-serving terminal are still running, and check that `ALLOWED_ORIGINS` matches the Vite origin.
- `npx supabase start` cannot connect: start Docker Desktop and wait until its engine is ready.
- `npm run typecheck:functions` cannot find Deno: install Deno and ensure it is on `PATH`; this check is optional for running the app.
- Backend test runner: its Bash/PostgreSQL/PostgREST/Deno requirements are separate from running the app; see [testing](testing.md) and `scripts/run-local-backend-tests.sh`.

## Demo users

The configured local seed creates `admin@trustvault.test`, `owner@trustvault.test`, `owner2@trustvault.test`, `viewer@trustvault.test`, and `outsider@trustvault.test`, all using `LocalDemo-Only-1234`. Local only; never use that password outside disposable local development. `scripts/provision-demo.mjs` creates accounts/documents through the real API and includes the required upload fields. It needs a dedicated test Supabase project and privileged environment variables; it can reset demo-account passwords and prints the generated password once. Its end-to-end behavior was not run in this workspace. Do not use it against production or expose its output.

For a dedicated test Supabase project, `scripts/provision-demo.mjs` can create demo accounts and documents through the real API. It requires privileged environment variables, can reset passwords for those named demo accounts, and prints a generated password once. Its end-to-end behavior has not been verified in this workspace. Do not use it against production or expose its output.
