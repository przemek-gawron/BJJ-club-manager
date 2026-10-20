#!/usr/bin/env bash
# Sprawdza polityki RLS na czysto przebudowanej bazie.
# Wymaga działającej bazy testowej — odpal najpierw supabase/test/rebuild.sh.
#
# Uwaga: uruchamiamy jako postgres, ale rls.sql sam schodzi do roli `authenticated`.
# Nie da się tego testować jako właściciel tabel, bo właściciel omija RLS.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@17/bin}"
DB="${DB:-bjjtest}"

out=$("$PGBIN/psql" -h /tmp -p "${PGPORT:-54329}" -U postgres -d "$DB" \
  -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/test/rls.sql" 2>&1)
code=$?

printf '%s\n' "$out" | grep -Evi "^(psql:.*NOTICE|SET|DO|SELECT|GRANT|CREATE|ALTER)" || true

if [ "$code" -ne 0 ]; then
  echo "RLS: FAIL"
  exit 1
fi
echo "RLS: ok"
