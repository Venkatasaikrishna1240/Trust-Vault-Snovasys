# Implementation and verification status

Source implementation and test definitions are not equivalent to runtime verification. Current results are recorded in `evidence/security-test-results.md`; no production or hosted service was changed.

## Source present; runtime boundary not verified

- Supabase Auth session handling, route guards, Edge token verification, RLS policies, role/grant checks, private Storage policy, upload validation, audit chain, and document/admin UI are implemented in source.
- DB/API tests define negative cases for auth, RLS, IDOR, grants/revocation, upload validation, audit behavior, Storage policy, and admin restrictions. They did not execute in the current environment.
- Admins can change another non-admin between `owner` and `viewer`, search the user list by name/email, and use the implemented deactivate/reactivate and guarded removal workflow. Offboarding migration/API behavior and real Auth Admin integration remain unverified; ownership transfer is not implemented. Self-service password reset and app-level MFA are not implemented.

## Checks completed on 2026-10-21

- Frontend production build and TypeScript check: PASS; Vite reports one minified chunk above 500 KiB.
- Frontend tests: the full offboarding-check rerun passed (10 files, 38 passed, 1 existing todo). This preceded the later Users & Roles search UI change; only `npm --prefix frontend run lint` was rerun after that change.
- Edge Function Deno type-check: PASS.
- Frontend and root npm dependency audits: zero known vulnerabilities reported.
- Local unauthenticated browser smoke: login page, empty signup validation, protected deep-link redirect, and a 390px login viewport were checked with dummy Supabase settings. This did not exercise any signed-in workflow.
- Static Vercel configuration check: JSON parses; SPA rewrite and `frame-src 'self' blob:` are present.

## Not run or blocked

- DB suite: BLOCKED at setup; all 166 tests skipped because `127.0.0.1:54329` refused the connection.
- API suite: BLOCKED at setup; all 26 tests skipped for the same reason.
- Mutation test: NOT RUN; it resets the disposable backend and the required test services are unavailable.
- Real Supabase Auth, RLS, Storage direct-denial, isolated Admin/Owner A/Owner B/Viewer workflows, notification delivery, live Vercel headers/PDF rendering, and deployment: NOT TESTED.
- No automated Playwright E2E suite, `supabase start`, seed/provisioning run, clean-clone test, demo video, migration application, push, or deployment was performed.
