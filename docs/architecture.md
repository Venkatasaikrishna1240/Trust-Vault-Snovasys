# Architecture (implemented design; deployment status is separate)

## Components and flow

- **Browser:** React 18/Vite/TypeScript app in `frontend/`. Supabase JS handles sign-in/session and RLS-protected reads. UI route guards are not security controls.
- **Identity:** Supabase Auth issues a JWT. Every Edge Function has gateway `verify_jwt=true` and the shared `wrap()` calls Auth `getUser()` for the presented bearer token. The trusted actor ID comes only from that result.
- **Data API:** PostgREST exposes `public`/`graphql_public`, not internal `app`. Authenticated reads of profiles/documents/versions/permissions/audit events are filtered by RLS and column grants. `search_documents` and `dashboard_stats` are SECURITY INVOKER.
- **Writes and bytes:** Browser calls one of nine Edge Functions. Handler validates input and calls a service-role-only `public.svc_*` function. SQL reads role from `public.profiles` and evaluates current access via `app.access_level`/`app.authorize_or_deny`. For preview/download, the handler fetches and verifies bytes, then calls a second service function to recheck permission and log success before returning a response. Failed retrieval or integrity checks cannot create a successful delivery event.
- **Storage:** Bucket `documents` is private and has a restrictive policy denying `anon`/`authenticated`. Storage keys are server-generated `<owner>/<document>/<random UUID>` paths and never returned to browser clients. No signed URL flow exists.

## Schemas and migration sequence

- `public`: profiles, documents, versions, permission grants, audit tables; client-safe search/dashboard functions and service operations.
- `app`: internal helper functions and audit implementation; not exposed by Supabase API schemas.
- Migrations in lexical order: 0100 core tables/types/triggers; 0200 access helpers; 0300 append-only hash-chain audit; 0400 RLS/privileges; 0500 service operations/read helpers; 0600 private bucket/policy; 0700 any-profile uploads, global-to-authenticated visibility, preview and edit-only current downloads; 0800 upload-time sharing, audited recipient lookup, sender names; 0900 enables active editors as well as owners to download historical versions; 20261020000100 briefly restricted lookup to exact emails; 20261020000200 restores bounded partial display-name/email-username suggestions; 20261020000300 adds resolved audit labels and post-verification preview/download successes.

Never edit an applied migration on a shared database. Create a new timestamped migration and inspect migration history before push. At the most recent CLI inspection (2026-10-19), hosted migration history had 0100–0800 applied, with 0900 pending; see `docs/PROJECT_STATUS.md` for timestamped state. Applying 0900 is still required to enable editor historical downloads on that hosted database.

## Authorization concepts

- Every registered profile may upload and own documents; `admin` is not a document grant.
- Owner may read/preview/download all versions, edit/replace, share/change visibility/revoke, and delete.
- Edit grant may read/preview/download current and historical versions, and edit/replace; cannot share/revoke/delete/change visibility.
- Read grant and global-to-signed-in access permit metadata/current preview only; no attachment downloads or edits.
- Every request checks current state. Revoke blocks subsequent requests after commit; an already-authorized in-flight request may complete.

## Auditing and failure handling

`app.write_audit` inserts into append-only `audit_events`; before-insert trigger assigns sequence, previous hash and event hash while locking `audit_chain_head`. Operation/authorization service calls write the relevant audit decision. The admin query resolves actor, document owner and affected recipient from trusted database rows; it uses the version filename current at the event time when available so later replacements do not rewrite the filename shown for earlier events. Preview/download success is recorded only after private bytes are fetched and verified and access is checked again. If the audit write fails, the response fails closed with no bytes. This records that the server prepared a verified response, not that a browser received or saved it. `lock_timeout=5s` bounds audit serialization waits. The chain is tamper-evident for ordinary app users, not tamper-proof against database owners. See `docs/security-design.md`.

## Deployment boundary

Source code and a successful CLI deployment are distinct claims. Hosted database/function state must be queried from Supabase CLI/dashboard. The observed linked project ref and migrations are recorded in `docs/PROJECT_STATUS.md`; migration 0900 was pending in the latest inspection described there. Real Auth/Storage integration and full browser E2E remain separate validation tasks.
