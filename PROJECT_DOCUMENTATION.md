# TrustVault — Project Documentation

**Documentation basis:** repository source, migrations, tests, configuration, and the recorded checks in [security test evidence](evidence/security-test-results.md), reviewed 2026-10-21. Source describes intended local behavior; it does not by itself prove current hosted configuration or deployment.

## A. Project overview

### Purpose and users

TrustVault is a document management and sharing application. It is intended for authenticated individuals or teams who need to store documents, grant scoped access to other registered accounts, retain replacement history, and review auditable activity.

The application supports three account roles (`admin`, `owner`, `viewer`) and separate document-level roles (`owner`, `edit`, `read`). These are not interchangeable: a user role does not grant access to another person's private documents.

### Main capabilities and objectives

- Authenticate users with Supabase Auth email/password.
- Store PDF, PNG, and JPEG documents in a private Storage bucket.
- Enforce owner/edit/read access for each document, including global visibility to signed-in users.
- Preserve previous file versions and integrity metadata.
- Log supported operations in a tamper-evident audit chain.
- Limit direct browser database access through RLS, explicit column grants, and service-only write operations.

The main security objective is to make the server/database—not the browser UI—the authority for identity, access decisions, and file-byte delivery.

### Technology stack

- React 18, TypeScript, Vite, Tailwind CSS, React Router, React Hook Form, Zod.
- Supabase Auth, PostgreSQL, PostgREST, RLS, private Supabase Storage, Realtime.
- Deno TypeScript Edge Functions; Supabase CLI for local stack and migrations.
- npm workspaces/package manifests at repository root and `frontend/`.
- Vercel static frontend deployment configuration in `frontend/vercel.json`.

### Architecture and data flow

1. Supabase Auth issues a user session. The browser persists and refreshes it through Supabase JS.
2. The browser uses the signed-in JWT for RLS-protected reads and sends a bearer token for protected Edge Function operations.
3. Gateway `verify_jwt=true` and the shared Edge Function wrapper verify the token. The wrapper calls Auth `getUser()` and takes the actor ID from its response, not request-body data.
4. Edge Functions validate inputs and call `public.svc_*` SQL functions using server-held service credentials. Those operations read the trusted profile role and evaluate current document access.
5. Edge Functions access the private `documents` bucket only after authorization. They validate upload bytes and check stored byte count/SHA-256 for preview and download.
6. For preview/download, the server rechecks permission and records a delivery-success audit event only after retrieving and verifying bytes and before returning the response.

The browser never receives `storage_key` values or reusable signed URLs. The `app` schema is not exposed through the Supabase Data API.

### Frontend routes

| Route | Access |
|---|---|
| `/login` | Public sign-in/sign-up page. |
| `/` | Authenticated dashboard. |
| `/documents` | Authenticated document listing/search. |
| `/documents/new` | Authenticated upload. |
| `/documents/:id` | Authenticated document details, overview, owner-only sharing tab, and accessible version history. |
| `/admin/users` | Admin-only account-role management (also protected by server-side authorization). |
| `/admin/audit` | Admin-only audit query and verification UI. |

## B. Registration, login, and account verification

### Implemented registration/sign-in sequence

1. The registration form accepts a display name, syntactically valid email, and password of at least 12 characters. These are frontend validation rules, not an organization-domain policy.
2. The frontend calls Supabase Auth `signUp()` with `display_name` user metadata.
3. A database trigger provisions a `public.profiles` row for a new Auth user and assigns the `viewer` role. Display name is derived from metadata with an email-name fallback. User metadata never determines authorization role.
4. If Supabase returns no active session after signup, the UI displays a prompt to check email and confirm the account, then returns to sign-in mode. Email delivery and confirmation-link handling are provided by Supabase Auth configuration; the app does not implement its own mailer.
5. The user signs in through `signInWithPassword()`. The frontend protected-route guard requires a session. Edge Functions independently require a valid JWT and verify it with Auth `getUser()`.
6. The frontend loads the user's profile for display and UX guards. The admin UI guard is not a security boundary; database/service operations enforce admin authority server-side.
7. Supabase JS is configured with `persistSession: true` and `autoRefreshToken: true`. Auth state changes update the app session; profile state is cleared on identity changes. Sign-out calls Supabase Auth, and an API 401 triggers sign-out.

### Email confirmation, domain restrictions, and account status

- **Organization-domain allowlist: not implemented.** `signUpSchema` validates general email syntax only. The Edge Function/auth/database profile provisioning path contains no configured approved organization domain. No domain name should be inferred or documented as allowed.
- **Email confirmation:** the frontend expects confirmation when Supabase signup returns no session. Local `supabase/config.toml` explicitly sets `enable_confirmations = false` for local development. A read-only public Auth settings response from the owner-confirmed dedicated test project reported `mailer_autoconfirm=false`; no signup or confirmation email was sent during this review. Production Auth settings must be checked independently.
- **What confirmation proves:** when enabled, Supabase email confirmation establishes control of the mailbox for that address under the configured Auth flow. It does not prove employment, student status, organizational affiliation, identity, or trustworthiness.
- **Account status:** there is no application-owned ban/disabled status field or admin ban action. Auth rejects invalid/deleted/disabled sessions when `getUser()` cannot validate them. No custom “email verified and not banned” profile guard exists in this repository; unconfirmed-account behavior depends on Supabase Auth settings.
- **Password recovery/MFA:** no self-service reset route or application-enforced MFA policy is implemented.

## C. Roles and permissions

### Account roles

| Role | Assigned at signup | Application capabilities |
|---|---|---|
| `viewer` | Yes; database default | Can upload/own documents if the profile exists; may receive document-specific grants. Cannot use admin tools. |
| `owner` | No; admin or trusted operator | Same document ownership/grant model as other profiles. This account role is not ownership of all documents. |
| `admin` | No; trusted out-of-band bootstrap | Can list/manage account roles and query the admin audit view. Admin status alone grants no document content access. |

An admin can change another non-admin profile between `owner` and `viewer`. The endpoint rejects self-change, editing an existing admin, and setting a role to `admin`. The UI prevents self-change and locks admin rows, but trusted SQL/service authorization is the control. First-admin creation is an out-of-band operator task.

### Document-specific access matrix

| Operation | Document owner | Active edit grant | Active read grant | Global signed-in reader | Admin without document grant |
|---|---:|---:|---:|---:|---:|
| List/access metadata | Yes | Yes | Yes | Yes | No |
| Preview current version inline | Yes | Yes | Yes | Yes | No |
| Download current version | Yes | Yes | No | No | No |
| Download historical version | Yes | Yes | No | No | No |
| Edit metadata / replace file | Yes | Yes | No | No | No |
| Grant/revoke named access | Yes | No | No | No | No |
| Change global visibility | Yes | No | No | No | No |
| Delete document | Yes | No | No | No | No |

The owner is a document relationship, not an account-role label. Global access is available only to authenticated profiles and behaves like read access. A global document remains shareable only by its owner. Revoking a named grant does not remove access while that document is globally visible.

### Database and server enforcement

RLS calls caller-bound access helpers that use `auth.uid()`. Edge Functions verify the session and call service functions with the verified actor ID. Roles come from `public.profiles.role`, not JWT claims or signup metadata. Writes to documents, versions, grants, and audit events are not available through browser table policies. Current access is re-evaluated for each request; there is no cached positive authorization result.

## D. Admin dashboard and user management

The authenticated app exposes `/admin/users` and `/admin/audit` only through a client-side admin guard. The guard is for user experience; server-side authorization is mandatory.

- **User listing:** the users page reads RLS-protected `profiles` rows. Admins may see all profiles. The displayed fields include email, display name, role, and creation time.
- **Role change:** `admin-set-role` calls `svc_admin_set_role`; an admin may set another non-admin account to `owner` or `viewer`. It cannot promote to admin, alter its own role, or change another admin. The role-change operation audits success and selected denials.
- **Audit review:** `admin-audit-query` allows an admin to query/filter activity and optionally request hash-chain verification. It resolves actor, document, owner, affected-user and permission labels where available. It does not return document bytes or storage keys.
- **Document investigation:** an admin can inspect audit metadata but cannot open a private document solely by being an admin. The admin must separately have document access.
- **Ban/delete:** no in-app account ban, account deletion, or Auth-user removal feature exists. Trusted Supabase operators retain platform-level powers outside the application.
- **Ordinary-user restrictions:** role management and full audit querying are authorized in database service functions using the profile role. Client route hiding alone is not trusted.

## E. Document lifecycle and sharing

### Upload and storage

The upload page accepts a file plus title, optional description, category, optional recipient emails, read/edit permission, and optional global visibility. Edge Function and SQL checks enforce the authenticated profile, metadata constraints, content type/signature/terminator checks, extension/MIME consistency, request/body limits, and configured Storage restrictions. Allowed media types are PDF, PNG, JPEG; Storage is capped at 10 MiB. The server generates a random object key under an owner/document path and saves the file in the private `documents` bucket. Metadata and version 1 are inserted with a SHA-256 digest; optional grants/global visibility are handled by a trusted database operation.

### Listing and search

The application lists documents through the authenticated search RPC with text, category, owner, date, and scope filters. Search output is limited by RLS/current access and does not return Storage keys. Dashboard counts are likewise based on accessible documents. The frontend has no direct public file-list endpoint.

### Sharing and permission changes

The owner may search registered recipients and grant `read` or `edit`; recipient suggestions return at most 20 matches and can disclose matching account email addresses to an authenticated searcher. The lookup requires a minimum query length and is rate-limited/audited, but those controls do not eliminate account-enumeration risk. Only owners can grant, revoke, or change global visibility. A permission change preserves the revoked grant row as history and creates/replaces the active relationship as required by the database logic.

### Preview, download, and edit distinction

- **Preview:** `document-preview` returns current file bytes inline after current read authorization, retrieval, integrity check, and audit. Read grants are preview-capable, but bytes delivered to a browser cannot be made uncopiable.
- **Download:** `document-download` returns bytes as an attachment. Owners and active editors can download current and historical versions; read-only and global readers cannot.
- **Edit:** `document-edit` changes metadata or replaces content for an owner or active editor. A file replacement creates a new version. Edit permission does not confer sharing or deletion rights.

### Revocation and deletion

Each operation checks current database grants. After revocation commits, subsequent operations are denied. An operation authorized before the revoke commits may finish, and already delivered copies cannot be withdrawn. Deletion is owner-only: metadata is soft-deleted and access is revoked before the function attempts to purge current and historical Storage objects. The API reports whether purge completed; incomplete cleanup requires operator follow-up.

Missing and inaccessible document responses are intentionally uniform to reduce ID probing. IDs are UUIDs but are not treated as secrets; authorization is still required.

## F. Document version control

- A new document starts at version 1, with the current Storage key and integrity/file metadata recorded in `documents` and `document_versions`.
- Each accepted replacement increments `documents.current_version`, stores the new current content, and preserves the previous version metadata/object for history.
- Version rows include document ID, version number, filename, MIME type, byte size, SHA-256 digest, creator, and creation timestamp. A uniqueness constraint prevents duplicate version numbers for a document.
- `current_version` identifies the currently active file; the details response contains version metadata ordered for history display.
- Users who can read a document may see version metadata. Owners and active editors can download previous versions; read-only and global readers cannot download attachments.
- **Restore/rollback action: not implemented.** A desired old version can be downloaded by an authorized owner/editor and uploaded as a new replacement, creating a new current version.
- Document deletion soft-deletes the document, revokes access, and attempts to remove object bytes. The audit trail has no foreign keys to documents and is designed to outlive document rows. Exact long-term retention also depends on provider backups and operations.

## G. Audit logging

### Event coverage

Source action names include `auth.failure`, `document.upload`, `document.read`, `document.preview`, `document.download`, `document.edit`, `document.replace`, `document.delete`, `document.purge`, `storage.orphan`, `permission.grant`, `permission.revoke`, `permission.recipient_search`, `document.visibility_change`, `admin.role_change`, `admin.audit_query`, `admin.audit_verify`, and `request.rate_limited`. Operations may record `success`, `denied`, or `error` outcomes.

Audit is not a complete record of every HTTP request: parsing and validation may fail before an event is written, and not every failure path can be represented. In current source, preview/download storage or integrity errors are recorded; successful deliveries are recorded after byte verification and a final permission recheck. Older records may represent authorization only, not successful byte delivery.

### Actor, time, access, and integrity

The actor ID comes from the verified Auth user passed into the service operation. Events have server timestamps, action/outcome, request ID, optional document ID, and constrained JSON details. `admin-audit-query` is role-authorized and read-only. RLS also permits users to see their own actor events and owners to see events for their documents, subject to selected columns and policies.

The database assigns sequence number and SHA-256 previous/event hashes. Application roles cannot insert, update, delete, or truncate audit rows directly. Audit details reject sensitive field names and are size-limited. The chain is tamper-evident for ordinary application users; a database owner can bypass controls and recompute the chain. An independent chain-head store is not implemented. Audit row locking serializes writes and has a 5-second timeout.

## H. Security architecture and threat model

The STRIDE analysis and issue dispositions are maintained in [THREATS.md](THREATS.md) and [SECURITY_AUDIT.md](SECURITY_AUDIT.md).

| Area | Implemented controls | Residual / verification limit |
|---|---|---|
| Authentication | Supabase Auth sessions; Edge Function gateway JWT verification plus `getUser()` verification. | Hosted email confirmation, redirect settings, valid-user sessions, and account-switch behavior require live verification. No MFA enforcement. |
| Authorization | Profile-backed account roles, per-document access helper, per-operation checks, owner-only share/delete, edit-only updates, current-state rechecks. | Local DB/API suite did not run in this review; no authenticated role matrix was exercised against hosted backend. |
| RLS/database | Broad client grants revoked, RLS on application tables, explicit client read columns, no client document/version/grant/audit writes. Service functions are separately restricted. | Local source and policy shims are not proof of current hosted policy state. |
| SQL injection | Typed/validated request fields, parameterized Supabase RPC calls, controlled SQL functions, escaped search wildcards. | Do not treat static review or unexecuted malicious-input tests as a runtime guarantee. |
| IDOR/BOLA | Actor identity is token-derived; uniform not-found handling; access is checked against document ID and current grant/owner/global state. | Authenticated cross-user tests remain needed; UUID secrecy is not relied on. |
| File upload | Server-side length/content checks, allowed-type list, sanitized filename, random Storage key, size limits and database constraints. | No antivirus, content disarm, or robust polyglot detection. |
| Storage | Private bucket and restrictive policy denying direct client access; Edge Function service access after authorization. No signed URLs. | The SQL shim does not emulate the real Storage API; authenticated object-level test remains outstanding. |
| Metadata confidentiality | RLS, column grants, owner-only permission details, bounded recipient lookup, uniform missing/inaccessible response. | Recipient suggestions reveal matching emails to signed-in users; rate limiting cannot eliminate enumeration. |
| Privilege escalation | Role read from database, client cannot update role/email/id, admin service restrictions. | Admin bootstrap and project credentials are operational responsibilities; no role tests executed against hosted users. |
| Revocation | Current permission on each request; writes lock and re-check; no reusable download URL. | In-flight requests and already delivered copies cannot be recalled. |
| Audit integrity | Trusted audit write function, append-only triggers/privileges, sequence/hash chain, bounded details. | Same-database owner can rewrite chain; malformed requests may not be audited. |
| Bans | None implemented. | Add only if product requirements call for application-level suspension and re-registration controls. |
| Abuse controls | Denied-request throttling and recipient lookup limits/rate limiting. | No general IP/global rate-limiting service or malware scanning is established. |

## I. Database and Storage design

### Core tables and relationships

| Object | Purpose and key relationships |
|---|---|
| `public.profiles` | Auth-linked profile (`id` references `auth.users`), email, display name, role, timestamps. New rows default to `viewer`; profile deletion follows Auth user deletion, subject to other relationships. |
| `public.documents` | Owner, title/description/category, filename/type/size/digest, current version, generated Storage key, visibility, timestamps, soft-delete timestamp. Owner references a profile. |
| `public.document_versions` | Per-document version metadata and private Storage key; unique `(document_id, version)`; records creator and timestamp. |
| `public.document_permissions` | Named `read`/`edit` grant history, grantor/time and revoker/time. Only one active grant per document/user; revoked rows are retained. |
| `public.audit_events` | Append-only action/outcome/actor/document/request/details and hash-chain fields. No foreign keys so events can outlive user/document rows. |
| `public.audit_chain_head` | Single-row sequence/hash head used by audit triggers; not client-readable. |
| `public.user_notifications` | Recipient-scoped notification snapshots for sharing and document updates; recipient references profile and document. RLS exposes only the recipient's rows. |

Types include `public.user_role` (`admin`, `owner`, `viewer`), `public.doc_permission` (`read`, `edit`), and `public.audit_outcome` (`success`, `denied`, `error`). Internal access/audit helpers live in schema `app`, which is not exposed through the Data API.

### Important functions and policies

- Access: `app.actor_role`, `app.access_level`, `app.my_access_level`, `app.is_admin`, `app.is_document_owner`, `app.authorize_or_deny`.
- Service operations: `public.svc_*` routines for upload, metadata/detail, replace, delete, share, role management, audit, search, preview/download authorization, and delivery recording. They are `SECURITY DEFINER` with empty search paths and restricted execute privileges.
- Browser reads: `public.search_documents`, `public.dashboard_stats`, limited profile/document/version/grant/audit/notification reads under RLS.
- Notifications: trigger functions create recipient rows; `public.mark_notifications_read` is bound to `auth.uid()`.
- Storage: private bucket `documents`, 10 MiB file cap, PDF/PNG/JPEG allowlist, restrictive client-deny policy on `storage.objects`.

### Migrations and safe setup

Current local migration files, in order:

1. `20261018000100_core_schema.sql` — core types/tables/profile triggers.
2. `20261018000200_access_helpers.sql` — role and document access functions.
3. `20261018000300_audit_trail.sql` — append-only hash-linked audit system and throttling helpers.
4. `20261018000400_rls_and_privileges.sql` — RLS and explicit privileges.
5. `20261018000500_service_functions.sql` — service operations and read helpers.
6. `20261018000600_storage_bucket.sql` — private bucket and restrictive policy.
7. `20261019000100_authenticated_public_documents.sql` — upload for any profile, signed-in global visibility, preview/current download behavior.
8. `20261019000200_upload_recipients_and_sender_name.sql` — upload-time grants and recipient lookup.
9. `20261019000300_editors_can_download_history.sql` — editor historical downloads.
10. `20261020000100_exact_email_recipient_lookup.sql` — recipient lookup transition.
11. `20261020000200_recipient_name_and_username_search.sql` — bounded display-name/email-username suggestions.
12. `20261020000300_audit_activity_details.sql` — resolved audit activity and post-verification delivery recording.
13. `20261020000500_user_notifications.sql` — notification table, triggers, policy, RPC, and Realtime publication.

For local development, install dependencies and use `npx supabase start`; it applies migrations and the local-only seed. `npx supabase db reset` destructively recreates the local database and must not be used on hosted data. For a hosted project, verify the project reference, inspect migration history and `npx supabase db push --dry-run`, compare any pre-existing schema, and apply only reviewed expected migrations. Never edit a migration already applied to a shared database; create a new timestamped migration. The current deployment ledger must be checked before publication; source migration files do not prove deployment state.

## J. Testing and verification

### Commands

| Command | Scope |
|---|---|
| `npm --prefix frontend run build` | TypeScript check and Vite production build. |
| `npm --prefix frontend run lint` | Frontend TypeScript check (`tsc --noEmit`), not a style linter. |
| `npm --prefix frontend test -- --pool=threads --maxWorkers=1` | Frontend Vitest suite. |
| `npm run typecheck:functions` | Deno type-check of Edge Function entrypoints/shared modules. |
| `npm run test:db` | DB tests; requires harness PostgreSQL. |
| `npm run test:api` | HTTP/API tests; requires backend harness and database. |
| `npm run test:backend:local` | Rebuilds disposable local backend test database and runs DB/API suites; requires Bash, PostgreSQL tooling, PostgREST, Deno, and helper commands. |
| `npm run test:mutation` | Intentionally tests a mutated authorization helper in disposable harness; never production. |
| `npm run test:functions` | Placeholder only; no standalone Deno unit suite is implemented. |

Test coverage includes RLS and direct-write denial, role/JWT spoofing, cross-user document IDs, owner/editor/reader permissions, grant/revocation, upload validation, audit integrity, direct Storage policy behavior through a test shim, notifications, and frontend auth/permission state. Harness coverage is not equivalent to actual hosted Auth or Storage.

### Observed results and untested cases

On 2026-10-21, the recorded frontend production build, frontend type-check, Edge Function type-check, and constrained full frontend suite passed. The latest suite recorded 9 files, 30 passed, and 1 existing todo; a prior run timed out once. Dependency audits reported zero known vulnerabilities at that time. The Vite build emitted a bundle-size warning.

The DB suite attempted 166 tests and the API suite 26 tests, but both were blocked before test bodies because PostgreSQL at `127.0.0.1:54329` refused connections. The latest follow-up against the owner-confirmed dedicated test project used only the public key and no user token: selected anonymous profile/document reads, document/admin functions, and malformed-token requests were denied; the private bucket metadata request was denied/not found; Auth settings and one local-origin CORS preflight responded. No valid-user identity, authenticated RLS, document object, upload, or role workflow was tested. Exact commands and responses are documented in [evidence/security-test-results.md](evidence/security-test-results.md).

Manual testing should use distinct disposable Admin, Owner A, Owner B, Editor, and Viewer accounts and harmless files. Cover authentication/session lifecycle, upload validation, all permitted and denied operations, share/revoke with subsequent requests, direct Data API/Storage denial, admin role/audit boundaries, audit outcomes, page refresh/history, and responsive layouts. Do not use production accounts or data.

## K. Deployment and configuration

### Vercel

- Root directory: `frontend`.
- Framework preset: Vite.
- Build command: `npm run build`.
- Output directory: `dist`.
- SPA rewrite and CSP/security headers: `frontend/vercel.json`.
- Public frontend environment variable names: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Never use service-role or secret keys in frontend configuration.

Actual Vercel response headers and rendered PDF preview must be checked after deployment; local JSON/config validation does not prove deployed behavior.

### Supabase

- Configure Site URL and allowed redirect URLs for the actual deployment.
- Explicitly choose the email-confirmation policy; production confirmation should not be inferred from local config.
- Configure Edge Function `ALLOWED_ORIGINS` as exact comma-separated production origins with no wildcard. `MAX_UPLOAD_BYTES` must agree with Storage; Storage currently limits files to 10 MiB.
- Supabase injects URL and public key into functions. Store service-role/secret values only in protected Edge Function environment.
- Deploy reviewed migrations and all nine functions only after confirming project ref and migration state. Create the first admin via a trusted operator path after the Auth profile exists; the app cannot create admins.
- The repository does not enforce organization email domains, MFA, account bans, or account deletion.

### Local environment and troubleshooting

See [local development](docs/local-development.md) for a three-terminal PowerShell setup. This checkout intentionally has no `frontend/.env.example`; create ignored `frontend/.env` with local Supabase CLI values. Copy `supabase/functions/.env.example` for local CORS/upload settings. Do not expose privileged keys.

For browser function/CORS errors, verify the frontend URL/key correspond to the local stack, ensure Edge Functions are serving, and confirm the frontend origin is allowed. For hosted CORS, add the exact production origin to `ALLOWED_ORIGINS`; wildcard CORS is not supported. For a migration mismatch, stop and compare hosted schema/ledger before applying anything.

### Post-deployment smoke tests

1. Verify Vercel root/build/output settings, direct route refresh, and deployed security headers.
2. Verify Supabase Auth confirmation, redirect URLs, login/logout/session refresh, and account switching with test-only accounts.
3. Exercise owner/read/editor/admin operations with positive and negative authorization tests.
4. Upload a harmless valid test file; verify invalid/oversized uploads are rejected.
5. Verify preview/download boundaries, current and historical versions, share/revoke, and requests immediately after revocation.
6. Verify direct client Data API and Storage access is denied and audit outcomes are correct.
7. Verify notifications and recipient-only RLS with signed-in test accounts.
8. Inspect application errors/logging for secrets or private document data; remove test data only through the approved test-project cleanup process.

Do not deploy, push, or apply production migrations without explicit owner approval.

## Related documentation

- [README](README.md) — public project landing page.
- [API reference](API.md) — Edge Function and Data API operations.
- [Permission model](docs/permission-model.md) — concise role/grant matrix.
- [Security design](docs/security-design.md) — controls and limitations.
- [Threat model](THREATS.md) and [security audit](SECURITY_AUDIT.md).
- [Testing](docs/testing.md), [security testing](docs/security-testing.md), and [evidence](evidence/README.md).
- [Deployment](docs/deployment.md) and [local development](docs/local-development.md).
- [Project status](docs/PROJECT_STATUS.md), [requirements evidence](docs/requirements-evidence.md), and [challenge write-up](PROJECT_WRITEUP.md).
