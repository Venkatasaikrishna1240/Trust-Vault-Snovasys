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

- Feature/change: Documentation audit and submission write-up update, 2026-10-19.
- Source and tests inspected: migrations 0100–0900, RLS/Storage policy, all Edge Function handlers, frontend permission flows, DB/API/frontend tests, scripts and project configuration.
- Documents updated: README, THREATS, PROMPTS, API, AGENTS, PROJECT_WRITEUP and all required architecture/permission/security/testing/deployment/local-development docs. This checklist added.
- Documents reviewed but not changed: unrelated application code; implementation was not part of this docs-only task.
- Tests actually run: `npm --prefix frontend run build` passed with existing chunk-size warning; `npm --prefix frontend test` passed 18 tests with 1 existing todo; Deno check passed. Full backend suite was not run.
- Deployment state checked: linked Supabase project migration list showed 0100–0800 applied and 0900 pending; nine functions active; CORS preflight from localhost:5176 returned 204. No authenticated end-to-end operation was tested.
- Unknown information left pending: full 0900 backend regression run and hosted apply, real Storage verification, browser E2E, Git commits/links, and original AI prompt transcripts for earlier recorded work.