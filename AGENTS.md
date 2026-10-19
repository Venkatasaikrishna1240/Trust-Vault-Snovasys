# AGENTS.md — read before changing anything (Claude, VS Code agents, Antigravity)
**Goal:** TrustVault — secure document sharing. Stack is fixed: React+Vite+TS+Tailwind; Supabase Auth/Postgres(RLS)/private Storage/Edge Functions (Deno TS); Vercel.
**Map:** `supabase/migrations/*` (schema → helpers → audit → RLS → svc_* functions → bucket) · `supabase/functions/_shared/{core,handlers}.ts` + one folder per function · `supabase/tests/{db,api,harness}` · `frontend/src`.
## Security invariants (never weaken; add a test with every change)
1. Browser is untrusted. Identity = verified token (`auth.getUser`), never a body field. Role = `profiles.role`, never JWT/user_metadata.
2. Every document decision goes through `app.access_level` / `app.authorize_or_deny`; no caching of positive decisions.
3. Clients can only SELECT under RLS. No client INSERT/UPDATE/DELETE policies on documents, permissions, versions or audit_events. `svc_*` functions are `service_role`-only (a test enumerates this).
4. `documents` Storage bucket: private, restrictive deny policy, accessed only by Edge Functions after authorisation + audit. No signed URLs.
5. Audit rows are written only by `app.write_audit` (hash chain via trigger); never add INSERT/UPDATE/DELETE grants. Failure to audit ⇒ fail closed (no bytes).
6. Denied responses are uniform (`not_found` for "missing or no access"), contain no metadata.
7. Admin ≠ document access. Service-role key only in Edge Function env.
**Never** remove an RLS policy, restriction or authorisation check to make a feature work.
## Commands
`npm run test:backend:local` (DB+HTTP), `npm run test:mutation`, `npm run typecheck:functions`, `npm --prefix frontend run build && npm --prefix frontend test`. Run the relevant ones before claiming completion; report failures honestly.
## Conventions
Migrations: new timestamped file, never edit applied ones in shared environments. SQL: schema-qualified, `set search_path = ''`, revoke-then-grant. TS strict. Commits: imperative, one concern. Update `THREATS.md`, `API.md`, `docs/PROJECT_STATUS.md`, `PROMPTS.md` (real entries only) when behaviour changes. Inspect existing files before editing. Parallel agents must own disjoint files (see docs/multi-agent-workflow.md); security-sensitive changes need review.
