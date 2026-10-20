# TrustVault security audit

**Review date:** 2026-10-20  
**Review type:** read-only static review of the repository snapshot; no production access and no code-diff review (the branch started with no changes relative to `main`).

## Conclusion

The broad read-only review initially reported no confirmed exploitable vulnerability. A focused follow-up found a transient private-data display gap during direct account replacement (A→B); it is fixed in this worktree and covered by a frontend regression test. The review also identified recipient directory disclosure from partial searches. The product's sharing workflow now intentionally supports suggestions by display name or email username; this is bounded, rate-limited, and audited, but still exposes matching email addresses to authenticated users. This residual trade-off is documented below. This is not a security certification: the DB/API suites have not run in this environment, and no hosted Supabase service or real browser session was exercised. See `evidence/security-test-results.md` for commands actually run and `docs/requirements-evidence.md` for requirement-level status.

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
| 2 | ⚪ LOW | `supabase/migrations/20261020000200_recipient_name_and_username_search.sql` | 3–55 | Recipient suggestions disclose up to 20 matching registered profile emails to authenticated users searching display names or email usernames. Minimum query length, result cap, rate limit, and audit reduce bulk enumeration but do not eliminate this intentional privacy trade-off. | 10/10 |

The medium issue is fixed in the current working tree. The low-severity recipient discovery exposure remains as an intentional sharing feature: results are bounded, rate-limited, and audited, but authenticated users can discover matching emails. No other exploitable vulnerability was confirmed by static review.

## Limits and residual risks

- Source and tests do not prove hosted state. The deployed Auth settings, policies, function versions, allowed origins, and secrets were not checked.
- A pattern scan of tracked working-tree files and Git-reachable blobs found no recognizable Supabase service-role/secret values. This does not cover untracked files, unreachable Git objects, or credentials that are encoded/split or do not match known formats.
- The DB/API tests use a local harness; they do not emulate GoTrue or the actual Supabase Storage API. This environment lacked Bash, PostgreSQL, PostgREST, and Docker, so those tests were not run.
- An authorized request already in progress at revocation may complete. A user can retain bytes already previewed, downloaded, copied, or captured.
- Recipient lookup allows discovery of matching account emails by name or email username. The project owner requested this UX; the 3-character threshold, 20-result limit, audit, and per-user rate limit reduce but cannot prevent enumeration. Backend regression tests have been added but were not executable in this environment.
- The audit hash chain is tamper-evident for ordinary row-level changes, not tamper-proof against a database owner who can rewrite the events and recompute the chain.
- No antivirus/content disarm, mandatory MFA, independent audit-head storage, backup-retention verification, or browser E2E suite is established by this repository.

No database, hosted project, production data, or deployment was changed during this review.
