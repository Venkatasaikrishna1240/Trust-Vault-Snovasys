# Architecture (implemented design; deployment status is separate)

## Components and flow

- **Browser:** React 18/Vite/TypeScript app in `frontend/`. Supabase JS handles sign-in/session and RLS-protected reads. UI route guards are not security controls.
- **Identity:** Supabase Auth issues a JWT. Every Edge Function has gateway `verify_jwt=true` and the shared `wrap()` calls Auth `getUser()` for the presented bearer token. The trusted actor ID comes only from that result.
- **Data API:** PostgREST exposes `public`/`graphql_public`, not internal `app`. Authenticated reads of profiles/documents/versions/permissions/audit events are filtered by RLS and column grants. `search_documents` and `dashboard_stats` are SECURITY INVOKER.
- **Writes and bytes:** Browser calls one of ten Edge Functions. Handler validates input and calls a service-role-only `public.svc_*` function. SQL reads role from `public.profiles` and evaluates current access via `app.access_level`/`app.authorize_or_deny`. For preview/download, the handler fetches and verifies bytes, then calls a second service function to recheck permission and log success before returning a response. Failed retrieval or integrity checks cannot create a successful delivery event.
- **Employee offboarding:** Admin UI calls the JWT-protected `admin-users` function. The function verifies Auth identity; service-only SQL routines independently require an active admin profile. Deactivation marks the profile inactive and revokes grants to the account transactionally, then applies a Supabase Auth ban. RLS/access helpers and protected service operations check current active status, so stale access tokens do not rely on Auth ban propagation. Permanent removal is staged and idempotent, calls Auth Admin deletion only after database blockers are checked, and retains a no-profile-FK offboarding record plus audit snapshots. Ownership transfer is not implemented; unresolved documents, authored versions, or issued grants block removal.
- **Storage:** Bucket `documents` is private and has a restrictive policy denying `anon`/`authenticated`. Storage keys are server-generated `<owner>/<document>/<random UUID>` paths and never returned to browser clients. No signed URL flow exists.
- **Notifications:** Trusted database triggers create recipient-scoped notification rows when a named grant is added, a document becomes global, or a successful document edit/replacement audit event is written. RLS exposes only the signed-in recipient's rows; a user-bound RPC marks their own notices read. Supabase Realtime sends inserts when `supabase_realtime` is enabled, with a 30-second client polling fallback. Notice clicks navigate through the usual document route and do not bypass authorization.

## Schemas and migration sequence

- `public`: profiles, documents, versions, permission grants, audit tables; client-safe search/dashboard functions and service operations.
- `app`: internal helper functions and audit implementation; not exposed by Supabase API schemas.
- Migrations in lexical order: 0100 core tables/types/triggers; 0200 access helpers; 0300 append-only hash-chain audit; 0400 RLS/privileges; 0500 service operations/read helpers; 0600 private bucket/policy; 0700 any-profile uploads, global-to-authenticated visibility, preview and edit-only current downloads; 0800 upload-time sharing, audited recipient lookup, sender names; 0900 enables active editors as well as owners to download historical versions; 20261020000100 briefly restricted lookup to exact emails; 20261020000200 restores bounded partial display-name/email-username suggestions; 20261020000300 adds resolved audit labels and post-verification preview/download successes; 20261020000500 adds RLS-protected user notifications and event triggers; 20261021000100 adds active-account enforcement and staged employee offboarding.

Never edit an applied migration on a shared database. Create a new timestamped migration and inspect migration history before push. On 2026-10-20, Management API inspection confirmed the notification schema, RLS, grants, RPC, triggers and Realtime publication on the configured project; the verified migration version was recorded in its ledger. The same day's dry-run showed four other migrations pending. See `docs/PROJECT_STATUS.md` and `docs/deployment.md`; do not push unrelated migrations without review.

## Authorization concepts

- Every registered profile may upload and own documents; `admin` is not a document grant.
- Owner may read/preview/download all versions, edit/replace, share/change visibility/revoke, and delete.
- Edit grant may read/preview/download current and historical versions, and edit/replace; cannot share/revoke/delete/change visibility.
- Read grant and global-to-signed-in access permit metadata/current preview only; no attachment downloads or edits.
- Every request checks current state. Revoke blocks subsequent requests after commit; an already-authorized in-flight request may complete.

## Auditing and failure handling

`app.write_audit` inserts into append-only `audit_events`; before-insert trigger assigns sequence, previous hash and event hash while locking `audit_chain_head`. Operation/authorization service calls write the relevant audit decision. The admin query resolves actor, document owner and affected recipient from trusted database rows; it uses the version filename current at the event time when available so later replacements do not rewrite the filename shown for earlier events. Preview/download success is recorded only after private bytes are fetched and verified and access is checked again. If the audit write fails, the response fails closed with no bytes. This records that the server prepared a verified response, not that a browser received or saved it. `lock_timeout=5s` bounds audit serialization waits. The chain is tamper-evident for ordinary app users, not tamper-proof against database owners. See `docs/security-design.md`.

## Deployment boundary

Source code and a successful application deployment are distinct claims. Hosted database/function state must be queried from Supabase CLI/dashboard. Notification database objects and their migration ledger version were verified on the linked project on 2026-10-20; no app deployment or migration DDL was performed in that verification. This historical check does not establish current hosted state. Real authenticated notification delivery, Auth/Storage integration and full browser E2E remain separate validation tasks.
