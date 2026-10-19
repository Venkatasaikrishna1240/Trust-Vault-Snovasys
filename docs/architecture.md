# Architecture
Browser (React) → Supabase Auth (JWT) → (a) Data API/PostgREST reads under RLS, (b) Edge Functions for all writes and file bytes.
Edge Function flow: verify token (`auth.getUser`) → validate input → `svc_*` SQL function (authorise + change + audit in ONE transaction, actor passed explicitly from the verified token, executable by service_role only) → only then private Storage via service role.
Schemas: `public` (tables, `search_documents`, `dashboard_stats`, `svc_*`), `app` (internal helpers, not exposed by the API). Migrations 0100 core → 0200 access helpers → 0300 audit chain → 0400 RLS/privileges → 0500 svc functions → 0600 bucket → 0700 owner-controlled visibility for signed-in users and read-only previews → 0800 upload-time named sharing, audited recipient lookup and sender display names → 0900 edit-grantees may download older versions.
Why svc_* take an actor argument: the Edge Function is the trusted caller and already verified identity; SQL is the single place decisions and audit happen. Direct client calls to them are denied (tested).
Storage keys: `<owner>/<document>/<random>`, server-generated, enforced again in SQL, never sent to clients. Deletion: soft-delete row (tombstone), revoke all grants, purge all version objects.
Roles: admin (audit, user roles; no document access), owner (create docs), viewer (default). Edit/read are per-document grants.
