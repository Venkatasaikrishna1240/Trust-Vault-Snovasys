# TrustVault — Snovasis Technical Challenge Write-up

## Problem

For this challenge, I worked on the problem of securely storing documents and sharing them with specific people. The important design choice is that the browser does not decide who can access a file. PostgreSQL and authenticated Supabase Edge Functions enforce that decision.

## What I implemented

- React/Vite/TypeScript app with Supabase email/password authentication.
- Every signed-in profile can upload and own PDF, PNG, and JPEG files.
- Owners can grant named users read or edit access, change/revoke grants, or make a document visible to all signed-in accounts. Global visibility is not anonymous internet access.
- Readers can see metadata and request a current inline preview. Owners/editors can download current and historical versions. Editors may edit/replace; only owners manage sharing/deletion.
- Admins can review audit events and change other non-admin accounts between `owner` and `viewer`; admin status does not bypass document access.
- RLS-protected reads, a private Storage bucket with restrictive client-deny policy, audited service-role database operations, and a hash-linked append-only audit trail.

## How access and file handling work

Each Edge Function validates the Supabase Auth token using `auth.getUser()`. The actor comes from that verified user, never request fields. A service-role-only `svc_*` function checks current database grants and writes an audit event before returning a storage key. Only then does the Edge Function read/write private Storage. No reusable signed URLs are issued. Editors and owners may request historical downloads through the same re-authorized/audited path.

## Security decisions and limitations

After a revoke commits, new requests are denied; a request authorized before the commit can finish. Previously delivered bytes, screenshots, and local copies cannot be recalled. Deletion revokes access and soft-deletes metadata before attempting to purge all storage objects; purge can be incomplete. Audit rows are append-only for application roles and chained by hashes, but a database owner can rewrite data and recompute the chain. The head hash should be stored independently for stronger evidence.

## AI-assisted development and review

`PROMPTS.md` contains inherited AI-work summaries and one record for the current session. Git history exists, but the older entries are not verbatim prompt transcripts and their historical test claims were not rerun here. This session found that the documented Deno type-check command omitted its project config and that the demo upload script lacked required form fields; the command/script and stale sign-up text were corrected. The current test and provenance limits are recorded in `evidence/` and `PROMPTS.md`.

## What is not finished

The application does not provide anonymous public links, admin access to private content, self-service admin creation, MFA enforcement, antivirus, content disarm/sanitization, Deno unit tests, or Playwright E2E coverage. Real hosted Auth/Storage, backup retention, and end-to-end browser behavior require deployment/integration verification. The last recorded hosted CLI inspection found migrations 0100–0800 and nine functions active, with migration 0900 pending; that was not refreshed in this session. The local backend test harness has historical pass reports, but the latest migrations were not verified in this environment. See `evidence/requirements-matrix.md` and `docs/PROJECT_STATUS.md`.