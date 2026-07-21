# Migration Baseline (2026-07)

Adopting a migration-based database workflow: this consolidates the migration
history into one clean baseline so the migration history and `schema.prisma`
stay in lockstep and any environment can be provisioned from migrations alone.

## Background

The project iterated its schema primarily with `prisma db push` — the fast,
Prisma-recommended path for early/solo development. The tradeoff is that
`db push` syncs the database directly and doesn't record migration files, so
over time the migration history fell behind `schema.prisma`. This is invisible
in day-to-day work (the app and `db push` both read the schema directly, and
the databases have always been complete), but it means a database can't yet be
rebuilt from migrations alone — which we want for reproducible environments,
onboarding, CI, and `migrate dev`.

This baseline graduates the project to a migration-first workflow. Consolidating
an existing `db push` database into a single baseline migration is the standard
Prisma **baselining** procedure.

## What changed

| Before | After |
|---|---|
| `prisma/migrations/` — 32 partial migrations | `prisma/migrations/00000000000000_baseline/` — one baseline, full schema |
| prior migrations | moved to `prisma/migrations-archive/pre-2026-07-21-squash/` (reference only, outside Prisma's `migrations.path`) |
| `prisma.config.ts` | adds optional `datasource.shadowDatabaseUrl` (via `SHADOW_DATABASE_URL`) so `migrate dev`/`diff` work against a local shadow |
| — | `.github/workflows/migration-drift.yml` keeps history + schema in lockstep going forward |

`schema.prisma` is **unchanged** — this is a history + tooling change, not a
schema change, so the app and generated client behave identically.

**Verified during authoring (local Postgres 16):**
- Applies to an empty database (`ON_ERROR_STOP=1`) → 94 tables, 169 FKs, exit 0.
- `migrate diff <applied baseline> → schema.prisma` → **empty** (reproduces the schema exactly, zero drift).
- `migrate diff --from-migrations prisma/migrations → schema.prisma` → **empty** (history replays cleanly and completely).

## Adoption — one bookkeeping step per existing database

An existing database already contains every table, so it **records** the baseline
rather than running it. This is a metadata-only step: a single row in Prisma's
`_prisma_migrations` table. **No DDL runs; no table or row of your data is
touched.** Run once per database, before its next `migrate deploy`:

```bash
npx prisma migrate resolve --applied 00000000000000_baseline
npx prisma migrate status
```

`status` should report "Database schema is up to date!" Prod and the local Docker
dev database were adopted on 2026-07-21; both were clean (no `_prisma_migrations`
cleanup needed).

If a database was ever touched by `migrate deploy` and `status` notes migrations
"not found in the local migrations directory," reset its bookkeeping to match the
new single-baseline history (still metadata-only):

```bash
psql "$DATABASE_URL" -c 'CREATE TABLE "_prisma_migrations_backup" AS TABLE "_prisma_migrations";'
psql "$DATABASE_URL" -c 'DELETE FROM "_prisma_migrations";'
npx prisma migrate resolve --applied 00000000000000_baseline
npx prisma migrate status
```

### Fresh databases

No step needed — `prisma migrate deploy` runs the baseline and builds all 94
tables. Reproducible-from-migrations provisioning is exactly what this baseline
enables.

## Going forward

- Schema changes use `migrate dev` (with a local shadow DB) so every change ships
  with a migration — see CLAUDE.md → Database Workflows.
- The `migration-drift` CI gate replays the history and asserts it reproduces
  `schema.prisma`, so drift can't silently reaccumulate.
- Prod schema changes go through `migrate deploy` only.
- `prisma/migrations-archive/` is reference-only; never point Prisma at it.
