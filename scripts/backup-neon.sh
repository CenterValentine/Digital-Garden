#!/usr/bin/env bash
# Owner-run production database backup.
#
# Dumps the prod Neon database to a timestamped file OUTSIDE the repo
# (~/Backups/digital-garden by default — `backups/` is NOT gitignored, so
# never write dumps into the working tree).
#
# Why the UNPOOLED url: pg_dump cannot run through PgBouncer. Neon's pooled
# endpoint (`DATABASE_URL`) silently produces broken or partial dumps; the
# direct endpoint (`DATABASE_URL_UNPOOLED`) is the only safe source.
#
# Why --no-owner --no-acl: Neon owns its objects with Neon-specific roles.
# Without these the dump only restores onto Neon. With them it restores onto
# any Postgres 16+ — self-hosted, Railway, Supabase, a laptop. That single
# pair of flags is the difference between a backup and an exit path.
#
# Usage:
#   scripts/backup-neon.sh                    # reads .env.production.backup
#   ENV_FILE=.env.local scripts/backup-neon.sh
#   BACKUP_DIR=/Volumes/ext/dg scripts/backup-neon.sh
#
# Restore (to anywhere):
#   createdb digital_garden
#   pg_restore --no-owner --no-acl -d "$TARGET_URL" <file>.dump
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.production.backup}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/Backups/digital-garden}"
RETAIN_DAYS="${RETAIN_DAYS:-30}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "env file not found: $ENV_FILE" >&2
  echo "regenerate with: vercel env pull .env.production.backup --environment=production" >&2
  exit 2
fi

URL="$(grep '^DATABASE_URL_UNPOOLED=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' || true)"
if [[ -z "$URL" ]]; then
  echo "DATABASE_URL_UNPOOLED not present in $ENV_FILE" >&2
  exit 2
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT="$BACKUP_DIR/digital-garden_$STAMP.dump"

echo "→ dumping prod to $OUT"
pg_dump "$URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  --file="$OUT"

# Fail loudly on a truncated dump rather than leaving a useless file behind.
if ! pg_restore --list "$OUT" >/dev/null 2>&1; then
  echo "✗ dump failed verification — removing $OUT" >&2
  rm -f "$OUT"
  exit 1
fi

TABLES="$(pg_restore --list "$OUT" | grep -c 'TABLE DATA' || true)"
echo "✓ $(du -h "$OUT" | cut -f1)  —  $TABLES tables with data"

# The database alone is not a restorable backup: STORAGE_ENCRYPTION_KEY
# decrypts stored storage-provider and AI credentials. Without it those rows
# are ciphertext forever. Keep the env snapshot beside the dump.
if [[ -f "$ENV_FILE" ]]; then
  cp "$ENV_FILE" "$BACKUP_DIR/env_$STAMP.txt"
  chmod 600 "$BACKUP_DIR/env_$STAMP.txt"
  echo "✓ env snapshot saved beside dump"
fi

find "$BACKUP_DIR" -name 'digital-garden_*.dump' -mtime "+$RETAIN_DAYS" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name 'env_*.txt' -mtime "+$RETAIN_DAYS" -delete 2>/dev/null || true

echo "✓ done — $(ls -1 "$BACKUP_DIR"/digital-garden_*.dump 2>/dev/null | wc -l | tr -d ' ') dumps retained"
