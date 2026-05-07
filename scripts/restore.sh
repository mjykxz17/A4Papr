#!/usr/bin/env bash
# Restore a backup produced by `scripts/backup.sh`.
#
# Usage:
#   ./scripts/restore.sh path/to/cheatsheet-<ts>.dump
#
# Refuses to run unless the target DB is empty (no rows in any of our
# tables) so an accidental restore can't clobber a populated production
# DB. Override with `FORCE=1` if you really know what you're doing.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <dump-file>"
  exit 64
fi

DUMP="$1"
DATABASE_URL="${DATABASE_URL:-postgresql://cheatsheet:cheatsheet@localhost:5432/cheatsheet}"

if [[ ! -f "$DUMP" ]]; then
  echo "no such file: $DUMP" >&2
  exit 1
fi

if [[ "${FORCE:-0}" != "1" ]]; then
  rows="$(psql "$DATABASE_URL" -tAc \
    "SELECT (SELECT COUNT(*) FROM cheatsheets) + (SELECT COUNT(*) FROM blocks)" \
    2>/dev/null || echo 0)"
  if [[ "$rows" -gt 0 ]]; then
    echo "refusing to restore: target DB already has data ($rows rows)." >&2
    echo "set FORCE=1 to override." >&2
    exit 1
  fi
fi

pg_restore \
  --dbname="$DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --clean --if-exists \
  "$DUMP"

echo "restored from $DUMP"
