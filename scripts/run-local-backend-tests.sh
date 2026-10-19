#!/usr/bin/env bash
# Docker-free backend test run: Postgres 16 + PostgREST + Deno harness. Needs: postgresql-16 server,
# a `postgrest` binary (TV_POSTGREST_BIN), and deno (TV_DENO). See docs/testing.md.
set -euo pipefail
cd "$(dirname "$0")/.."
export TV_JWT_SECRET="test-only-jwt-secret-0123456789abcdef0123456789"
PGRST="${TV_POSTGREST_BIN:-postgrest}"; DENO="${TV_DENO:-deno}"
bash supabase/tests/harness/pg-local.sh reset >/dev/null
"$PGRST" supabase/tests/harness/postgrest.conf >/tmp/tv-postgrest.log 2>&1 & P1=$!
"$DENO" run -A --node-modules-dir=none supabase/tests/harness/serve.ts >/tmp/tv-harness.log 2>&1 & P2=$!
trap 'kill $P1 $P2 2>/dev/null || true; bash supabase/tests/harness/pg-local.sh stop >/dev/null 2>&1 || true' EXIT
for i in $(seq 1 40); do curl -sf -o /dev/null http://127.0.0.1:54331/rest/v1/ 2>/dev/null && break; sleep 0.5; done
npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/db supabase/tests/api
