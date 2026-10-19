# API
Edge Functions: `${SUPABASE_URL}/functions/v1/<name>`, headers `Authorization: Bearer <user access token>`, `apikey: <anon key>`.
Success `{data, request_id}`; error `{error:{code,message}, request_id}`; `X-Request-Id` header. Request ids are server-generated.
Codes: 400 `invalid_request`, 401 `unauthenticated`, 403 `forbidden`, 404 `not_found` (missing **or** no access — identical), 404 `grantee_not_found`, 405, 413 `payload_too_large`, 415 `unsupported_media_type`, 429 `rate_limited` (30 denied/min/user), 500 `internal`, 503 `unavailable` (e.g. audit write/lock failure — nothing is returned).
| Function | Method | Auth / permission | Request | Success | Audit |
|---|---|---|---|---|---|
| document-upload | POST multipart | any registered profile | `file`, `title`(1–200), `description`(≤2000), `category`, `is_global:boolean`, `share_permission:'read'|'edit'`, repeated `share_email` (up to 20) | 201 `{document}`; document and selected grants are created atomically | `document.upload`, `permission.grant`, optional `document.visibility_change` |
| document-download | GET `?id=&version=` | owner / edit grant (current and historical versions) | uuid | file bytes (attachment, nosniff, no-store, sha256 verified) | `document.download` success/denied/error |
| document-preview | GET `?id=` | owner / read / edit grant | uuid | current file bytes inline (nosniff, no-store, sha256 verified) | `document.preview` success/error |
| document-get | GET `?id=` | any access | uuid | `{document, my_access, permissions (owner only), versions}` | `document.read` |
| document-edit | POST json / multipart (`?id=`) | owner or edit grant | `{document_id,title?,description?,category?}` or `file` | `{document}` (new version on replace) | `document.edit` / `document.replace` |
| document-delete | POST json | owner only | `{document_id}` | `{deleted, purge}` (bytes purged) | `document.delete`, `document.purge` |
| document-share | POST json | verified user for recipient search; owner for document actions | `{action:'search_recipients',query}` / `{action:'grant',document_id,grantee_email,permission:'read'|'edit'}` / `{action:'revoke',document_id,grantee_id}` / `{action:'set_visibility',document_id,is_global:boolean}` | `{recipients}` / `{permission,grantee,change}` / `{revoked}` / `{document}` | recipient lookups and permission/visibility changes are audited |
| admin-audit-query | POST json | role `admin`, read-only | `{filters?,limit,offset,verify_chain?}` | `{events,total,head,chain?}` | `admin.audit_query/verify` |
| admin-set-role | POST json | role `admin` (not self, not other admins, only owner/viewer) | `{user_id,role}` | `{user}` | `admin.role_change` |
Data API (RLS, user JWT, explicit columns): `rpc/search_documents`, `rpc/dashboard_stats`, `audit_events`, `profiles` (select; update own `display_name` only). All `svc_*` RPCs are service-role only.
Global visibility is for signed-in TrustVault users only, not anonymous internet access. Owners may grant/update/revoke multiple named users from the UI. Recipient search requires 3 characters, returns at most 20 accounts, and is audited/rate-limited. Editors can download current and historical versions; read-only preview sends bytes to the browser and cannot prevent screenshots or other copying, but read grants cannot download attachments.
Tests: `supabase/tests/api/security.test.ts`, `supabase/tests/db/*.test.ts`.
