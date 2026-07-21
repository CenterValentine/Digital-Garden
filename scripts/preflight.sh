set -uo pipefail
cd "$(dirname "$0")/.."

fails=0
summary=()

run() {
  label="$1"; shift
  printf '\n\033[1m▶ %s\033[0m\n' "$label"
  if "$@"; then
    summary+=("  PASS  $label")
  else
    summary+=("  FAIL  $label")
    fails=$((fails + 1))
  fi
}

run "Prisma client (generate)" pnpm exec prisma generate
run "Typecheck" pnpm typecheck
run "Lint (--max-warnings ratchet)" pnpm lint
run "Collaboration schema" pnpm collab:schema:check
run "Extensions registry" pnpm extensions:check
run "Publishing schema" pnpm publishing:schema:check
run "Publishing defaults" pnpm publishing:audit:defaults

shadow=$(grep -E '^SHADOW_DATABASE_URL=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"')
if [ -n "$shadow" ]; then
  run "Migration drift" pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code
else
  summary+=("  SKIP  Migration drift (no SHADOW_DATABASE_URL)")
fi

printf '\n\033[1mPreflight summary\033[0m\n'
for line in "${summary[@]}"; do printf '%s\n' "$line"; done

if [ -z "$shadow" ]; then
  dburl=$(grep -E '^DATABASE_URL=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"')
  shadowurl=$(printf '%s' "$dburl" | sed -E 's#/[^/?]+(\?|$)#/preflight_shadow\1#')
  printf '\n\033[33mMigration drift was skipped. One-time setup to enable it:\033[0m\n'
  printf '  psql "%s" -c "CREATE DATABASE preflight_shadow"\n' "$dburl"
  printf '  echo '\''SHADOW_DATABASE_URL=%s'\'' >> .env.local\n' "$shadowurl"
  printf '  Then any schema change without a matching migration fails HERE, not in CI.\n'
fi

if [ "$fails" -gt 0 ]; then
  printf '\n\033[31m%s check(s) failed. Fix before opening a PR.\033[0m\n' "$fails"
  exit 1
fi

printf '\n\033[32mAll preflight checks passed. Safe to open a PR.\033[0m\n'
