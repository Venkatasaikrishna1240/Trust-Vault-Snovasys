# THREATS (status: FIXED = mitigated + automated test; PARTIAL; ACCEPTED)
| Threat | Mitigation (location) | Test | Residual | Status |
|---|---|---|---|---|
| IDOR / guessed ids | `app.access_level` in RLS + svc_*; uniform 404 | db/rls, db/svc, api cross-user | timing side channels | FIXED |
| Broken function-level authz | per-op required level in `app.authorize_or_deny`; svc_* service-role only | svc.test, rls "function exposure", api | — | FIXED |
| Privilege escalation | role only in `profiles`; column grants + guard trigger; admin can't self/admin/create admin | rls "privilege escalation", svc admin, api | superuser/SQL access | FIXED |
| Stale access after revoke | no signed URLs; decision per request (0500) | svc, audit "exactly when", api revocation | request authorised before revoke commits may finish (in-flight); downloaded copies can't be recalled | PARTIAL (inherent) |
| Direct Storage bypass | private bucket + restrictive deny policy (0600) | rls Storage tests (SQL level) | Real Storage API **not** tested here | PARTIAL |
| Unintended global publication | default-private `is_global`; owner-only audited switch; authenticated users only; private Storage stays closed | db/rls + api/security visibility tests | a published document is visible to every signed-in account by design | FIXED (opt-in) |
| Copying from read-only preview | separate read-authorized inline preview; attachment endpoint requires edit | api/security preview/download tests | browser bytes can still be saved, screenshotted, or recorded | PARTIAL (inherent) |
| Historical data disclosure | older versions are downloadable only by owners and active edit-grantees; each request is reauthorized/audited; read grants remain blocked | svc/API version-history tests | an editor can retain copies obtained before revocation | FIXED (inherent copy residual) |
| Upload authorization bypass | verified account must have a current profile; owner identity comes from verified token; content and key independently validated | svc/API upload tests | account registration is open per Auth configuration | FIXED |
| Audit tampering | append-only triggers, no write grants, hash chain (0300) | audit.test | DB owner can rewrite & recompute chain (test documents this); mitigate by exporting head hash | PARTIAL |
| Forged audit actor | only `app.write_audit`; `svc_record_event` allow-list; actor from token | svc, rls, api | compromised service key | FIXED |
| Malicious uploads | allowlist, magic bytes+terminator, ext/MIME match, size cap, server keys, nosniff/CSP on download | api upload validation | no antivirus; polyglots possible | PARTIAL |
| Search/metadata leakage | invoker fn + RLS + explicit predicate; LIKE escaped; uniform errors; recipient lookup requires 3 chars, returns ≤20, audited and rate-limited | rls search, api | authenticated users can search registered names/e-mails to share documents | ACCEPTED (feature) |
| Token misuse / XSS | getUser each request; React escapes; CSP in `frontend/vercel.json` | frontend tests (text-only rendering) | tokens in browser storage (supabase-js default) | PARTIAL |
| CSRF | bearer-token header auth, no cookies | n/a | — | FIXED (N/A) |
| CORS | explicit allow-list, no `*` | api auth tests | must set `ALLOWED_ORIGINS` in prod | FIXED |
| Rate limit / DoS | 30 denied/min throttle; body caps; lock_timeout | svc throttle test | no global limiter; rely on platform limits; unauthenticated floods bounded by verify_jwt | PARTIAL |
| Races grant/revoke/download | row lock + re-check under lock | audit concurrency tests | in-flight window | PARTIAL |
| Audit write failure | svc raises ⇒ 5xx, no bytes | svc fail-closed, api fail-closed | availability loss (intended) | FIXED |
| Secret leakage | service key only in function env; `.gitignore`; audit detail key blocklist | svc details test | manual hygiene | PARTIAL |
| DB/admin compromise | out of scope | — | total | ACCEPTED |
| Backups/retention | deleted files purged from Storage; metadata tombstone kept; **backups not managed** | api delete | provider backups retain data | ACCEPTED |
