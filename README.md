# TrustVault — secure document sharing (Supabase + React)

Every signed-in account can upload and own documents, with named-user read/edit access or optional visibility to all signed-in accounts; immediate revocation; mandatory audit trail; security enforced in
PostgreSQL (RLS), private Storage and Edge Functions — never in the React UI.
Start with **docs/PROJECT_STATUS.md** (what is done / not done / tested).

## Layout
`frontend/` React+Vite+TS+Tailwind · `supabase/migrations/` schema, RLS, audit chain, Storage bucket and authenticated-wide visibility ·
`supabase/functions/` 8 Edge Functions (+`_shared`) · `supabase/tests/` DB + HTTP security tests ·
`scripts/` provisioning, local test runner, mutation test, packaging · `docs/` design docs.

## Run locally (needs Node 20+, Docker, Supabase CLI)
```bash
npm install && npm --prefix frontend install
supabase start                      # applies supabase/migrations + seed.sql (local demo users)
supabase functions serve --env-file supabase/functions/.env   # copy .env.example first
cp frontend/.env.example frontend/.env   # fill URL + anon key printed by `supabase start`
npm run dev                          # http://localhost:5173 (or npm --prefix frontend run dev)
```
The shared Edge Function CORS handler accepts HTTP localhost/loopback on any port for development, so Vite port changes (5173, 5176, etc.) do not require CORS-secret edits. This applies only after the updated functions are deployed; non-local frontend origins must still be explicitly listed in `ALLOWED_ORIGINS`. A browser network error can mean a required function is not deployed to the Supabase project configured in `frontend/.env`; deploy all functions after applying migrations 0700 and 0800.
Local demo logins (from `seed.sql`, LOCAL ONLY): admin@/owner@/owner2@/viewer@/outsider@`trustvault.test`,
password `LocalDemo-Only-1234`. Then optionally `npm run provision:demo` to create fictional documents/grants via the real API
(env vars in the script header). For hosted projects never use seed.sql — use `provision-demo.mjs` (random password).

## Tests
| Command | Needs | What |
|---|---|---|
| `npm --prefix frontend test` / `run build` | Node | UI tests, type-check + build |
| `npm run typecheck:functions` | Deno | type-checks Edge Functions |
| `npm run test:backend:local` | PostgreSQL 16 server, `postgrest` + `deno` binaries (`TV_POSTGREST_BIN`, `TV_DENO`) | 156 DB + 22 HTTP security tests, no Docker |
| `npm run test:mutation` | same | breaks the authorisation check, expects failures |
See docs/testing.md for exactly what each run does and does not prove.

## Environment variables
Frontend (`frontend/.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key only).
Edge Functions (secrets): `ALLOWED_ORIGINS` (explicit list, no `*`), `MAX_UPLOAD_BYTES` (default 10 MiB; bucket limit is 10 MiB in migration 0600).
`SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY` are injected by Supabase. **The service-role key never goes in the frontend or in Git.**

## Deploy (summary — see docs/deployment.md)
`supabase link --project-ref <ref> && supabase db push && supabase functions deploy && supabase secrets set ALLOWED_ORIGINS=https://<your-vercel-domain>`;
Vercel: root `frontend/`, set the two VITE_ vars. Enable e-mail confirmation in Auth. **Not deployed by the author of this repo.**
