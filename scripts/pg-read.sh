#!/usr/bin/env bash
# Read-only prod query wrapper for agent diagnostics.
#
# Two independent guarantees that this can never write:
#   1. Connects as the `dg_readonly` role (SELECT-only grants at the database).
#   2. Every statement runs inside a READ ONLY transaction, so even a grant
#      slip-up on some future table cannot turn into a write.
#
# The URL comes from DATABASE_URL_READONLY in the checkout's .env.local — never
# the owner URL. Usage:  scripts/pg-read.sh "select ..."
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: scripts/pg-read.sh \"<sql>\"" >&2
  exit 2
fi

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.local"
URL="$(grep '^DATABASE_URL_READONLY=' "$ENV_FILE" | cut -d= -f2- | tr -d '"')"
if [[ -z "$URL" ]]; then
  echo "DATABASE_URL_READONLY not set in $ENV_FILE" >&2
  exit 2
fi

exec psql "$URL" \
  --set=ON_ERROR_STOP=1 \
  -P pager=off \
  -c "BEGIN READ ONLY; $1; COMMIT;"
