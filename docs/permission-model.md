# Permission model
| Action | Owner | Edit grant | Read grant | Admin (as admin) | Stranger |
|---|---|---|---|---|---|
| list/see metadata | ✔ | ✔ | ✔ | ✘ | ✘ |
| download current | ✔ | ✔ | ✘ | ✘ | ✘ |
| preview current content | ✔ | ✔ | ✔ | ✘ | ✘ |
| edit metadata, replace content | ✔ | ✔ | ✘ (403) | ✘ | ✘ (404) |
| download old versions | ✔ | ✔ | ✘ | ✘ | ✘ |
| grant / revoke / delete | ✔ | ✘ | ✘ | ✘ | ✘ |
| view audit (own docs / own actions) | ✔ | own actions | own actions | all (read-only) | own actions |
Every registered account, including viewers and admins, may upload and own its own documents. Admin status does not grant access to other users' private documents. Admin may set other non-admin users to owner/viewer; not self, not other admins, cannot create admins (provision via SQL/script). A grant to the document owner themself is rejected. One active grant per (document,user); changing level keeps history. Deletion is document-owner-only and revokes all grants. Decision logic: `app.access_level`, `app.level_satisfies`, `app.authorize_or_deny` (migrations 0200/0500).

Owners may optionally set `documents.is_global` to make a document visible to every signed-in account. This is not anonymous/public-link access. The document remains in the private Storage bucket, and every request is authorized/audited. Read-only users receive inline preview bytes rather than an attachment download; a browser cannot prevent screenshots, printing, or saving content it has received. Owners and edit-grantees may download current and historical versions. Migration 0700 introduces global visibility and migration 0900 allows editors to download version history.
