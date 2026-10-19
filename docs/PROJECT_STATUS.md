# Project status and verification ledger

Last reviewed: **2026-10-19**. Source review is not a production security certification. Status below is based on actual commands/results available in this workspace and linked Supabase CLI output.

## Implemented in source

- React/Vite/TypeScript app with authentication, dashboard, document search/details, upload, sharing/history, admin users and audit pages.
- RLS-protected Data API reads; write/file routes through nine Edge Functions and service-role-only `svc_*` DB operations.
- Private Storage, validation/hash checking, audited upload/replace/preview/download/delete/sharing/admin actions.
- Migrations 0100–0900 in local source, including global signed-in visibility, upload-time recipients, and editor historical downloads (0900).

## Checks actually run in this workspace

- `npm --prefix frontend run build`: passed on 2026-10-19 after editor history UI work; Vite emitted a chunk-size warning (>500 KiB).
- `npm --prefix frontend test`: passed on 2026-10-19 after editor history UI work: 4 files, 18 tests passed, 1 todo.
- Deno check: `deno check --config supabase/functions/deno.json supabase/functions/*/index.ts supabase/functions/_shared/*.ts` passed on 2026-10-19.
- Hosted CLI inspection: linked project `twyfmmtzbcjwlkfwwijm`; migrations 0100–0800 recorded, 0900 not recorded/pending; nine functions reported active at inspection time. Earlier five-function localhost preflight check returned 204 for local port 5176, but it did not test authenticated actions or actual file bytes.
- Migration 0900 and updated DB/API tests were added after the observed hosted migration list. **Do not state migration 0900 is deployed.**

## Historical evidence (not rerun for current source)

Repository notes report earlier baseline results of 156 DB tests, 22 HTTP tests, and a passing mutation test; these are historical results for an earlier snapshot, not a full run after migrations 0700–0900. The test harness uses a Supabase SQL shim and in-memory storage and does not prove actual Auth/Storage API behavior. See `docs/testing.md`.

## Not established / outstanding

- Full DB/API test suites against the latest migrations, especially 0900.
- Hosted migration 0900 applied and verified.
- Signed-in browser smoke test for upload/share/revoke/admin role/audit and editor historical download.
- Real hosted Storage direct-client denial and byte round-trip.
- Playwright E2E, backup/retention checks, deployment on Vercel, clean-clone setup validation.
- Deno unit tests (`npm run test:functions` is only a placeholder).
- Git history/commit links: workspace has no `.git` directory. AI prompt records cannot be tied to commits.
- Frontend bundle splitting; Vite warns the built JS chunk exceeds 500 KiB.
- One frontend component case is intentionally `it.todo` due to a test-runner unhandled mocked rejection issue.

Before presenting a capability as live, verify the specific deployment project's migration list and function versions, then record exact test commands/results here.
