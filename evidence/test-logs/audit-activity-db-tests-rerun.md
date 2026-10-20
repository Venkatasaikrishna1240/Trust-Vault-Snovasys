# Database audit test rerun

- Command: `npm run test:db`
- Result: **BLOCKED**, exit code 1
- Environment error: `connect ECONNREFUSED 127.0.0.1:54329`
- Test cases: 161 skipped; none executed
- Suites: 3 failed during fixture setup
- Run time shown by Vitest: 2026-10-20 16:54:55

The database was unavailable, so this run does not verify migration syntax, SQL behavior, or the new audit filename-history assertion.
