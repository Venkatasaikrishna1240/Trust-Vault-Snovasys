#!/usr/bin/env bash
# Mutation test for the critical authorisation path: temporarily make app.access_level() grant
# 'owner' to everybody, then confirm the negative tests FAIL. Restores the real function afterwards.
set -uo pipefail
cd "$(dirname "$0")/.."
export TV_JWT_SECRET="test-only-jwt-secret-0123456789abcdef0123456789"
PGRST="${TV_POSTGREST_BIN:-postgrest}"; DENO="${TV_DENO:-deno}"
bash supabase/tests/harness/pg-local.sh reset >/dev/null
"$PGRST" supabase/tests/harness/postgrest.conf >/tmp/tv-postgrest.log 2>&1 & P1=$!
"$DENO" run -A --node-modules-dir=none supabase/tests/harness/serve.ts >/tmp/tv-harness.log 2>&1 & P2=$!
trap 'kill $P1 $P2 2>/dev/null || true; bash supabase/tests/harness/pg-local.sh stop >/dev/null 2>&1 || true' EXIT
for i in $(seq 1 40); do curl -sf -o /dev/null http://127.0.0.1:54331/rest/v1/ 2>/dev/null && break; sleep 0.5; done
T="npx vitest run --config supabase/tests/vitest.config.ts"
echo "== baseline (expect PASS)"; $T supabase/tests/api 2>&1 | grep -E "Tests "
PSQL="bash supabase/tests/harness/pg-local.sh psql -q"
$PSQL -c "create or replace function app.access_level(p_actor uuid, p_doc uuid) returns text language sql stable security definer set search_path='' as \$\$ select case when exists(select 1 from public.documents d where d.id=p_doc and d.deleted_at is null) then 'owner' end \$\$;"
echo "== MUTANT: access_level always 'owner' (expect FAIL)"; $T supabase/tests/api supabase/tests/db/svc.test.ts 2>&1 | grep -E "Tests |Test Files"
# restore the real implementation from the migration
bash supabase/tests/harness/pg-local.sh reset >/dev/null 2>&1 || true
echo "== restored from migrations (database rebuilt)"
