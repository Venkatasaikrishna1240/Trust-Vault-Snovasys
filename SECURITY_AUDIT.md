# TrustVault security audit

**Review date:** 2026-10-20  
**Review type:** read-only static review of the repository snapshot; no production access and no code-diff review (the branch started with no changes relative to `main`).

## Conclusion

The broad read-only review initially reported no confirmed exploitable vulnerability. A focused follow-up found a transient private-data display gap during direct account replacement (A→B); it is fixed in this worktree and covered by a frontend regression test. The review also identified recipient directory disclosure from partial searches. The product's sharing workflow now intentionally supports suggestions by display name or email username; this is bounded, rate-limited, and audited, but still exposes matching email addresses to authenticated users. This residual trade-off is documented below. A follow-up against the owner-confirmed dedicated test project verified anonymous denial on selected API and Edge Function routes; valid-user workflows, authenticated RLS, Storage object access, database suites, and Vercel deployment remain unverified. This is not a security certification. See `evidence/security-test-results.md` for the exact checks and `docs/requirements-evidence.md` for requirement-level status.

The reviewed boundary includes:

- Auth token verification and actor derivation in `supabase/functions/_shared/core.ts`, plus gateway configuration in `supabase/config.toml`.
- Document operations in `supabase/functions/_shared/handlers.ts` and the corresponding SQL service functions.
- RLS/privilege rules in `supabase/migrations/20261018000400_rls_and_privileges.sql`, access helpers in `20261018000200_access_helpers.sql`, and the private Storage policy in `20261018000600_storage_bucket.sql`.
- Audit-chain implementation in `20261018000300_audit_trail.sql` and role/audit service functions in `20261018000500_service_functions.sql`.
- Frontend auth/API/data services and the DB/API security test definitions.

## Security findings

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟡 MEDIUM | `frontend/src/features/auth/AuthContext.tsx` | 33–45 | A direct A→B session replacement could briefly leave A's profile and private page mounted under B's session before the profile-loading gate ran. Fixed by clearing the prior profile and enabling the gate before applying a changed user session; `frontend/src/tests/authContext.test.tsx` covers the transition. | 9/10 |
| 2 | ⚪ LOW | `supabase/migrations/20261020000200_recipient_name_and_username_search.sql` | 3–55 | Recipient suggestions disclose up to 20 matching registered profile emails to authenticated users searching display names or email usernames. Minimum query length, result cap, rate limit, and audit reduce bulk enumeration but do not eliminate this intentional privacy trade-off. | 10/10 |

The medium issue is fixed in the current working tree. The low-severity recipient discovery exposure remains as an intentional sharing feature: results are bounded, rate-limited, and audited, but authenticated users can discover matching emails. No other exploitable vulnerability was confirmed by static review.

## Limits and residual risks

- Source and tests do not prove hosted state. Public Auth settings and selected anonymous denials were checked on a dedicated test project. The supplied live Vercel login URL and security headers returned successfully, and a read-only preflight from that exact origin to one Edge Function returned HTTP 204. Authenticated policies, Storage object access, other function routes, hosted migration state, and Vercel dashboard settings were not checked.
- A pattern scan of tracked working-tree files and Git-reachable blobs found no recognizable Supabase service-role/secret values. This does not cover untracked files, unreachable Git objects, or credentials that are encoded/split or do not match known formats.
- The DB/API tests use a local harness; they do not emulate GoTrue or the actual Supabase Storage API. This environment lacked Bash, PostgreSQL, PostgREST, and Docker, so those tests were not run.
- An authorized request already in progress at revocation may complete. A user can retain bytes already previewed, downloaded, copied, or captured.
- Recipient lookup allows discovery of matching account emails by name or email username. The project owner requested this UX; the 3-character threshold, 20-result limit, audit, and per-user rate limit reduce but cannot prevent enumeration. Backend regression tests have been added but were not executable in this environment.
- The audit hash chain is tamper-evident for ordinary row-level changes, not tamper-proof against a database owner who can rewrite the events and recompute the chain.
- No antivirus/content disarm, mandatory MFA, independent audit-head storage, backup-retention verification, or browser E2E suite is established by this repository.

No database, hosted project, production data, or deployment was changed during this review.

### Dedicated test-project follow-up — 2026-10-21

Using only the configured public anon key and no user token, read-only requests received HTTP 401 for `profiles`, `documents`, and the unauthenticated document/admin Edge Function routes; the private bucket metadata request returned HTTP 400. A malformed bearer token was rejected with HTTP 401. Auth settings responded HTTP 200 (sign-up enabled, email auto-confirm disabled), and a preflight from the local app origin returned HTTP 204 with that origin allowed. No sign-up, login, row/file operation, migration, or setting change was performed. This is limited anonymous-denial evidence only; authenticated Admin/Owner/Editor/Viewer authorization and object-level Storage behavior remain NOT TESTED. See the detailed table in `evidence/security-test-results.md`.

### Production Vercel CORS incident — 2026-10-21

The production screenshot showed a CORS/network failure from `https://trust-vault-snovasys-19vk.vercel.app`. Read-only preflights at that time returned HTTP 403/no allow-origin from both that Vercel hostname and `https://trust-vault-snovasys.vercel.app`, but HTTP 204 for localhost development origins. This was a confirmed configuration blocker at the time, not evidence of a database authorization failure. No production secret or function deployment was changed in this workspace.

A later read-only check for the documentation update received HTTP 204 and a matching allow-origin for the supplied `-19vk` origin on a `document-share` preflight. The stable alias was not rechecked. This supersedes the earlier statement that the `-19vk` origin is currently rejected, but does not prove the change's cause, the behavior of every function, or authenticated search/upload/admin operations. Authenticated authorization and the underlying database operations remain unverified.

## Seven-requirement review update — 2026-10-20

The repository was checked against the seven required areas in `docs/requirements-evidence.md`. Static review confirmed existing controls for verified Edge Function identity, parameterized Supabase RPC calls, escaped search patterns, upload validation, document authorization, owner-controlled grants, private Storage and audit integrity. No additional confirmed SQL injection, IDOR, or privilege-escalation defect was identified in this pass. Wildcard and SQL-like recipient-query probes were added to the DB/API regression tests; they have not run because local PostgreSQL is unavailable. The local Supabase CLI also could not start or inspect its stack because Docker/Podman is missing. Current frontend tests/build and Edge Function type-check results are in `evidence/security-test-results.md`. Requirement status stays PARTIAL wherever DB/API/live service verification is required.

## Audit activity update — 2026-10-20

The audit path review found that preview/download success rows were written by the authorization RPC before the Edge Function fetched bytes or checked their digest. Storage or integrity failure could therefore leave a success-shaped event for an operation that never returned content. The new local migration `20261020000300_audit_activity_details.sql` moves successful events to a service-role-only operation called after byte retrieval and verification; that operation rechecks current permission before writing. Audit write failures now surface and prevent the response from returning bytes. The admin query resolves names/emails and document filenames from trusted database records. Legacy success rows cannot prove delivery and are labelled accordingly in the UI.

Frontend tests (7 files, 26 passed, 1 todo), frontend build/type-check, and Edge Function type-check passed. DB tests (160) and API tests (26) were attempted but all skipped at setup because PostgreSQL refused `127.0.0.1:54329`; the migration and live UI have not been tested or deployed. Thus the implementation is not yet runtime-verified at the database boundary. See `evidence/security-test-results.md`.

## Pre-deployment verification update — 2026-10-21

Static review of the current routes, auth context, document/admin pages, Edge handlers, RLS and service-function migrations found no confirmed critical/high exploitable issue. Source review is not a substitute for the database/API tests or live Auth/Storage checks, which could not run; see the dated evidence below.

| Severity | Finding | Disposition |
|---|---|---|
| LOW | UI labels claimed “256-bit AES” without application-level encryption evidence, said every action was audited although malformed requests may fail before audit, and described unsupported tag search/quota indicators. | Fixed the copy and removed the unsupported indicators in the frontend. Supabase/provider at-rest encryption was not independently verified; do not describe this app as implementing client-side encryption. |
| LOW | Recipient suggestions disclose up to 20 matching registered emails to signed-in searchers. | Existing intentional product behavior; query length, result limit, rate limiting, and audit reduce but do not eliminate account enumeration. DB/API regression cases remain unexecuted. |

The two dependency audit commands reported zero known vulnerabilities. The frontend build and TypeScript/Deno checks passed. The first full frontend run had one timeout, but the subsequent full rerun passed (9 files, 30 passed, 1 todo); the focused permission test also passed. DB/API suites failed during setup because PostgreSQL at `127.0.0.1:54329` refused connections (166 DB and 26 API cases skipped). A local browser smoke test used dummy Supabase settings and exercised only unauthenticated UI behavior. No live project, migration, or deployment was touched.

Static deployment-config review also found that the Vercel CSP default blocked `blob:` frames used by the PDF preview. `frame-src 'self' blob:` is now configured. A later production page inspection showed the deployed CSP also blocks the Google Fonts stylesheet referenced by `frontend/index.html`; the local policy now explicitly allows its stylesheet and font origins. The served header must be rechecked after a new deployment; this font issue does not explain Supabase password sign-in failures.

Residual readiness gaps include unverified hosted RLS/Storage/function configuration, no authenticated end-to-end browser run, browser-specific PDF Blob-preview isolation, no enforced MFA, and no self-service password reset, account ban, or account deletion. The current environment has no `frontend/.env.example`; its tracked deletion was preserved as requested.
