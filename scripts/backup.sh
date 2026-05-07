#!/usr/bin/env bash
# Postgres backup helper.
#
# Usage:
#   ./scripts/backup.sh                      # writes to ./backups/cheatsheet-<ts>.dump
#   BACKUP_DIR=/var/backups ./scripts/backup.sh
#   ./scripts/restore.sh ./backups/foo.dump  # see restore.sh for restoration
#
# The script is intentionally simple — no S3 upload, no encryption, no
# scheduling. For real production:
#   1. Run from cron or systemd-timer (recommended: hourly + daily +
#      weekly with pruning).
#   2. Encrypt dumps before uploading off-host (e.g. `age` or PGP).
#   3. Verify dumps periodically by restoring into a throwaway DB.
#
# Reads DATABASE_URL from the environment. Falls back to the local
# docker-compose default for convenience.

set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgresql://cheatsheet:cheatsheet@localhost:5432/cheatsheet}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"

OUT="$BACKUP_DIR/cheatsheet-$TS.dump"

# `-Fc` = custom format (compressed, restorable with pg_restore).
# `--no-owner --no-privileges` keeps the dump portable across DB users.
pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$OUT"

echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
