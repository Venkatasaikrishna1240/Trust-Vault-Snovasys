# TrustVault User Manual

TrustVault is a web application for storing documents and sharing them with registered accounts under owner-controlled permissions. The instructions below describe the features present in the repository; the account and document actions still depend on the deployed Supabase project being correctly configured.

**Live application:** [Open the TrustVault sign-in page](https://trust-vault-snovasys-19vk.vercel.app/login)

## 1. Introduction

TrustVault lets signed-in users upload PDF and image documents, organize and search their accessible documents, share documents with named users or all signed-in accounts, and review document versions. Document owners decide who can access their documents. Administrators have separate tools for account roles and audit events; being an administrator does not automatically grant access to private documents.

TrustVault is not an anonymous public file-hosting service. A global-visibility document remains in private Storage, and users must sign in to view it. Do not upload information unless you are authorized to store and share it.

## 2. Creating an account

1. Open the [TrustVault sign-in page](https://trust-vault-snovasys-19vk.vercel.app/login).
2. Select **Create an account**.
3. Enter your name, email address, and password.
4. Use a password of at least 12 characters. The name and email must be provided; the email must have a valid email format.
5. Select **Create account**.
6. If the page says to check your email, open the message from Supabase and follow its confirmation link. Return to TrustVault and sign in. Whether confirmation is required is controlled by the deployed Supabase Auth settings; the local development configuration does not require confirmation.
7. If signup succeeds without a confirmation requirement, sign in with the same email and password.

There is no organization-email domain restriction in the application. Email confirmation, when required, verifies control of the mailbox; it does not establish that a person belongs to an organization. If the confirmation email does not arrive, check spam, verify the address, wait briefly, and contact the administrator if it still does not arrive. Do not create repeated accounts with alternate addresses to work around a problem.

If TrustVault displays **“could not send the confirmation email,”** the signup request reached Supabase Auth but the email delivery step failed. The account may have been created without a confirmation email. Do not repeatedly submit signup; ask the administrator to check the account in Supabase Auth and inspect Auth logs and the SMTP provider's delivery/error log. Once delivery is fixed, the administrator can determine the safe next step for that account.

The application does not provide a self-service password-reset page. Contact the designated administrator if you cannot access your account.

## 3. Signing in and signing out

Enter the email and password used for registration and select **Sign in**. A successful sign-in opens the authenticated dashboard. Protected pages require a valid session; the application uses Supabase Auth session persistence and refresh. Your access to each document is checked separately.

To sign out, select **Sign out** in the account area at the bottom of the navigation panel. On a shared device, close the browser after signing out.

If sign-in fails:

- Check the email spelling and password, including capitalization and keyboard layout.
- If the account was just created, complete the confirmation step if Supabase requires it.
- Reload the page and try again if the network appears unavailable.
- If the problem persists, contact the administrator. Do not share your password or session token.

## 4. Understanding the dashboard and navigation

After sign-in, the dashboard shows counts for documents you own and documents shared with you, storage used by your documents, recent documents, recent activity, and a quick document search. Select **Search** to see matching results in Documents.

The navigation contains:

- **Dashboard** — summary, recent documents, recent activity, and quick search.
- **Documents** — searchable and filterable list of documents you can access.
- **Upload document** — upload a new file and choose its initial access.
- **Notifications** — the bell icon shows in-app notifications for document shares and updates. It is not an email-notification feature; delivery depends on the deployed notification service being configured.
- **Sign out** — ends the current session.
- **Audit log** and **Users & Roles** — administrator-only pages, visible only to accounts with the admin role.

On a narrow screen, use the menu button in the top navigation bar to open or close the navigation.

## 5. Uploading a document

1. Select **Upload document**.
2. Choose one PDF, PNG, or JPEG file. The displayed limit is 10 MB (10 MiB). Empty, unsupported, or oversized files are rejected. The server validates uploads independently of the browser.
3. Enter a title (required, up to 200 characters). Add an optional description (up to 2,000 characters) and choose a category.
4. Choose **Keep private**, **Specific people**, or **All signed-in users**.
5. If sharing with specific people, type at least three characters of a registered user's name or email into the recipient search. Review the matching account email, check each intended recipient, and choose **Can view** or **Can edit**.
6. Review the file and sharing selection, then select **Upload**.
7. Wait for the success message. TrustVault opens the new document page if the upload succeeds. If it fails, read the error and try again only after checking the file and connection.

Supported categories are General, Contract, Salary Letter, Technical Drawing, Audit, and Customer Record. Do not upload highly sensitive material unless your organization has approved TrustVault for that data.

## 6. Choosing document access

When uploading, choose the least access needed:

- **Keep private** — only the owner can access the document until the owner shares it.
- **Specific people** — search for registered TrustVault users by name or email (at least three characters), confirm the displayed email, and grant **Can view** or **Can edit** access. Recipients must have an account; an email invitation is not sent.
- **All signed-in users** — any signed-in TrustVault account can view and preview the document. This is not an anonymous public link. It does not permit every signed-in user to download the attachment or edit it. To make it private again, the owner must change visibility; revoking named grants alone does not remove global access.

The owner can change these settings later from the document's **Sharing** tab.

## 7. Read-only and edit permissions

**Can view (Reader):**

- Can view document metadata and request an inline preview of the current file.
- Cannot use the attachment download action or modify document details, replace the file, share, change visibility, or delete it.
- A preview sends file bytes to the browser. Read-only access cannot prevent screenshots, printing, copying, or other capture of content already delivered.

**Can edit (Editor):**

- Can view and download the current document and historical versions.
- Can change title, description, and category, and replace the file to create a new version.
- Cannot grant or revoke access, change global visibility, or delete the document.

Only the document owner can manage sharing, change visibility, and delete. An account's global role (Admin, Owner, or Viewer) does not override these document-specific permissions. The backend enforces access; the interface is not the only control.

## 8. Receiving and accessing shared documents

After signing in, open **Documents** and select **Shared with me**. You can also open a sharing notification and go directly to the document. Open the document to see the **Overview**, **History**, and—if you own it—**Sharing** tabs. The access badge indicates your current document permission.

Readers use **Preview**. Owners and editors can use **Download**. In-app notifications may report that a document was shared or updated; notifications are not sent by email and can be unavailable if the deployed notification service is not configured.

## 9. Managing documents and version history

On **Documents**, you can search by title or original filename, filter by owner, category, date range, and scope (**All documents**, **Owned by me**, or **Shared with me**), and move through result pages. Select a row to open its details.

In **Overview**, permitted users can view metadata and preview the current file. Owners and editors can update metadata and replace the file; each replacement creates a new version. The prior version remains listed in **History** with its filename, size, and upload date. Owners and editors can download older versions. There is no restore-version button: to make an older file current, download it and upload it as a replacement.

Only the owner can delete a document. The application asks for confirmation. Deletion removes access and starts storage cleanup; if cleanup is incomplete, the application reports that separately. Deletion is not a version-restore mechanism.

## 10. Sharing changes and revocation

Only the owner can open **Sharing** and:

- Add one or more registered email addresses and choose **Can view** or **Can edit**.
- Change an existing user's permission.
- Revoke an individual grant or select several grants to revoke.
- Make the document private or visible to all signed-in accounts.

TrustVault asks for confirmation before revoking access or changing global visibility. After revocation commits, new requests should be denied. Revocation cannot retrieve copies already downloaded, previewed, or captured. A request already in progress when access is revoked may finish.

## 11. Administrator guide

Accounts with the admin role see **Users & Roles** and **Audit log** in navigation.

### Users & Roles

The Users page lists employee names, emails, roles, account status, owned-document counts, and join dates. An administrator can change another non-admin active account between **Viewer** and **Owner**. Admin accounts and the current administrator are not available for role changes or offboarding.

Select **Manage** to inspect the employee's email, role, status, owned documents, authored versions, and issued permission records.

- **Deactivate account** is the preferred offboarding action. Confirm the prompt to disable the database profile, suspend Supabase Auth, and revoke active shares to the employee. Documents and audit history remain. A session already open may not disappear instantly, but database access checks deny protected operations for inactive accounts. If the Auth suspension fails after database deactivation, the page reports that the account is still blocked in TrustVault and the administrator can retry.
- **Reactivate account** restores sign-in after the administrator confirms. It does not restore grants revoked during deactivation; document owners must deliberately share again.
- **Permanently remove account** is separate and irreversible. The employee must first be inactive and the administrator must type the employee's email into the final confirmation. Documents, authored versions, or issued permission history block removal. TrustVault does not delete or transfer those records automatically; do not remove their records manually. Resolve ownership and retention through an approved administrator process, or leave the account deactivated while those dependencies remain.

Removal is performed by the server using Supabase Auth administration. If a multi-step operation partially fails, the page reports that retry is available; use **Manage** again and retry the same operation. Do not treat a pending removal message as proof that deletion completed. Account status and all administrative actions are enforced server-side, not only by these controls.

Admin promotion is not available in this page; it requires a separate trusted operator process.

### Audit log

The Audit log is read-only. Administrators can filter by action, outcome, document ID, actor ID, and date, and can request hash-chain integrity verification. Events may include supported document, permission, visibility, role, and denied operations. An audit record is evidence of a server-side event; a successful preview/download entry does not prove that a person saved or viewed the file.

Admin rights do not provide access to private document content. Use administrative access only for authorized operational tasks.

## 12. Security and privacy guidance

- Use a strong, unique password and never share account credentials.
- Verify recipients carefully before sharing sensitive documents.
- Give the minimum required access and use **Can view** when editing is unnecessary.
- Do not upload confidential information unless you are authorized and the organization has approved the service for it.
- Remember that a preview delivers content to the browser and that downloaded or captured copies cannot be recalled.
- Sign out on shared or public devices.
- Report suspicious activity or unexpected access to the designated administrator.
- Never send passwords, confirmation links, access tokens, or private documents through support messages.

## 13. Troubleshooting

| Problem | What to try |
|---|---|
| Registration fails | Check that name and email are present, the email is valid, and the password is at least 12 characters. If the error says the confirmation email could not be sent, stop retrying and contact the administrator; the account may already exist in an unconfirmed state. |
| Confirmation email does not arrive | Check spam/junk, confirm the email address is correct, wait briefly, then contact the administrator. The administrator should inspect Supabase Auth logs and SMTP provider logs and verify the account state. Confirmation behavior is controlled by Supabase Auth settings. |
| Login fails | Recheck credentials and email confirmation. Reload and retry once the connection is stable. Contact the administrator if the issue continues; do not send credentials. |
| Upload fails | Check that the file is a non-empty PDF, PNG, or JPEG under 10 MB. Confirm a title is entered and that any selected recipients are registered. If the problem persists, contact the administrator with the visible error and approximate time. |
| Recipient search finds no account | Search for at least three characters of the registered display name or email username. Confirm the spelling and ask the recipient to register first. |
| CORS, network, or Edge Function error | Reload and retry after confirming connectivity. If it continues, send the administrator the page, action, time, and visible error. The administrator should check the exact Vercel origin in Supabase `ALLOWED_ORIGINS` and the function logs; do not disable RLS or use wildcard CORS. |
| Unauthorized document access | Confirm you are signed into the correct account and ask the owner to check your current grant or document visibility. An administrator cannot bypass document permissions. |
| A document is missing | Use **All documents** and clear search and filters. Check whether the owner deleted the document or revoked your access. Missing and inaccessible documents may appear alike for privacy. |
| Version history is missing or an older version cannot be downloaded | Confirm you opened the right document. Historical downloads are available to its owner and active editors, not readers. Version restoration is not available. |
| Session expired or sign-in loops | Return to the sign-in page, sign in again, and reload the desired page. If it continues, contact the administrator with the browser and time of the problem. |
| Notifications are unavailable | Continue to check **Documents** directly. Notifications are in-app only and may require administrator setup; they are not the only way to find shared documents. |

## 14. Frequently asked questions

**Is TrustVault a public file-sharing service?**  
No. Global visibility allows signed-in TrustVault users to view and preview, but does not create an anonymous public URL.

**Can a Reader edit a document?**  
No. Readers can view metadata and preview the current document, but cannot edit or download it through the attachment action.

**Can every signed-in user access every document?**  
No. Access is limited to the owner, named grantees, or signed-in users when the owner has enabled global visibility.

**What happens when access is revoked?**  
New requests after revocation commits should be denied. Previously delivered or captured copies cannot be recalled.

**Who can see the audit log?**  
The full audit page is restricted to administrators. Users may see limited recent activity on their dashboard.

**Does email confirmation prove organizational identity?**  
No. It confirms mailbox control under the configured Auth flow. The application does not enforce an organization email-domain allowlist.

**What should I do if a feature fails?**  
Retry once after checking your connection. If it persists, contact the designated administrator with the action, time, and displayed error. Do not share secrets or ask anyone to weaken security controls.

## 15. Quick-start checklist

1. Register for an account.
2. Confirm your email if the application requests it.
3. Sign in.
4. Upload an authorized document.
5. Choose private or shared access.
6. Select the minimum permission needed.
7. Verify that the intended recipient can access it.
8. Sign out safely when finished.

For deployment and technical setup, see [the deployment guide](docs/deployment.md), [project documentation](PROJECT_DOCUMENTATION.md), and [security limitations](SECURITY_AUDIT.md).
