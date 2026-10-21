# Hosted deployment (operator procedure)

Do not infer deployed behavior from local source. Verify the Supabase project reference from `frontend/.env` and the dashboard before any database operation. On 2026-10-20 the linked project was checked as `twyfmmtzbcjwlkfwwijm`. A dry-run identified four pending migrations; Management API inspection confirmed notification objects were already present, and the verified migration version was recorded. The direct CLI migration list could not connect without the database password. Do not treat older migration/function status as current.

## New/existing Supabase project

1. Create/select the intended Supabase project and confirm its project ref. Securely install Supabase CLI and run `npx supabase login` (token is typed into terminal, never chat).
2. From repository root run `npx supabase link --project-ref <verified-project-ref>`.
3. Inspect `npx supabase migration list --linked` and `npx supabase db push --dry-run`. If old migrations unexpectedly appear pending while tables/functions already exist, stop and compare hosted schema before repairing migration history. Do not re-run the initial schema against an already-built project.
4. Apply only expected pending migrations via `npx supabase db push`. The 2026-10-20 linked dry-run showed `20261019000300`, `20261020000100`, `20261020000200`, and `20261020000300` pending. Notification objects for `20261020000500_user_notifications.sql` were already present and verified on that project; its version was recorded after checking them. Do not run a general push without reviewing the other pending changes. The CLI direct migration-list operation requires the project's database password, which was not configured during this session.
5. Set Edge Function secrets in Supabase Dashboard or `npx supabase secrets set --env-file <protected-env-file>`. Set `ALLOWED_ORIGINS` to exact production frontend origins, comma-separated, with no wildcard. Do not replace an existing list without preserving required domains. Local HTTP localhost/loopback ports are dynamically allowed by the current function source for development only.
6. Deploy all current functions: `npx supabase functions deploy`. Nine source endpoints are configured: admin-audit-query, admin-set-role, document-delete, document-download, document-edit, document-get, document-preview, document-share, document-upload. Verify with `npx supabase functions list --project-ref <ref>`.
7. Auth settings: configure Site URL/redirects for deployed frontend, enable email confirmation per production policy, and keep minimum password length aligned with application validation (12 characters). Apply MFA policy for administrators operationally if required; repository does not enforce MFA.
8. Create the first administrator through a trusted operator path after the Auth user/profile exists. The app cannot create admins. Never grant admin via user metadata. Use a strong unique password through Auth, not SQL.
9. Deploy frontend to Vercel with project root `frontend`, framework preset Vite, build command `npm run build`, and output directory `dist`. Set only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as client-visible variables. Never put service-role/secret keys in Vercel frontend environment. `frontend/vercel.json` provides the SPA rewrite to `/index.html` and the Content-Security-Policy, `nosniff`, and referrer headers; verify those response headers on the deployed domain.
10. Run live smoke checks: recipient lookup, upload, read preview, editor current/history download (only after 0900), revoke, admin role update, admin audit query, Storage direct client denial, and notification delivery. Use test-only users to verify direct/global share alerts, editor version updates, recipient-only reads, realtime popup, unread/read state and delivery after a missed event/poll. Record actual outcome and project ref without exposing keys.

## Vercel post-deployment checks

- Confirm the Vercel project root is `frontend`, the framework preset is Vite, the build command is `npm run build`, and the output directory is `dist`.
- Confirm only `VITE_SUPABASE_URL` and the public `VITE_SUPABASE_ANON_KEY` are present in frontend environment settings; do not copy any service-role/secret value into Vercel.
- Load `/login`, then directly load and refresh `/documents` and `/documents/<test-id>` to verify the SPA rewrite; unauthenticated requests should return to sign-in.
- Inspect deployed response headers for the CSP, including `frame-src 'self' blob:` for PDF preview and the Google Fonts stylesheet/font origins used by `frontend/index.html`, plus `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer` from `frontend/vercel.json`.
- Sign in with isolated test identities and run the live authorization smoke checks in step 10. Do not use production user data for negative tests.

## Demo data cautions

`supabase/seed.sql` is local-only and contains a shared known demo password. Do not run it on hosted projects. `scripts/provision-demo.mjs` creates fictional users/documents through Supabase Admin API and Edge Function routes; it reads `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (and optionally `DEMO_PASSWORD`) and can reset passwords of those named accounts. The upload form supplies the required `is_global` and `share_permission` fields. Its end-to-end operation has not been verified in this workspace. Use it only with a dedicated disposable test project. It prints a generated password once; do not publish credentials or output.

## Rollback and operation

Migrations are forward-only for shared hosted environments; write a new corrective migration rather than editing applied files. Back up/understand data impact before changes. Function rollback uses a reviewed prior source deployment; no automatic rollback or incident runbook is implemented here. Supabase backups and retention are provider/project settings, not configured by this repository.
