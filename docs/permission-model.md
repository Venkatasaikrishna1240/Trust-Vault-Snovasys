# Permission model
# Permission model

## Document access (evaluated per request)

| Action | Owner | Edit grant | Read grant | Global signed-in reader | Admin without grant | Stranger |
|---|---|---|---|---|---|---|
| List/see metadata | Yes | Yes | Yes | Yes | No | No |
| Inline preview current version | Yes | Yes | Yes | Yes | No | No |
| Download current attachment | Yes | Yes | No | No | No | No |
| Download historical attachment | Yes | Yes (migration 0900) | No | No | No | No |
| Edit metadata / replace current file | Yes | Yes | No | No | No | No |
| Share, change visibility, revoke | Yes | No | No | No | No | No |
| Delete document | Yes | No | No | No | No | No |

The admin role does not create document access. Every signed-in profile, including viewer/admin, may upload and own their own documents. Read-only preview sends bytes to the browser; hiding the attachment control cannot prevent screenshots, print, or saving browser-delivered data. Historical versions are downloadable only by owners and current editors in the current source after migration 0900; the 2026-10-20 linked dry-run showed `20261019000300_editors_can_download_history.sql` pending. Verify the target migration history before asserting hosted behavior.

## Account roles and grant history

- New profile default is `viewer`; role comes from `public.profiles.role`, not JWT/user metadata.
- Admin UI can change another non-admin profile between `viewer` and `owner`; it cannot change own role, another admin, or create an admin. Admin creation/promotion is an out-of-band trusted operation.
- `owner`/`viewer` account role governs administration capability only; it is separate from each document's owner and per-document `read`/`edit` grants.
- A grant is to an existing registered user email; self-grants are rejected. A document/user has at most one active grant; changing read/edit revokes the previous row and inserts a new row so history remains. Revocation is soft-history, not destructive grant-row deletion.
- Recipient lookup searches display names and the username part of email addresses (before `@`) case-insensitively after three characters; full email addresses also match. Results are capped at 20, omit the current user, and show the email so the uploader can select the correct account. The endpoint is rate-limited and audited; matching profile details are still disclosed to authenticated searchers.
- Multiple selected upload recipients are limited to 20; upload-time document record and grants/global visibility are created in one SQL transaction.

## Account status and employee offboarding

Migration `20261021000100_employee_offboarding.sql` adds `profiles.is_active`, default true. Inactive profiles cannot resolve an application role or document access through the shared helpers; RLS also blocks protected reads and service functions reject inactive actors. An inactive user can select only their own profile row to discover status and sign out. New active grants to inactive recipients are rejected, and deactivation revokes current grants to that recipient. Reactivation does not recreate those grants.

An administrator first deactivates the account, which commits the database block and grant revocations before the Edge Function applies a Supabase Auth ban. An already-issued access JWT is not assumed to expire immediately; the profile status is the database authorization boundary for subsequent reads and operations. The client periodically rechecks status for UX only. Permanent Auth deletion requires prior deactivation and is blocked while the profile owns documents, authored versions, or issued permission records. Documents and audit events are not automatically deleted or transferred. Account removal is staged/retryable and leaves an independent offboarding snapshot so audit identity outlives the profile. No ownership-transfer workflow is implemented; those retained dependencies require an approved retention/transfer resolution before removal.

## Global visibility and revocation

`documents.is_global` defaults false. The owner may enable visibility to all signed-in accounts; this is not anonymous access. Global users receive `read`-equivalent access. Turning global off removes that general route but preserves explicitly named grants. Revoking a named grant does not exclude that user while the document is global.

Each call re-evaluates the current access rows; no positive decision is cached and no reusable signed URLs are issued. After revoke commits, the next request is denied. A request authorized before commit may finish, and bytes already returned cannot be recalled.

## Audit visibility

Audit RLS allows admins to read all events, users to read their own actor events, and document owners to read events for their documents. Admin audit query is read-only and audited; its response does not grant document-content access. Audit chain and residual limits are described in `docs/security-design.md`.

## Notifications

Notifications are generated by trusted database triggers for a new direct grant, a transition to global visibility, or a successful `document.edit`/`document.replace` audit event. A recipient sees only their own notice rows through RLS; notification read state is changed through a function bound to `auth.uid()`, not by direct table writes. Notification content records only the document title and actor name at event time. Opening a notice does not grant access: the normal document route and current RLS/service authorization still decide access, including after a revoke.
