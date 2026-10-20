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

- Feature/change: Security-hardening review, fresh local verification and evidence, 2026-10-20.
- Source of requirements: project-owner brief in the active interaction; no separate original challenge specification was found in the repository.
- Source review: a focused read-only review found a transient account-switch display gap, fixed and regression-tested. Recipient search now supports bounded display-name/email-username suggestions at the project owner's request; this intentionally exposes matching account emails to signed-in searchers. Hosted services were not accessed.
- Code/configuration changes: corrected the Deno type-check script to use the function config; added the required upload form fields to the demo provisioner; corrected stale sign-up copy; added public-only/local `.env.example` files. `.gitignore` already excludes local env files and allows `.env.example`, so it was not changed.
- Documents/evidence updated: README, API, THREATS, PROMPTS, PROJECT_WRITEUP, AGENTS, local-development, deployment, testing, project status, `SECURITY_AUDIT.md`, requirements matrix, manual cases and test result logs.
- Tests actually run: frontend production build passed with the existing >500 KiB warning; frontend lint/type-check passed; frontend tests passed with 19 passed and 1 existing todo using one worker after initial worker/option failures; `npm run typecheck:functions` passed after its config fix; `node --check scripts/provision-demo.mjs` passed. Exact logs are in `evidence/test-logs/`.
- Not run: backend DB/API/mutation suites because Bash, PostgreSQL, PostgREST and Docker were unavailable; real Auth/Storage/browser/deployment checks. No hosted project or production data was used.
- Git: initial `main` worktree was clean; current branch is `security-hardening`; no commit or push was made.

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