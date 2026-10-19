# PROMPTS.md — AI development record

**Provenance note:** Entries 1–5 below were already present in this repository file when this documentation audit began. They are preserved as historical records supplied by the repository, not independently verified against Git because this workspace has no `.git` directory and no commit history. Their source attributes the work to Claude (Sonnet 5.5) in Claude Code. There are no verifiable commit URLs. New entries below reflect work observed in the current VS Code session; subsequent work must be recorded by its actual author/tool.

### 1. 2026-10-18 — Master build prompt (Claude)
Prompt: the full TrustVault brief. AI produced: schema, RLS, svc_* functions, Edge Functions, tests.
Risk found (self-review before first run): first draft let `authenticated` execute `app.access_level(actor, doc)` / `actor_role(actor)` — a client could ask "what can user X do?". Fix: revoked from all API roles; RLS uses caller-bound `app.my_access_level`. Verified: rls.test "clients cannot call internal app.* helpers" passes.
### 2. 2026-10-18 — Throttle design (Claude) — audit/abuse
Risk (self-review): logging every throttled request as a denied event would extend the lock-out forever and let an attacker grow the audit table. Fix: `app.throttle_check` writes one marker per actor per minute and markers are excluded from the count. Verified: svc.test throttling test (exactly one marker).
### 3. 2026-10-18 — Revocation-timing test hang (Claude) — access control/audit
AI wrote a test holding an uncommitted revoke while another request downloaded; the suite hung. Real finding: audit writes serialise on one row lock, so a stuck transaction blocks every authorised operation. Fix: `set lock_timeout='5s'` on `app.write_audit` and `app.lock_document_level` (fail fast, closed); test rewritten to observe the in-flight window without holding the audit lock. Verified: 156 DB tests pass after DB rebuilt from migrations.
### 4. 2026-10-18 — Weak tamper tests (Claude) — audit trail
AI's first "edited event" test updated a row to its existing value (no tamper) and one test asserted `[true,false]` (vacuous). Fix: real tampering with row-count assertions; added outcome/actor tamper tests; added a test that documents the known limitation (recomputed chain is undetected). Verified: audit.test passes; mutation test (`scripts/mutation-test.sh`) makes 25 tests fail when `app.access_level` is broken.
### 5. 2026-10-19 — Frontend delegated to a sub-agent (Claude)
Agent built the React app. Found: 1 component test failed (mocked rejection reported as unhandled while the UI rendered correctly). Not fixed; marked `it.todo` with explanation (see docs/PROJECT_STATUS.md) rather than weakening checks.

### 6. 2026-10-19 — Documentation/security audit (GitHub Copilot in VS Code)
Prompt summary: inspect the actual TrustVault implementation, tests and Git history, then reconcile requested documentation with implemented behavior without inventing evidence. Produced: updated README, threat model, API, agent instructions and design/setup/testing docs; added a feature-documentation checklist and technical write-up. Risk/mistakes discovered: stale docs said there were eight functions and described upload as owner-role-only; actual source has nine functions and lets every profile-backed signed-in account upload. Also found migration 0900 was still pending on the linked hosted project, the demo provisioning script no longer matches the upload fields, and no Git history existed. Changes/verification: cross-checked handlers, migrations, RLS, tests and CLI migration/function status; frontend build/tests passed during this session (18 passed, 1 existing todo). Full backend suites were not run. Commit URL: unavailable (no Git repository).

## Reusable prompts

- **Security-sensitive feature:** “Inspect the current implementation, policies and tests first. State the trust boundary and threat model. Implement the smallest secure change, preserve default-deny/RLS, add regression tests for allowed and denied cases, run relevant tests, and report what could not be verified. Do not use client-supplied identity or weaken authorization to make a test pass.”
- **Documentation refresh:** “Verify every statement against source and tests. Separate implemented, historically tested, currently tested, unverified, and planned. Inspect Git history; if absent, say so and use pending attribution/commit fields instead of inventing them.”
- **Database change:** “Add a new timestamped migration. Check current applied history and target before pushing. Include revoke-then-grant, empty search_path for functions, authorization/audit in one transaction, and DB/API tests for abuse cases.”

## Repository instructions for agents

See [AGENTS.md](AGENTS.md) for coding/security rules and [docs/DOCUMENTATION_CHECKLIST.md](docs/DOCUMENTATION_CHECKLIST.md) for feature-by-feature documentation impact. Add a dated entry only for work actually performed; include tool, prompt summary, output, a specific discovered mistake/risk, correction, exact verification, and real commit link if available. Otherwise write “no Git repository / no commit URL” or mark the entry pending for the developer.

### Pending historical detail (do not fabricate)

- For changes summarized in existing 2026-10-19 records (migrations 0700–0900, dynamic localhost CORS, upload-time sharing, editor historical downloads), the original prompt transcript, exact tool attribution for each change, and a complete post-change backend test run are not present in repository Git/history. The existing summaries are preserved above; add precise details only if the author can supply them.
