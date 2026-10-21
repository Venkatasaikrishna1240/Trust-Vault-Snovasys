#!/usr/bin/env bash
# =====================================================================
# Docker-free local database for TrustVault tests.
#
#   ./pg-local.sh reset    # (re)create a throw-away PostgreSQL 16 cluster,
#                          # apply the Supabase shim + ALL migrations
#   ./pg-local.sh start|stop|status
#   ./pg-local.sh psql [args]    # superuser psql into the test database
#
# Requires PostgreSQL 16 server binaries (e.g. Ubuntu: apt install postgresql-16).
# This is a TEST HARNESS: on a normal laptop use `supabase start` instead (see
# docs/local-development.md). The harness exists so the RLS / privilege /
# audit tests can run anywhere there is a Postgres server.
#
# Env overrides: TV_PG_BIN, TV_PG_PORT, TV_PG_DATA
# =====================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PG_BIN="${TV_PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${TV_PG_PORT:-54329}"
DATA="${TV_PG_DATA:-/tmp/trustvault-pgdata}"
DB="trustvault_test"

# PostgreSQL refuses to run as root; hop to the 'postgres' OS user if needed.
as_pg() {
  if [ "$(id -u)" -eq 0 ]; then
    runuser -u postgres -- "$@"
  else
    "$@"
  fi
}

psql_su() { as_pg "$PG_BIN/psql" -h /tmp -p "$PORT" -U postgres -v ON_ERROR_STOP=1 "$@"; }

cmd="${1:-status}"; shift || true

case "$cmd" in
  stop)
    as_pg "$PG_BIN/pg_ctl" -D "$DATA" -m fast stop || true
    ;;
  start)
    as_pg "$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$DATA/server.log" -w start
    ;;
  status)
    as_pg "$PG_BIN/pg_ctl" -D "$DATA" status || true
    ;;
  psql)
    psql_su -d "$DB" "$@"
    ;;
  reset)
    as_pg "$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$DATA"
    mkdir -p "$DATA"
    [ "$(id -u)" -eq 0 ] && chown postgres:postgres "$DATA"
    as_pg "$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 >/dev/null
    as_pg "$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" \
      -l "$DATA/server.log" -w start >/dev/null
    psql_su -d postgres -c "create database $DB" >/dev/null
    psql_su -d "$DB" -q -f "$ROOT/supabase/tests/support/supabase_shim.sql"
    for f in "$ROOT"/supabase/migrations/*.sql; do
      echo "applying $(basename "$f")"
      psql_su -d "$DB" -q -f "$f"
    done
    psql_su -d "$DB" -q -f "$ROOT/supabase/tests/support/harness_auth_admin.sql"
    echo "OK: $DB ready on 127.0.0.1:$PORT (superuser: postgres, no password)"
    ;;
  *)
    echo "usage: $0 reset|start|stop|status|psql" >&2
    exit 2
    ;;
esac
