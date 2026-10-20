# Hosted deployment (operator procedure)

Do not infer deployed behavior from local source. Verify the Supabase project reference from `frontend/.env` and the dashboard before any database operation. The linked project observed on 2026-10-19 was `twyfmmtzbcjwlkfwwijm`; the same day's CLI inspection showed 0100–0800 applied, migration 0900 pending, and nine functions active. Recheck current state before proceeding.

## New/existing Supabase project

1. Create/select the intended Supabase project and confirm its project ref. Securely install Supabase CLI and run `npx supabase login` (token is typed into terminal, never chat).
2. From repository root run `npx supabase link --project-ref <verified-project-ref>`.
3. Inspect `npx supabase migration list --linked` and `npx supabase db push --dry-run`. If old migrations unexpectedly appear pending while tables/functions already exist, stop and compare hosted schema before repairing migration history. Do not re-run the initial schema against an already-built project.
4. Apply only expected pending migrations via `npx supabase db push`. At the last observed deployment, migration 0900 (editor access to historical version downloads) was pending; migration 0900 must be applied for that behavior. The local source also now includes `20261020000100_exact_email_recipient_lookup.sql`; deploy it to replace partial directory search only after verifying the target project's migration history. This docs audit did not apply either migration.
5. Set Edge Function secrets in Supabase Dashboard or `npx supabase secrets set --env-file <protected-env-file>`. Set `ALLOWED_ORIGINS` to exact production frontend origins, comma-separated, with no wildcard. Do not replace an existing list without preserving required domains. Local HTTP localhost/loopback ports are dynamically allowed by the current function source for development only.
6. Deploy all current functions: `npx supabase functions deploy`. Nine source endpoints are configured: admin-audit-query, admin-set-role, document-delete, document-download, document-edit, document-get, document-preview, document-share, document-upload. Verify with `npx supabase functions list --project-ref <ref>`.
7. Auth settings: configure Site URL/redirects for deployed frontend, enable email confirmation per production policy, and keep minimum password length aligned with application validation (12 characters). Apply MFA policy for administrators operationally if required; repository does not enforce MFA.
8. Create the first administrator through a trusted operator path after the Auth user/profile exists. The app cannot create admins. Never grant admin via user metadata. Use a strong unique password through Auth, not SQL.
9. Deploy frontend to Vercel with project root `frontend` and only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` set as client-visible variables. Never put service-role/secret keys in Vercel frontend environment.
10. Run live smoke checks: recipient lookup, upload, read preview, editor current/history download (only after 0900), revoke, admin role update, admin audit query, and Storage direct client denial. Record actual outcome and project ref without exposing keys.

## Demo data cautions

`supabase/seed.sql` is local-only and contains a shared known demo password. Do not run it on hosted projects. `scripts/provision-demo.mjs` creates fictional users/documents through Supabase Admin API and Edge Function routes; it reads `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (and optionally `DEMO_PASSWORD`) and can reset passwords of those named accounts. The upload form supplies the required `is_global` and `share_permission` fields. Its end-to-end operation has not been verified in this workspace. Use it only with a dedicated disposable test project. It prints a generated password once; do not publish credentials or output.

## Rollback and operation

Migrations are forward-only for shared hosted environments; write a new corrective migration rather than editing applied files. Back up/understand data impact before changes. Function rollback uses a reviewed prior source deployment; no automatic rollback or incident runbook is implemented here. Supabase backups and retention are provider/project settings, not configured by this repository.
