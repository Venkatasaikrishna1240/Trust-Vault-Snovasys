# TrustVault

[Open the live TrustVault application](https://trust-vault-snovasys-19vk.vercel.app/login)

TrustVault is a React and Supabase document-management application for authenticated users to store, version, preview, and selectively share documents. Document permissions are enforced by PostgreSQL and Supabase Edge Functions; hiding a control in the browser is not an authorization boundary.

> **Status:** This repository contains the deployed application and its security-focused tests, but it is not a security certification. The supplied live login URL and response headers were checked, as was an unauthenticated CORS preflight from that origin. Authenticated hosted workflows and current hosted migration state remain unverified. See [test evidence](evidence/security-test-results.md).

## Features

- Supabase email/password registration and sign-in, with profiles provisioned as `viewer`.
- Document upload for PDF, PNG, and JPEG files, with server-side size/content validation and SHA-256 integrity checks.
- Per-document read or edit grants, global visibility for signed-in users, and owner-controlled revocation.
- Metadata and inline preview for readers; current and historical attachment downloads for owners and editors.
- Metadata changes and file replacement by owners/editors; deletion and sharing controls are owner-only.
- Version history that records replacements and preserves metadata for prior versions.
- Admin user-role management between `owner` and `viewer`, employee deactivation/reactivation, guarded permanent account removal, and a read-only audit activity view.
- Private Supabase Storage and append-only, hash-linked audit events.
- Recipient-scoped in-app notifications for sharing and successful document updates.

The account `owner` role is not the same as document ownership. Admin status alone does not grant access to private documents.

## Technology and architecture

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Supabase JavaScript client |
| Identity | Supabase Auth |
| Database | Supabase PostgreSQL, SQL migrations, Row-Level Security |
| Trusted operations | Deno TypeScript Supabase Edge Functions and service-role-only SQL functions |
| File storage | Private Supabase Storage bucket named `documents` |
| Hosting configuration | Vercel SPA rewrite and response headers in `frontend/vercel.json` |
| Package manager | npm |

The browser uses Supabase Auth and RLS-protected reads. For protected operations, it sends the user's bearer token to an Edge Function. The function verifies that token with Supabase Auth `getUser()`, derives the actor ID from that verified identity, validates the request, and calls a restricted database operation. File bytes are accessed by Edge Functions only after authorization. Preview/download bytes are size- and hash-checked, and current access is rechecked before a successful delivery event is recorded and bytes are returned.

See [architecture](docs/architecture.md) and the deeper [project documentation](PROJECT_DOCUMENTATION.md).

## Authentication and email verification

Registration uses Supabase Auth email/password signup; the database trigger creates a `viewer` profile. The signup form requires a syntactically valid email and a password of at least 12 characters. If Supabase returns no session after signup, the UI tells the user to check email and confirm the account before signing in. The application requires an authenticated session for protected routes and functions.

**There is no organization-domain allowlist.** The registration form does not restrict email domains, and the profile-provisioning trigger does not enforce one either. Email confirmation verifies control of an inbox under the configured Supabase Auth flow; it does not prove that the person is an employee or student of a trusted organization. Local Supabase configuration explicitly disables email confirmations for local development. A read-only public Auth settings check against the owner-confirmed test project reported email auto-confirm disabled; no confirmation email was sent or completed during verification. Configure and verify production Auth confirmation and redirect settings separately.

Session persistence and token refresh are enabled by the Supabase client. Administrators can deactivate/reactivate employee accounts or permanently remove eligible accounts through the trusted offboarding function. Self-service password reset and MFA enforcement are not implemented.

## Roles and document access

Account roles are stored in `public.profiles.role` and are not taken from user metadata or request bodies. New profiles default to `viewer`. An admin may change another non-admin account between `owner` and `viewer`; the app does not expose admin promotion or self-promotion.

| Capability | Admin account role | Document owner | Edit grant | Read grant / global signed-in reader |
|---|---:|---:|---:|---:|
| Upload and own documents | Yes, if profile exists | Yes | Yes, if profile exists | Yes, if profile exists |
| Read permitted metadata and preview current file | Only with document access | Yes | Yes | Yes |
| Download current and historical files | Only with owner/edit access | Yes | Yes | No |
| Edit metadata or replace file | Only with owner/edit access | Yes | Yes | No |
| Grant/revoke access or change visibility | No, unless also document owner | Yes | No | No |
| Delete a document | No, unless also document owner | Yes | No | No |
| Manage account roles / query full admin audit | Yes | No | No | No |

Document-specific permissions are independent of account roles: an admin without a grant cannot read a private document, while a `viewer` may still own their own document. Inactive profiles are excluded from access helpers and protected RLS reads; revocation blocks subsequent requests after it commits.

## Document lifecycle, sharing, and versions

Uploads accept PDF, PNG, and JPEG files up to 10 MiB. The server validates file content and the relationship between content, declared MIME type, and extension; it generates a non-user-controlled Storage key. Metadata includes title, description, category, filename, MIME type, byte size, SHA-256 digest, owner, and current version.

Owners may grant named registered users `read` or `edit` access, revoke grants, or make a document visible to all signed-in profiles. Global visibility is not anonymous/public-link access. Readers may view metadata and request the current inline preview, but cannot use the attachment-download operation. Owners and active editors may download current and historical versions. Editors may change metadata or replace the current file but may not share, revoke, change visibility, or delete.

Each replacement creates a new version and advances `documents.current_version`. Previous versions retain filename, MIME type, size, digest, creator, timestamp, and private Storage key. Users can inspect history; owners and editors can download older versions. **Version restore is not implemented**; restoring content requires a new replacement. Deletion soft-deletes metadata and revokes access before attempting Storage cleanup. The cleanup may be incomplete and is reported; backup retention is provider configuration, not managed by this repository.

The browser never receives a Storage key or reusable signed URL. A preview necessarily delivers file bytes to the browser; read-only permission does not prevent copying, screenshots, printing, or saving those bytes. A request already authorized before a revoke commits may complete.

## Administration and audit

The admin users page lists account status and retained-record counts, lets an admin change another non-admin profile between `owner` and `viewer`, and provides employee deactivation/reactivation plus a separately confirmed permanent removal. Deactivation marks the profile inactive in the database before attempting a Supabase Auth ban, blocks protected database/function access even for an already-issued access token, and revokes active grants to that employee without deleting documents. Reactivation removes the Auth ban before restoring database access; revoked grants are not restored. Permanent removal is a staged Auth deletion, blocked until owned documents, authored versions, and issued permission references are resolved. It never deletes or silently transfers documents; audit history is retained. The trusted server operations authorize the admin, prohibit self-offboarding, and reject admin targets. The admin audit page supports filtered, read-only event queries and optional hash-chain verification. Admin access does not confer document access.

Audit events cover supported operations such as document upload/read/preview/download/edit/replace/delete/purge, permission grant/revoke and recipient search, visibility changes, admin role changes/account offboarding/audit queries, denied operations, and selected storage/integrity failures. Events identify the verified actor where available, document/request IDs, action, outcome, timestamp, and constrained details. Preview/download success is written only after the server retrieves and verifies bytes and rechecks access; this records server preparation, not proof that a browser saved or displayed content. Some parsing and validation errors occur before audit logging.

Audit records are append-only for application roles and linked by SHA-256 hashes. This is tamper-evident against ordinary application-level modification, not tamper-proof against a database owner able to rewrite data and recompute the chain.

## Security controls and limitations

- Verified Supabase Auth identity at Edge Functions; profile role authority in the database.
- RLS and explicit client column grants; browser clients have no direct document, version, permission, or audit writes.
- Service-role-only SQL operations authorize and audit internally.
- Inactive account status is checked by database access helpers/RLS and privileged service functions; Auth banning is an additional control, not the sole stale-token defense.
- Private Storage bucket with restrictive denial for direct `anon`/`authenticated` object access; no signed URLs.
- Uniform missing/inaccessible document responses, server-generated object keys, upload validation, and SHA-256/size checks.
- Parameterized database calls and controlled SQL functions; current access is re-evaluated rather than cached.
- CORS permits explicit configured production origins; local HTTP loopback origins are accepted for development. CORS is not authorization.

Known limits include no organization-domain restriction, no app-enforced MFA, no malware scanner/content disarm, no independent audit-head storage, recipient suggestions that expose matching registered emails to signed-in users, and no automated browser E2E suite. The real hosted RLS and Storage object policies and the authenticated role matrix have not been fully exercised. See [THREATS.md](THREATS.md), [SECURITY_AUDIT.md](SECURITY_AUDIT.md), and [security design](docs/security-design.md).

## Requirements

For the full local stack, use Windows 10/11, Node.js 20 or newer, npm, Docker Desktop, and the repository's Supabase CLI dependency (`npx supabase`). Deno is needed for Edge Function type-checking. The Docker-free backend test harness additionally requires Bash, PostgreSQL 16 server tools, PostgREST, Deno, and helper utilities.

## Local setup

Follow [the local development guide](docs/local-development.md) for the complete PowerShell workflow:

1. Install root and frontend dependencies.
2. Start a disposable local Supabase stack with `npx supabase start`.
3. Create `frontend/.env` with the local `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values printed by the CLI. This checkout has no `frontend/.env.example`.
4. Serve the Edge Functions and start Vite in separate terminals.

Never put a service-role/secret key in frontend configuration or commit local `.env` files. Local seeded accounts and their shared password are for the local stack only; never use them against a hosted project.

## Database and migrations

Migrations live in `supabase/migrations/` and are applied in lexical order by the Supabase CLI. The employee offboarding change is migration `20261021000100_employee_offboarding.sql`; deploy it before the `admin-users` Edge Function or updated frontend. For a fresh local project, `npx supabase start` applies migrations and the local-only seed. To reset only that local database, use `npx supabase db reset`; it is destructive and must not be used against production.

For a hosted project, first verify the project reference and inspect `npx supabase migration list --linked` and `npx supabase db push --dry-run`. Review every pending migration and reconcile pre-existing schema before applying anything. Never edit an already-applied migration; use a new timestamped migration. See [deployment instructions](docs/deployment.md) for Auth, function secrets, first-admin provisioning, Storage, and smoke checks.

The latest observed project checks are historical and do not establish the target deployment's current migration state. The offboarding migration and function have not been applied or deployed to the hosted project as part of this change.

## Development and tests

```powershell
npm install
npm --prefix frontend install
npm run dev
```

Main checks:

```powershell
npm --prefix frontend run build
npm --prefix frontend run lint
npm --prefix frontend test -- --pool=threads --maxWorkers=1
npm run typecheck:functions
npm run test:backend:local
```

`npm run test:backend:local` rebuilds a disposable test database and requires the backend harness prerequisites. `npm run test:db` and `npm run test:api` require the test services to be running. `npm run test:mutation` intentionally tests a broken authorization condition and is only for its disposable harness. `npm run test:functions` is a placeholder; there are no separate Deno unit tests.

At the 2026-10-21 review, the frontend build, frontend TypeScript check, configured Edge Function type-check, and constrained frontend suite passed (9 files, 30 passed, 1 existing todo). DB/API suites were blocked because local PostgreSQL at `127.0.0.1:54329` refused connections. A later read-only check against the owner-confirmed dedicated test project verified selected anonymous denials, but did not test authenticated authorization. Exact evidence and limitations are in [the test results](evidence/security-test-results.md) and [testing guide](docs/testing.md).

## Vercel deployment

Configure the Vercel project root as `frontend`, framework as Vite, build command as `npm run build`, and output directory as `dist`. Configure only the public frontend variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; do not set service-role credentials in the frontend environment. `frontend/vercel.json` provides the SPA rewrite and security headers, including the explicit Google Fonts origins referenced by `frontend/index.html`.

Configure Supabase Auth Site URL and production redirect URLs for the deployed frontend, explicitly decide and verify email confirmation policy, set exact production origins in the Edge Function `ALLOWED_ORIGINS`, deploy reviewed migrations and functions, and provision the first admin through a trusted operator process. Then run the role-based and post-deployment checks from [deployment guide](docs/deployment.md). Do not infer successful production behavior from source or local test results.

The live login URL supplied for this deployment is [trust-vault-snovasys-19vk.vercel.app/login](https://trust-vault-snovasys-19vk.vercel.app/login). The repository does not establish the Vercel dashboard's connected Git repository or production branch; verify those in Vercel before relying on automatic deployments.

## Documentation

- [User manual](USER_MANUAL.md)
- [Complete project documentation](PROJECT_DOCUMENTATION.md)
- [API reference](API.md)
- [Permission model](docs/permission-model.md)
- [Architecture](docs/architecture.md)
- [Threat model](THREATS.md)
- [Security audit](SECURITY_AUDIT.md)
- [Local development](docs/local-development.md)
- [Deployment](docs/deployment.md)
- [Testing guide](docs/testing.md)
- [Security testing guide](docs/security-testing.md)
- [Requirements and evidence matrix](docs/requirements-evidence.md)
- [Project status](docs/PROJECT_STATUS.md)
- [AI prompt history](PROMPTS.md)

## Project information

TrustVault is an application project prepared for the Snovasys security challenge. The detailed implementation description and outstanding limitations are in [PROJECT_WRITEUP.md](PROJECT_WRITEUP.md).
