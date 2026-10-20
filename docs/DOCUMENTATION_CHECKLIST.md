# Feature documentation checklist

For every feature, bug fix, permission change, API change, migration, or deployment/configuration change, inspect the implementation/tests first and mark each item **Update**, **No material impact**, or **Pending verification**. Update only materially affected files; give a one-line reason for a “No material impact” decision in the PR/change summary. Do not claim a check/test/deployment ran unless its result is available.

| Documentation target | Ask before closing the change |
|---|---|
| `README.md` | Does a user-facing capability, prerequisite, setup step, environment variable, test command, deployment step, limitation, or status change? |
| `THREATS.md` | Does the change add/remove a trust boundary, permission, data path, threat mitigation, residual risk, or security test? Reassess attack scenario, source, test, residual and status. |
| `PROMPTS.md` | Was AI assistance actually used? Record the real date/tool/prompt summary, output, discovered mistake/risk, correction, exact verification and real commit link if one exists. Never infer missing history. |
| `API.md` | Did any Edge Function/Data API route, method, payload, response, validation, authorization, status/error, or audit action change? |
| `AGENTS.md` | Did repository architecture, invariant, coding convention, secret policy, validation command, or agent workflow materially change? |
| `PROJECT_WRITEUP.md` | Did implemented scope, architecture, permission semantics, AI lessons, excluded scope, evidence, or material limitations change? |
| `docs/architecture.md` | Did component boundaries, data flow, schemas, migration sequence, function/storage path, or deployment topology change? |
| `docs/permission-model.md` | Did access levels, actions, ownership, role meaning, visibility, revocation, or version access change? |
| `docs/security-design.md` | Did authorization, storage, audit, upload, revocation, failure handling, trust assumptions, or residual risk change? |
| `docs/testing.md` | Did suites, commands, tooling, test coverage, harness fidelity, pass evidence, or known test gaps change? |
| `docs/deployment.md` / environment docs | Did migrations, Edge Functions, secrets, origins, Auth, Vercel, local services, or required rollout order change? |

## Close-out record

- Feature/change: Recipient-scoped in-app notifications for document shares and successful updates, 2026-10-20.
- Source and tests inspected: AppLayout, Supabase client, toast conventions, share/edit flow, audit schema/triggers, notification RLS/RPC, and frontend/DB test harness.
- Defects found and corrected: update notices key on the successful audit request ID, not the document-version ID; updates to global documents must also notify all signed-in users. The trigger and DB regression coverage reflect both behaviors.
- Changes: added migration `20261020000500_user_notifications.sql`, recipient-scoped read/subscription service, bell/panel/toast component, and layout/test integration. Notices do not grant document access; delivery uses Realtime with polling fallback.
- Documents updated: README, API, THREATS, PROMPTS, PROJECT_WRITEUP, architecture, permission model, security design, testing, deployment, requirements evidence, project status, manual test cases, and security test results.
- Verification: latest frontend suite passed (9 files, 30 passed, 1 existing todo); frontend lint/type-check and production build passed. Focused DB notification tests were blocked at setup (`ECONNREFUSED 127.0.0.1:54329`; 5 skipped). Remote notification objects and access controls were verified and the migration version recorded; a signed-in live notification/browser flow remains untested. No app deployment occurred.
- Git: no commit or push was made.

- Feature/change: Human-readable admin audit activities and accurate preview/download success logging, 2026-10-20.
- Source and tests inspected: audit schema/hash chain, service functions and RLS grants, Edge Function handlers, admin audit query/UI, and DB/API/frontend tests.
- Defect found: preview/download success was logged before fetching bytes and checking size/hash; the handler also silently swallowed audit-write failures for observed events.
- Changes: added forward-only migration `20261020000300_audit_activity_details.sql`; admin query resolves actor, document, owner, affected user and permission; Edge handlers recheck access and write success only after verified byte retrieval; audit-write failures stop the response. UI narratives cover share/read/edit, preview/download, revoke, denial, upload, edit and delete. Historical success rows are not presented as confirmed deliveries.
- Documents updated: README, API, THREATS, PROMPTS, `SECURITY_AUDIT.md`, `docs/architecture.md`, `docs/security-design.md`, `docs/testing.md`, `docs/deployment.md`, `docs/PROJECT_STATUS.md`, requirements matrix, manual test case M-09 and test results.
- Verification: frontend tests 7 files / 26 passed / 1 existing todo; frontend build, frontend type-check and Edge Function type-check passed. `npm run test:db` was blocked at setup (160 skipped) and `npm run test:api` was blocked at setup (26 skipped), both due to `ECONNREFUSED 127.0.0.1:54329`. The migration and live UI have not been tested or deployed. Logs are in `evidence/test-logs/audit-activity-*.log`.
- Git: no commit or push was made. Prior unrelated uncommitted changes were preserved.

- Feature/change: Seven-area security review, SQL-like search probes, and documentation/evidence refresh, 2026-10-20.
- Source and tests reviewed: Edge identity and document handlers, SQL migrations/RLS/Storage/audit functions, recipient lookup, DB/API/frontend tests, and existing security documentation.
- Changes: added recipient lookup wildcard and SQL-like test probes; added the direct seven-requirement evidence matrix and STRIDE coverage/priorities; refreshed the audit, status ledger, prompt record, and test outcomes. No application runtime code or migration was changed in this review.
- Documents updated: `README.md`, `THREATS.md`, `PROMPTS.md`, `SECURITY_AUDIT.md`, `docs/PROJECT_STATUS.md`, `docs/requirements-evidence.md`, `docs/testing.md`, `docs/DOCUMENTATION_CHECKLIST.md`, `evidence/security-test-results.md`.
- Documents reviewed with no material behavior change: `API.md`, architecture, permission model, deployment, and security design. The API and permission contracts did not change; only regression test definitions were extended.
- Verification: frontend tests passed (6 files, 21 passed, 1 existing todo); build, frontend type-check, and Edge Function type-check passed. DB/API suites were attempted, but connection to local PostgreSQL at `127.0.0.1:54329` was refused; 159 DB tests and 25 API tests were skipped. Supabase CLI status could not inspect local services because Docker/Podman is unavailable. A read-only security-review agent reported no high-confidence vulnerability in the reviewed changes.
- Git: this review began on clean `security-hardening` at `cdf88b5`; changes remain uncommitted and were not pushed.

- Feature/change: Security-hardening review, fresh local verification and evidence, 2026-10-20.
- Source of requirements: project-owner brief in the active interaction; no separate original challenge specification was found in the repository.
- Source review: a focused read-only review found a transient account-switch display gap, fixed and regression-tested. Recipient search now supports bounded display-name/email-username suggestions at the project owner's request; this intentionally exposes matching account emails to signed-in searchers. Hosted services were not accessed.
- Code/configuration changes: corrected the Deno type-check script to use the function config; added the required upload form fields to the demo provisioner; corrected stale sign-up copy; added public-only/local `.env.example` files. `.gitignore` already excludes local env files and allows `.env.example`, so it was not changed.
- Documents/evidence updated: README, API, THREATS, PROMPTS, PROJECT_WRITEUP, AGENTS, local-development, deployment, testing, project status, `SECURITY_AUDIT.md`, requirements matrix, manual cases and test result logs.
- Tests actually run at that earlier checkpoint: frontend production build passed with the existing >500 KiB warning; frontend lint/type-check passed; frontend tests passed with 19 passed and 1 existing todo using one worker after initial worker/option failures; `npm run typecheck:functions` passed after its config fix; `node --check scripts/provision-demo.mjs` passed. The later 21-test run is recorded above and in `evidence/security-test-results.md`.
- Not run: backend DB/API/mutation suites because Bash, PostgreSQL, PostgREST and Docker were unavailable; real Auth/Storage/browser/deployment checks. No hosted project or production data was used.
- Git at that earlier checkpoint: initial `main` worktree was clean and no commit or push was made in that task. Current branch/history is recorded in the later entries above.

- Feature/change: Recipient lookup privacy restriction, 2026-10-20.
- Behavior/migration: added `20261020000100_exact_email_recipient_lookup.sql` for exact email lookup; no hosted migration was applied.
- Feature/change: Incremental recipient suggestions by display name/email username, 2026-10-20.
- Source/tests: SQL service function, existing Edge route, upload picker, DB/API/frontend regression tests.
- Behavior/migration: added `20261020000200_recipient_name_and_username_search.sql`; query begins at three characters, is debounced, matches display names, email usernames and full emails, is audited/rate-limited, capped at 20, and shows email for confirmation. No hosted migration was applied.
- Documentation: README, API, threat model, security design, architecture, permission model, deployment, testing, requirements matrix, and audit/evidence records updated.
- Verification: frontend suite passed (6 files, 21 tests, 1 existing todo); build, frontend type-check and Edge Function type-check passed. DB/API suites could not connect to PostgreSQL at `127.0.0.1:54329`.

- Feature/change: Documentation audit and submission write-up update, 2026-10-19.
- Source and tests inspected: migrations 0100–0900, RLS/Storage policy, all Edge Function handlers, frontend permission flows, DB/API/frontend tests, scripts and project configuration.
- Documents updated: README, THREATS, PROMPTS, API, AGENTS, PROJECT_WRITEUP and all required architecture/permission/security/testing/deployment/local-development docs. This checklist added.
- Documents reviewed but not changed: unrelated application code; implementation was not part of this docs-only task.
- Tests actually run: `npm --prefix frontend run build` passed with existing chunk-size warning; `npm --prefix frontend test` passed 18 tests with 1 existing todo; Deno check passed. Full backend suite was not run.
- Deployment state checked: linked Supabase project migration list showed 0100–0800 applied and 0900 pending; nine functions active; CORS preflight from localhost:5176 returned 204. No authenticated end-to-end operation was tested.
- Unknown information left pending: full 0900 backend regression run and hosted apply, real Storage verification, browser E2E, Git commits/links, and original AI prompt transcripts for earlier recorded work.