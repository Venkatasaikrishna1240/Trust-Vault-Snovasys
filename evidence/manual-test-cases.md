# Manual security test cases

Run only against local Supabase or a dedicated disposable test project with dummy data. Use separate Admin, Owner A, Owner B, Viewer, and Outsider identities. Do not use production data, production credentials, real documents, or service-role keys in a browser.

**Execution status:** These cases are procedures only. No manual browser/API case below was executed in the 2026-10-20 session.

| ID | Procedure | Expected result | Actual |
|---|---|---|---|
| M-01 | Open a protected route signed out. Call a protected Edge Function without a bearer token, then with an invalid/expired token. | UI requires sign-in; API returns unauthorized and no private metadata or bytes. | NOT TESTED |
| M-02 | As Outsider, call document-get/preview/download using a private Owner A document UUID. Repeat by changing URL query IDs and JSON `document_id`, `owner_id`, `user_id`, and role-like fields. | Denied with uniform missing/inaccessible response; no document metadata or bytes. Identity and role are taken from verified Auth/profile, not supplied fields. | NOT TESTED |
| M-03 | As Owner A, create a dummy document. As Owner B and Outsider, attempt read, preview, download, edit, replacement, delete, history, share and revoke independently. | Only the owner succeeds unless a specific grant exists. Unauthorized operations return no bytes or unnecessary metadata. | NOT TESTED |
| M-04 | As Viewer, alter document, version, permission, owner, or object IDs in each route. Try current and historical download separately. | ID manipulation does not increase permission; missing and inaccessible document responses remain uniform. | NOT TESTED |
| M-05 | Try setting `role:"admin"` or another actor/user ID in Auth metadata and request bodies. Try profile role updates through PostgREST. | Client input cannot change trusted identity or role; profile write policy blocks role changes. | NOT TESTED |
| M-06 | Owner A grants Viewer read access, Viewer previews, then Owner A revokes. Repeat preview/get/download/history/edit/delete with the same IDs and token. | Access succeeds only before revoke. Subsequent requests are denied. No signed URL remains usable. | NOT TESTED |
| M-07 | With Viewer’s own JWT, call Supabase Storage upload/download/list endpoints for guessed and known dummy object paths. Also try direct Data API reads/writes. | Private bucket client access and protected writes are denied by policy. | NOT TESTED |
| M-08 | As Viewer, try granting self or another user access, changing visibility, overwriting, and deleting Owner A’s file. Repeat as an active editor. | Viewer cannot edit/share/delete; editor may edit/replace and download as granted but cannot share/delete; only owner manages grants/visibility. | NOT TESTED |
| M-09 | As an ordinary user, try to insert/update/delete audit rows. As Admin, query/verify events for upload, preview/download, edit/delete, grant/revoke and denials. | Ordinary audit mutation fails. Authorized audit query shows permitted events; audit verification reports chain state. | NOT TESTED |
| M-10 | Sign in as Owner A, view private documents, sign out, then sign in as Owner B in the same browser. Repeat using a second browser tab. | Owner A’s private UI/query data is cleared or inaccessible after account switching. | NOT TESTED |
| M-11 | Upload allowed PDF/PNG/JPEG dummy files and invalid, oversized, mismatched, or malformed files. Search documents as owner, reader, and unrelated user. | Allowed files pass validation; malformed/oversized files fail; search returns only accessible data. | NOT TESTED |
| M-12 | Before any destructive test, check the configured Supabase URL/project ref and confirm it is local/disposable. Run build, frontend tests, Deno check, then the backend suite only if its isolated harness prerequisites exist. | Tests use dummy data and do not target a hosted production project. Capture sanitized output and exact status. | NOT TESTED |
| M-13 | In the upload sharing picker, enter at least three characters from a registered display name or the part of an email before `@`; also try a full email. Select a suggestion and inspect its email before uploading. | Matching accounts are suggested case-insensitively; each suggestion shows its email; selection and upload sharing continue to work. Terms shorter than three characters do not trigger a search. | NOT TESTED |

## Five-minute demo checklist

This checklist demonstrates the intended positive and negative paths. It remains a procedure until performed and recorded:

1. **0:00–0:45 — Sign in as Owner A.** Upload a harmless dummy PDF; choose a named Viewer grant with `read`.
2. **0:45–1:30 — Sign in as Viewer.** Open the received document and preview it. This is the authorized path.
3. **1:30–2:00 — Check the boundary.** As Viewer, attempt attachment download, edit, replace and delete. Each should be denied.
4. **2:00–2:45 — Try an IDOR.** As Outsider, replace the document UUID in a detail/preview/download URL with Owner A’s UUID. No private metadata or bytes should appear.
5. **2:45–3:30 — Revoke.** Sign in as Owner A and revoke Viewer. Sign back in as Viewer and repeat the preview/download request; subsequent requests should be denied.
6. **3:30–4:15 — Check privileged roles.** Confirm Admin can use only the allowed admin functions and cannot open Owner A’s private document merely because of the admin role.
7. **4:15–5:00 — Show evidence.** Review the relevant audit events and the recorded test results. Explain that a copy already downloaded cannot be erased, and that live Storage/backend checks must be demonstrated against a dedicated test environment.
