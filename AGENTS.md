# AGENTS.md — TrustVault repository instructions

Applies to GitHub Copilot, Claude, Antigravity, and other coding agents.

## Purpose and stack

TrustVault provides private document storage and owner-controlled named/global-to-signed-in-user sharing. Stack: React 18, Vite, TypeScript, Tailwind, Supabase Auth/Postgres/RLS/private Storage/Edge Functions (Deno), Vercel config. Frontend is `frontend/`; SQL history `supabase/migrations/`; Edge Functions `supabase/functions/{_shared,document-*,admin-*}`; DB/API tests `supabase/tests/{db,api}`; harness `supabase/tests/harness`; scripts `scripts/`; design docs `docs/`.

**Before any change:** inspect the relevant implementation, migrations, tests, existing docs and current Git/status. This workspace may have no `.git` history. Do not infer deployed behavior from local files.

## Authentication and authorization — invariant

- Browser is untrusted. Edge identity is from a token verified using Supabase Auth `getUser()`, never a body field. Role authority is `public.profiles.role`, never JWT/user metadata.
- Use `app.access_level` and `app.authorize_or_deny` for document decisions. Re-evaluate current grants; do not cache positive access.
- Every signed-in profile may upload/own documents. Ownership is separate from account role. Admin status alone never grants document access.
- Read grants permit metadata/current inline preview only. Owner/edit grants permit attachment downloads; owners and active editors may download historical versions (migration 0900). Editors may edit/replace, but only owners share/revoke/delete/change visibility.
- Clients use RLS-protected reads only; no client write policies for documents, versions, permissions or audit events. `svc_*` are service-role-only and must authorize/audit internally.
- Storage bucket `documents` stays private with restrictive client-deny RLS. Only Edge Functions touch bytes after authorization and audit. Do not add signed URLs or direct browser Storage access.
- Audit writes go through `app.write_audit`; preserve append-only triggers, hash chain, details constraints and revoke-then-grant privilege pattern. If an audit prerequisite fails, fail closed and return no file bytes.
- Missing and inaccessible document responses stay metadata-free/uniform. Never relax RLS/authorization to make a UI/test pass.

## Implementation conventions

- SQL must schema-qualify objects, use `set search_path = ''` for functions, follow revoke-then-grant, and add a new timestamped migration; do not edit a migration already applied to a shared database.
- Add DB/API/UI regression tests for each behavior/security change. Keep TypeScript strict. Deno function code belongs in the Deno project and should be checked with `npm run typecheck:functions`.
- Secrets: frontend may contain only `VITE_SUPABASE_URL` and public anon/publishable key. Service-role/secret keys only in Edge Function environment or protected operator process; never commit, print, or request secrets in chat.
- CORS: production/non-local origins are explicit `ALLOWED_ORIGINS`; only HTTP localhost/loopback ports are dynamically accepted for local development. Do not replace this with wildcard CORS.
- Do not edit unrelated application code. Parallel work must own disjoint files and security-sensitive changes need review.

## Validation commands

- `npm --prefix frontend run build`
- `npm --prefix frontend test`
- `npm run typecheck:functions`
- `npm run test:backend:local` (Bash, PostgreSQL 16 tooling, PostgREST and Deno required)
- `npm run test:mutation` (disposable backend harness; mutation is expected to make negative tests fail)

Run relevant checks and report exact commands/results. Do not claim unrun tests pass. `npm run test:functions` is currently a placeholder without Deno unit tests.

## Documentation and Git

Use `docs/DOCUMENTATION_CHECKLIST.md` for feature-impact review. Update only materially affected docs among README, THREATS, PROMPTS, API, this file, PROJECT_WRITEUP, and `docs/`. PROMPTS entries must be genuine; do not invent dates, prompts, mistakes, verification, or commit links. Use imperative one-concern commits when Git is initialized; never fabricate Git history.
