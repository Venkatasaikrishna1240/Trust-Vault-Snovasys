# Project status and verification ledger

Last reviewed: **2026-10-20**. This is a local source and test report, not a production security certification. Fresh command results are in `evidence/security-test-results.md`.

## Implemented in source

- React/Vite/TypeScript application with Supabase Auth, document upload, search, sharing, history, and admin pages.
- RLS-protected reads and nine Edge Functions backed by service-role-only `svc_*` operations.
- Private Storage bucket, upload validation, document hashing, access checks, and audit events.
- Migrations 0100–0900, including signed-in global visibility, upload-time sharing, and editor historical downloads, plus the exact-email lookup migration below.
- Migration `20261020000100_exact_email_recipient_lookup.sql` restricts the sharing lookup to a complete email address; it has not been applied to a hosted project.
- Demo provisioning now includes the required upload fields. Its network workflow has not been exercised in a disposable Supabase project.

## Fresh checks run on 2026-10-20

- `npm --prefix frontend run build`: passed; Vite reported a JavaScript chunk over 500 KiB.
- `npm --prefix frontend run lint`: passed (`tsc --noEmit`).
- `npm --prefix frontend test -- --pool=threads --maxWorkers=1`: 5 files passed, 20 tests passed, 1 existing todo. The initial default worker run timed out starting workers; the constrained rerun completed.
- `npm run typecheck:functions`: passed after the script was corrected to use `supabase/functions/deno.json`. Before that change, the script failed because it did not load the Deno project's dependency configuration.
- `node --check scripts/provision-demo.mjs`: passed; this checks syntax only, not requests against Supabase.
- Initial Git worktree was clean on `main`. Work is on local branch `security-hardening`; no commit was created.
- A read-only static review found a transient cross-account display gap during direct A→B session replacement. The auth context now clears the old profile and gates protected content until B's profile loads; a regression test covers the transition. The review also found partial recipient search exposed matching accounts. The new migration and UI restrict this to exact email lookup; exact-address account confirmation remains possible. Backend tests for the migration/API change have not been run here.

## Not run or not established

- DB and API suites were attempted but could not connect to PostgreSQL at `127.0.0.1:54329`; their test bodies were skipped. The mutation suite remains unrun because the backend harness is unavailable.
- The frontend test harness and static review do not exercise real Supabase Auth or the actual Storage API.
- No real signed-in browser account-switch run, live Storage denial, hosted API test, deployment, migration, or production operation was performed. The account-switch regression test is frontend-mocked.
- The previous hosted CLI notes (2026-10-19) reported migrations 0100–0800 and nine functions active, with 0900 pending. That information was not refreshed; do not infer current deployment state from it.
- Historical backend pass counts in older repository documents are not fresh evidence for the current migration set.
- One frontend test remains marked `todo`; Deno has no separate unit-test suite; Vite reports a large chunk.
- Historical AI prompt summaries are in Git history, but original transcripts and independent proof of their reported tests are not.

Check the target project and run the backend and live integration procedures before claiming those behaviors are verified. Do not use production data for tests.
