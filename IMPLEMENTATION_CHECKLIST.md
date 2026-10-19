# Checklist (✔ = evidence exists; ✘ = not done/not verified)
✔ Auth via Supabase Auth, verified per request (code; real Auth server ✘ not run) · ✔ Roles/permissions documented & enforced (db tests) · ✔ Upload validation (api tests)
✔ Private bucket + restrictive Storage policy (SQL-level tests) · ✘ real Storage API test · ✔ RLS enabled & tested (93 tests) · ✔ Read/edit grants, grant/revoke · ✔ Unauthorised access denied, no metadata
✔ Immediate revocation for next request (db+api tests) · ✔ success+denied audited · ✔ users can't alter audit (db+api) · ✔ search doesn't leak · ✔ admin audit dashboard (UI built; **not browser-tested**)
✔ Security tests run (178 backend) · ✔ mutation test · ✔ frontend builds (17 tests + 1 todo) · ✘ Playwright E2E · ✘ live `supabase start` run · ✘ seed.sql / provision-demo execution · ✘ deployment · ✘ clean-clone on another machine · ✘ demo video (record separately)
