#!/usr/bin/env bash
# Przebudowuje czystą bazę na lokalnym Postgresie i nakłada shim + migracje + seed.
# Wymaga: PostgreSQL 17 z Homebrew oraz uruchomionego serwera na porcie 54329.
#   /opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /tmp/pgdata \
#     -o "-p 54329 -k /tmp -c listen_addresses=''" -l /tmp/pg.log start
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@17/bin}"
DB="${DB:-bjjtest}"
# -1: całość w jednej transakcji — błąd w środku nie zostawia połowicznie zapełnionej bazy.
psql_run() { "$PGBIN/psql" -h /tmp -p "${PGPORT:-54329}" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -1 "$@"; }

"$PGBIN/psql" -h /tmp -p "${PGPORT:-54329}" -U postgres -q \
  -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1

apply_file() { # plik — sukces = kod wyjścia psql (nie pusta odpowiedź: seed coś wypisuje)
  local f="$1" out
  out=$(psql_run -f "$f" 2>&1)
  local code=$?
  local errors
  errors=$(printf '%s\n' "$out" | grep -Ei "^psql:.*(ERROR|FATAL)" || true)
  if [ "$code" -ne 0 ] || [ -n "$errors" ]; then
    echo "FAIL $(basename "$f")"
    printf '%s\n' "${errors:-$out}" | head -6
    return 1
  fi
  return 0
}

status=0
for f in "$ROOT/supabase/test/00-supabase-shim.sql" "$ROOT"/supabase/migrations/*.sql; do
  apply_file "$f" || status=1
done
[ "$status" -eq 0 ] && echo "migracje: ok"

if [ "${WITH_SEED:-1}" = "1" ]; then
  if apply_file "$ROOT/supabase/seed.sql"; then echo "seed: ok"; else status=1; fi
fi

exit "$status"
