# PROMPTS.md — AI development record

**Provenance note:** Entries 1–5 and the previous entry 6 were inherited from this repository. The source attributes entries 1–5 to Claude (Sonnet 5.5) in Claude Code. The repository has Git history (including commit [`e32d602`](https://github.com/VenkatasaiKrishna1240/Trust-Vault-Snovasys/commit/e32d602555ece6ca9291bdde90d7f23f60587ef1)), but it contains summaries, not the original prompt transcripts or independent evidence for every historical test claim. Treat those details as inherited notes, not verified transcripts. Entry 6 incorrectly says there was no Git history; that statement was stale in the checked-out repository. This session's entry is based only on interactions and commands observed on 2026-10-20.

## Company-required evidence-linked entries

These entries use the requested format: dated ask, tool output, concrete defect/risk, correction, verification, and the real commit containing the resulting work. For the inherited 2026-10-18 record, the original transcript is unavailable; its link is the earliest committed implementation snapshot, not proof of the exact prompt timing. The remaining entries were recorded in the same commits as their corresponding implementation/documentation.

### 1. 2026-10-18 — Initial TrustVault security architecture (inherited summary)
- **Asked:** Build the TrustVault application with secure document sharing, authorization, and audit logging.
- **Tool produced:** PostgreSQL schema, RLS, service functions, Edge Function operations, and tests.
- **Wrong/risky:** The inherited review says the first draft allowed authenticated clients to call actor-parameterized internal authorization helpers, enabling queries about another actor's access.
- **Did instead:** Revoke client EXECUTE on those internal helpers and use caller-bound `app.my_access_level` in client-facing RLS/read paths.
- **Verification recorded:** The inherited record reports an RLS test denying client calls to internal helpers; original output is unavailable, so this is not independently verified here.
- **Commit:** [4fccba2 — Initial TrustVault project](https://github.com/VenkatasaiKrishna1240/Trust-Vault-Snovasys/commit/4fccba25ca3d5bcb34b369fc8de9514c0ea8c5f2) (implementation snapshot committed 2026-10-19).

### 2. 2026-10-20 — Session isolation and security hardening
- **Asked:** Inspect and harden the existing application against the supplied security requirements, preserving current behavior and recording real test evidence.
- **Tool produced:** Auth-context, recipient-lookup, demo-upload, and documentation changes with frontend/backend regression-test definitions.
- **Wrong/risky:** A direct User A → User B session replacement could briefly retain A's profile while B's session was active; the initial recipient lookup adjustment also needed a usability follow-up.
- **Did instead:** Clear the old profile and gate protected content until B's profile loads; keep the account-lookup trade-off bounded and document it.
- **Verification:** Frontend tests/build/type-check and Edge Function type-check were recorded as passing in the commit-era evidence. Backend DB/API bodies were blocked by unavailable PostgreSQL.
- **Commit:** [e96337b — Improve TrustVault security and documentation](https://github.com/VenkatasaiKrishna1240/Trust-Vault-Snovasys/commit/e96337b59cfd977ad60f18e7445a01256aa3364c).

### 3. 2026-10-20 — Recipient suggestions and privacy boundary
- **Asked:** Make recipient recommendations appear while entering a name or email username, rather than only after typing a full email.
- **Tool produced:** The prior privacy fix had restricted lookup to exact email, which avoided broad matching but did not provide the requested picker behavior.
- **Wrong/risky:** Exact-email-only was too restrictive for the requested workflow; unrestricted partial lookup would expose account information.
- **Did instead:** Restore case-insensitive display-name/email-username matching after three characters, cap results at 20, retain rate limiting/audit, and show the email before selection. Keep the account-discovery trade-off explicit.
- **Verification:** Frontend tests, type-check/build, and function type-check passed at that checkpoint. DB/API tests were defined but blocked because PostgreSQL was unavailable.
- **Commit:** [cdf88b5 — Improve TrustVault security and documentation](https://github.com/VenkatasaiKrishna1240/Trust-Vault-Snovasys/commit/cdf88b5c63ed64345de242ebd1d00901d9f5b022).

### 4. 2026-10-20 — Human-readable audit activity
- **Asked:** Make admin audit events clearly describe document activity, using trusted actor/document data and accurate outcomes.
- **Tool produced:** Audit labels, admin UI narratives, and post-verification delivery-event changes.
- **Wrong/risky:** Preview/download success could be logged at authorization time, before Storage retrieval, size/hash checks, and the final access recheck; that could report success when bytes were never safely prepared.
- **Did instead:** Record success only after byte retrieval/integrity verification and a final authorization check; fail closed if the audit write fails. Keep historical unverified delivery rows from being described as confirmed downloads/previews.
- **Verification:** Frontend audit tests/build/type-check and Edge Function type-check passed in the commit-era evidence. DB/API suites could not connect to PostgreSQL, so their test bodies did not run.
- **Commit:** [f9744f5 — edited audit logs in the admin login](https://github.com/VenkatasaiKrishna1240/Trust-Vault-Snovasys/commit/f9744f58595ce829c81ec2e0fd59422cc8a4124b).

### 5. 2026-10-19 — Documentation and security evidence audit
- **Asked:** Review and update the existing security and setup documentation; the exact original transcript is not preserved.
- **Tool produced:** Expanded security, deployment, testing, and project-status documentation.
- **Wrong/risky:** An inherited note claimed no Git history existed, which contradicted the repository history; historical test/deployment summaries also needed to be distinguished from fresh verification.
- **Did instead:** Correct the provenance note, cite real commits, and label inherited test/deployment claims as historical or unverified rather than presenting them as current results.
- **Verification:** Reviewed the committed documentation and Git history. Historical tests were not rerun as part of this correction.
- **Commit:** [e32d602 — Updated Documentation data](https://github.com/VenkatasaiKrishna1240/Trust-Vault-Snovasys/commit/e32d602bdf6e910e02e29a3e5d4dafdf869ad8e7); the provenance correction is also visible in [e96337b](https://github.com/VenkatasaiKrishna1240/Trust-Vault-Snovasys/commit/e96337b59cfd977ad60f18e7445a01256aa3364c).

### 1. 2026-10-18 — Master build prompt (Claude)
Prompt: the full TrustVault brief. AI produced: schema, RLS, svc_* functions, Edge Functions, tests.
Risk found (self-review before first run): first draft let `authenticated` execute `app.access_level(actor, doc)` / `actor_role(actor)` — a client could ask "what can user X do?". Fix: revoked from all API roles; RLS uses caller-bound `app.my_access_level`. Verified: rls.test "clients cannot call internal app.* helpers" passes.
### 2. 2026-10-18 — Throttle design (Claude) — audit/abuse
Risk (self-review): logging every throttled request as a denied event would extend the lock-out forever and let an attacker grow the audit table. Fix: `app.throttle_check` writes one marker per actor per minute and markers are excluded from the count. Verified: svc.test throttling test (exactly one marker).
### 3. 2026-10-18 — Revocation-timing test hang (Claude) — access control/audit
AI wrote a test holding an uncommitted revoke while another request downloaded; the suite hung. Real finding: audit writes serialise on one row lock, so a stuck transaction blocks every authorised operation. Fix: `set lock_timeout='5s'` on `app.write_audit` and `app.lock_document_level` (fail fast, closed); test rewritten to observe the in-flight window without holding the audit lock. Verified: 156 DB tests pass after DB rebuilt from migrations.
### 4. 2026-10-19 — Weak tamper tests (Claude) — audit trail
AI's first "edited event" test updated a row to its existing value (no tamper) and one test asserted `[true,false]` (vacuous). Fix: real tampering with row-count assertions; added outcome/actor tamper tests; added a test that documents the known limitation (recomputed chain is undetected). Verified: audit.test passes; mutation test (`scripts/mutation-test.sh`) makes 25 tests fail when `app.access_level` is broken.
### 5. 2026-10-19 — Frontend delegated to a sub-agent (Claude)
Agent built the React app. Found: 1 component test failed (mocked rejection reported as unhandled while the UI rendered correctly). Not fixed; marked `it.todo` with explanation (see docs/PROJECT_STATUS.md) rather than weakening checks.

### 6. 2026-10-19 — Documentation/security audit (attribution recorded as GitHub Copilot in VS Code)
This inherited entry says documentation, source, tests, and hosted migration state were reviewed. Its prompt is a summary, not a verbatim prompt, and its claim that no Git history existed conflicts with the history available in this checkout. The work is present in repository commit [`e32d602`](https://github.com/VenkatasaiKrishna1240/Trust-Vault-Snovasys/commit/e32d602555ece6ca9291bdde90d7f23f60587ef1). The historical test and deployment claims have not been rerun for this session.

### 7. 2026-10-20 — Security hardening and evidence (Copilot SDK in VS Code)
The actual prompt was the full titled TrustVault brief in this interaction. Excerpt: “identify security weaknesses, implement missing protections, test them, and save all genuine evidence and documentation directly in the repository.” I inspected the existing project and Git state, switched to `security-hardening`, requested a read-only security review, ran the frontend build/tests and Deno type-check, and added reproducible evidence and documentation. Defects corrected: the auth listener could briefly show the previous account's page during direct session replacement; `typecheck:functions` omitted the Edge Functions' Deno config; the demo upload form omitted required fields; and sign-up text incorrectly implied accounts needed admin approval to upload. The account-switch regression test verifies no render contains account B's session with account A's profile; the full frontend suite passed with 19 tests and 1 existing todo. Verification: see `evidence/security-test-results.md` and its logs. Demo provisioning syntax passed, but its network behavior was not tested. The local backend/Auth/Storage tests could not run because this environment has no Bash, PostgreSQL, PostgREST, or Docker executables. No commit has been created.

### 8. 2026-10-20 — Recipient lookup privacy fix (Copilot SDK in VS Code)
Actual follow-up prompt: “Fix all issues.” The review had found that partial-name and email-prefix sharing searches returned matching profile IDs, emails, and names. I briefly restricted lookup to exact email to address that privacy concern; backend tests could not run because the local test database was unavailable.

### 9. 2026-10-20 — Recipient suggestions usability (Copilot SDK in VS Code)
Actual prompt: “in uploading documents only when the full email or name is typed then only its showing the accounts i didnt like it i want when user entered name or user name search and recommend the email make to fix this and rectify and dont distrub the application flow”. I restored partial, case-insensitive suggestions from display name and the username part of the email, while keeping full-email lookup. The existing 250 ms debounce, three-character minimum, 20-result cap, rate limit, audit, and upload selection flow remain. The UI labels recommendations with their email. Added frontend, DB, and API tests; the frontend suite (6 files, 21 passed, 1 existing todo), build, frontend type-check, and Edge Function check pass. DB/API execution remains blocked because PostgreSQL is not running at `127.0.0.1:54329`. This restores an intentional, bounded account-discovery trade-off; matching emails are visible to signed-in users. No commit was created for this interaction.

### 10. 2026-10-20 — Seven-area security review and evidence refresh (Copilot SDK in VS Code)
Actual prompt: the supplied “Complete Security Hardening, Automated Testing, Evidence and Documentation” brief. Excerpt: “strengthen its security against the seven requirements below, implement missing controls, run genuine security tests, and keep the source code, evidence, and documentation synchronized.” I inspected the current branch/history, threat model, requirements matrix, Edge handlers, database migrations, and DB/API test definitions. I found that the backend test harness could not connect to PostgreSQL and Supabase CLI status could not inspect containers because Docker/Podman is absent; no hosted operation was attempted. I added wildcard and SQL-like recipient-search regression probes, mapped the seven requirements directly in the evidence matrix, and added explicit STRIDE coverage/priorities to `THREATS.md`. Verification: frontend suite 6 files / 21 passed / 1 existing todo; build, lint/type-check and Edge Function check passed. DB suite (159 tests) and API suite (25 tests) were attempted and blocked at setup (`ECONNREFUSED 127.0.0.1:54329`), so their test bodies did not run. No new runtime vulnerability was confirmed in the static review. No commit was created.

### 11. 2026-10-20 — Human-readable admin audit activity (Copilot SDK in VS Code)
Actual prompt: “Update the existing TrustVault admin audit log to show clear, human-readable document activity. First inspect the current audit schema, logging functions, permissions, and admin UI. Modify the existing implementation; do not rebuild it.” The review found that preview/download success was logged during authorization, before Storage retrieval and SHA-256 verification, so a failed byte operation could leave a misleading success event. I added migration `20261020000300_audit_activity_details.sql` to move success logging after retrieval/integrity checks and a final access recheck, enrich admin query results with database-resolved labels, and preserve service-role-only access. The admin UI now produces human-readable sharing, revocation, preview/download, upload/edit/delete and denial descriptions; older delivery events are explicitly marked unverified. Audit-write failures are no longer silently swallowed. Verification: frontend suite 7 files / 26 passed / 1 existing todo; build, frontend type-check and Edge Function type-check passed. DB tests (160) and API tests (26) were attempted but blocked at `127.0.0.1:54329`; no backend test body, migration, hosted service, or live UI run occurred. No commit was created.

### 12. 2026-10-20 — In-app document notifications (Copilot SDK in VS Code)
Actual prompt summary: add a top-right notification control with a matching popup/toast when a user receives a new shared document or update, preserving existing UI and flows. Implemented recipient-scoped notices generated by database triggers for direct/global shares and successful edit/replacement audit events; added RLS, a caller-bound read-state RPC, Realtime with polling fallback, and the bell/panel/toast UI. Review found global-document updates were not reaching all signed-in recipients; the trigger and a regression test were extended. Also corrected a stale DB test assumption: update notices use the trusted audit request ID as `source_id`, not the document-version ID. Verification at that checkpoint: frontend tests passed (8 files, 28 passed, 1 existing todo); frontend lint/type-check, production build and Edge Function type-check passed. The focused DB test was blocked before execution because PostgreSQL refused `127.0.0.1:54329` (5 skipped). No migration DDL or deployment occurred during that checkpoint; the later remote metadata/history check is recorded in entry 13.

### 13. 2026-10-20 — Notification setup diagnosis and dashboard login route (Copilot SDK in VS Code)
Actual prompt summary: diagnose why document-share notifications were unavailable and make sign-in open the dashboard first. An initial read-only REST query returned `PGRST205` for `public.user_notifications`. After authorization, remote metadata inspection found the table, RPC, four triggers, RLS, grants and Realtime publication present, but migration history lacked the version; this session did not execute migration DDL and recorded the verified version only. The notification UI now distinguishes missing setup from transient failures, and sign-in routes to the dashboard. Focused tests passed (3 files, 8 tests); the final frontend suite passed (9 files, 30 tests, 1 todo), and type-check/build passed. Database harness and signed-in live delivery remain unverified. No application deployment occurred.

### 14. 2026-10-21 — Pre-deployment verification and claim correction (Copilot SDK in VS Code)
Actual prompt summary: complete pre-deployment review of application flows, security controls, documentation, tests, and deployment readiness; fix safe focused issues without pushing or deploying. Source review found frontend copy claiming “256-bit AES” without app-level encryption evidence, absolute audit coverage despite validation failures that may occur before audit, unsupported tag search/quota wording, incomplete Vercel setup detail, and a CSP that blocked the `blob:` PDF preview iframe. Corrected the UI claims, allowed the required preview frame source, and documented Vercel build/output/rewrite/header checks. The `frontend/.env.example` deletion that surfaced during the audit was preserved at the owner's direction, and setup docs now explain manual frontend env creation.

Verification: frontend build, frontend type-check, Edge Function type-check, and both npm dependency audits passed. The first frontend suite attempt had a timeout; the full rerun passed (9 files, 30 passed, 1 existing todo). The DB/API suites could not connect to local PostgreSQL (166/26 cases skipped before execution). A local unauthenticated browser smoke test used a dummy Supabase URL; no live credentials, hosted project, migration, or deployment were used. No commit was created, so no commit link is available.

## Reusable prompts

- **Security-sensitive feature:** “Inspect the current implementation, policies and tests first. State the trust boundary and threat model. Implement the smallest secure change, preserve default-deny/RLS, add regression tests for allowed and denied cases, run relevant tests, and report what could not be verified. Do not use client-supplied identity or weaken authorization to make a test pass.”
- **Documentation refresh:** “Verify every statement against source and tests. Separate implemented, historically tested, currently tested, unverified, and planned. Inspect Git history; do not invent missing attribution, prompt text, test evidence, or commit links.”
- **Database change:** “Add a new timestamped migration. Check current applied history and target before pushing. Include revoke-then-grant, empty search_path for functions, authorization/audit in one transaction, and DB/API tests for abuse cases.”

## Repository instructions for agents

See [AGENTS.md](AGENTS.md) for coding/security rules and [docs/DOCUMENTATION_CHECKLIST.md](docs/DOCUMENTATION_CHECKLIST.md) for feature-by-feature documentation impact. Add a dated entry only for work actually performed; include tool, prompt summary, output, a specific discovered mistake/risk, correction, exact verification, and a real commit link if available. If a detail is unavailable, mark it pending rather than infer it.

### Historical details still needed (do not fabricate)

- The original prompt transcripts, independently verifiable tool attribution, and complete post-change backend test run for the older records are not present in the repository history inspected here. The history proves when these summaries were committed, not that each described interaction or test occurred. The project author can supply the missing transcripts and test outputs if required by the challenge.
