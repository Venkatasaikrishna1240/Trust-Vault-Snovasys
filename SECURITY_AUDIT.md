# TrustVault security audit

**Review date:** 2026-10-20  
**Review type:** read-only static review of the repository snapshot; no production access and no code-diff review (the branch started with no changes relative to `main`).

## Conclusion

The broad read-only review initially reported no confirmed exploitable vulnerability. A focused follow-up found a transient private-data display gap during direct account replacement (A→B); it is fixed in this worktree and covered by a frontend regression test. The follow-up also found that partial recipient searches exposed matching account details. The lookup now requires a complete exact email address, with frontend, API, and database regression tests added. A caller who already knows an exact address can still confirm whether it is registered. This is not a security certification: the DB/API suites have not run in this environment, and no hosted Supabase service or real browser session was exercised. See `evidence/security-test-results.md` for commands actually run and `docs/requirements-evidence.md` for requirement-level status.

The reviewed boundary includes:

- Auth token verification and actor derivation in `supabase/functions/_shared/core.ts`, plus gateway configuration in `supabase/config.toml`.
- Document operations in `supabase/functions/_shared/handlers.ts` and the corresponding SQL service functions.
- RLS/privilege rules in `supabase/migrations/20261018000400_rls_and_privileges.sql`, access helpers in `20261018000200_access_helpers.sql`, and the private Storage policy in `20261018000600_storage_bucket.sql`.
- Audit-chain implementation in `20261018000300_audit_trail.sql` and role/audit service functions in `20261018000500_service_functions.sql`.
- Frontend auth/API/data services and the DB/API security test definitions.

## Security findings

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟡 MEDIUM | `frontend/src/features/auth/AuthContext.tsx` | 33–45 | A direct A→B session replacement could briefly leave A's profile and private page mounted under B's session before the profile-loading gate ran. Fixed by clearing the prior profile and enabling the gate before applying a changed user session; `frontend/src/tests/authContext.test.tsx` covers the transition. | 9/10 |
| 2 | ⚪ LOW | `supabase/migrations/20261020000100_exact_email_recipient_lookup.sql` | 4–49 | The prior partial-name/email lookup exposed a searchable account directory. Fixed in source by case-insensitive exact email matching and full-email UI validation; regression tests cover partial queries and exact matches. Exact-address account confirmation remains possible. | 10/10 |

The medium issue is fixed in the current working tree. The low-severity directory exposure is narrowed to exact-email lookup, retaining sharing by registered email while preventing partial-name and prefix enumeration. The function remains rate-limited and audited. No other exploitable vulnerability was confirmed by static review.

## Limits and residual risks

- Source and tests do not prove hosted state. The deployed Auth settings, policies, function versions, allowed origins, and secrets were not checked.
- A pattern scan of tracked working-tree files and Git-reachable blobs found no recognizable Supabase service-role/secret values. This does not cover untracked files, unreachable Git objects, or credentials that are encoded/split or do not match known formats.
- The DB/API tests use a local harness; they do not emulate GoTrue or the actual Supabase Storage API. This environment lacked Bash, PostgreSQL, PostgREST, and Docker, so those tests were not run.
- An authorized request already in progress at revocation may complete. A user can retain bytes already previewed, downloaded, copied, or captured.
- Exact-email recipient lookup can confirm whether a known address is registered; this is also inherent in granting access by email. Backend regression tests have been added but were not executable in this environment.
- The audit hash chain is tamper-evident for ordinary row-level changes, not tamper-proof against a database owner who can rewrite the events and recompute the chain.
- No antivirus/content disarm, mandatory MFA, independent audit-head storage, backup-retention verification, or browser E2E suite is established by this repository.

No database, hosted project, production data, or deployment was changed during this review.
