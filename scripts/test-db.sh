#!/usr/bin/env bash
# Runs the pgTAP suites in supabase/tests against a throwaway local Postgres cluster.
# No Docker needed. See supabase/tests/_supabase_shim.sql for what stands in for Supabase.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Locate Postgres binaries.
BINDIR=""
if command -v pg_config >/dev/null 2>&1; then
  BINDIR="$(pg_config --bindir 2>/dev/null || true)"
fi
if [ -z "$BINDIR" ] || [ ! -x "$BINDIR/initdb" ]; then
  BINDIR="/usr/lib/postgresql/16/bin"
fi
if [ ! -x "$BINDIR/initdb" ]; then
  echo "test-db: could not find Postgres binaries (looked in pg_config --bindir and /usr/lib/postgresql/16/bin)" >&2
  exit 2
fi
if ! command -v pg_prove >/dev/null 2>&1; then
  echo "test-db: pg_prove not found (install pgTAP's pg_prove, e.g. apt install pgtap libtap-parser-sourcehandler-pgtap-perl)" >&2
  exit 2
fi
export PATH="$BINDIR:$PATH"

# Postgres refuses to run as root: run the server-side tools as the `postgres` OS user.
RUN=()
if [ "$(id -u)" = "0" ]; then
  RUN=(runuser -u postgres --)
fi

# Short path under /tmp so the Unix socket path stays below the ~100 char limit.
WORK="$(mktemp -d /tmp/fragrance-db.XXXXXX)"
DATA="$WORK/data"
SOCK="$WORK/sock"
PORT="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();})')"

cleanup() {
  local status=$?
  if [ -f "$DATA/postmaster.pid" ]; then
    "${RUN[@]}" pg_ctl -D "$DATA" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
  exit $status
}
trap cleanup EXIT INT TERM

if [ "${#RUN[@]}" -gt 0 ]; then chown postgres "$WORK"; fi
"${RUN[@]}" mkdir "$SOCK"

# UTF-8 with a real ctype so lower()/unaccent behave on non-ASCII text.
"${RUN[@]}" initdb -D "$DATA" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >"$WORK/initdb.log" 2>&1 \
  || { cat "$WORK/initdb.log" >&2; exit 2; }

"${RUN[@]}" pg_ctl -D "$DATA" -l "$WORK/postgres.log" -w \
  -o "-k $SOCK -p $PORT -c listen_addresses= -c fsync=off" start >/dev/null \
  || { cat "$WORK/postgres.log" >&2; exit 2; }

export PGHOST="$SOCK" PGPORT="$PORT" PGUSER=postgres
DB=fragrance_test
psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "create database $DB" >/dev/null
export PGDATABASE="$DB"

load() {
  echo "test-db: loading ${1#"$ROOT"/}"
  psql -X -q -v ON_ERROR_STOP=1 -f "$1" >/dev/null
}

load "$ROOT/supabase/tests/_supabase_shim.sql"
shopt -s nullglob
for f in "$ROOT"/supabase/migrations/*.sql; do load "$f"; done
if [ -f "$ROOT/supabase/seed.sql" ]; then load "$ROOT/supabase/seed.sql"; fi

pg_prove "$ROOT"/supabase/tests/*.test.sql
