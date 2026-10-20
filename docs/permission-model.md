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

The admin role does not create document access. Every signed-in profile, including viewer/admin, may upload and own their own documents. Read-only preview sends bytes to the browser; hiding the attachment control cannot prevent screenshots, print, or saving browser-delivered data. Historical versions are downloadable only by owners and current editors in the current source after migration 0900; that migration remains pending in the latest observed hosted list, so the hosted project still has owner-only history downloads until migration push.

## Account roles and grant history

- New profile default is `viewer`; role comes from `public.profiles.role`, not JWT/user metadata.
- Admin UI can change another non-admin profile between `viewer` and `owner`; it cannot change own role, another admin, or create an admin. Admin creation/promotion is an out-of-band trusted operation.
- `owner`/`viewer` account role governs administration capability only; it is separate from each document's owner and per-document `read`/`edit` grants.
- A grant is to an existing registered user email; self-grants are rejected. A document/user has at most one active grant; changing read/edit revokes the previous row and inserts a new row so history remains. Revocation is soft-history, not destructive grant-row deletion.
- Recipient lookup accepts a complete email address and matches it case-insensitively and exactly. It does not search names or partial email strings. A lookup can still confirm whether a known exact address has an account.
- Multiple selected upload recipients are limited to 20; upload-time document record and grants/global visibility are created in one SQL transaction.

## Global visibility and revocation

`documents.is_global` defaults false. The owner may enable visibility to all signed-in accounts; this is not anonymous access. Global users receive `read`-equivalent access. Turning global off removes that general route but preserves explicitly named grants. Revoking a named grant does not exclude that user while the document is global.

Each call re-evaluates the current access rows; no positive decision is cached and no reusable signed URLs are issued. After revoke commits, the next request is denied. A request authorized before commit may finish, and bytes already returned cannot be recalled.

## Audit visibility

Audit RLS allows admins to read all events, users to read their own actor events, and document owners to read events for their documents. Admin audit query is read-only and audited; its response does not grant document-content access. Audit chain and residual limits are described in `docs/security-design.md`.
