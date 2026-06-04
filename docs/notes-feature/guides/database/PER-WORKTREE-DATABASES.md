# Per-Worktree Local Databases

Each worktree (and the main checkout) can point at its own isolated database inside the shared local Postgres container. This guide walks through the workflow.

**Prerequisite**: [LOCAL-POSTGRES.md](./LOCAL-POSTGRES.md) first — you need the container running and the per-worktree `.env.local` swap pattern in place. Without that, the commands here have nothing to talk to.

## When this is useful

- **Branch-isolated experimentation** — testing a destructive migration or schema change without affecting other worktrees' state.
- **Multi-feature parallel work** — your `feature/X` and `feature/Y` worktrees both seed different test users, build different fixtures, and you don't want them stomping on each other.
- **Reproducing a bug on a specific data shape** — set up the exact state once, leave it untouched while you switch between branches.
- **Multi-tenant simulation** — pretend to be different "deployments" by giving each worktree its own DB.

## When NOT to use this

- One-off testing where `pnpm db:local:reset` (wiping the shared DB) would suffice — that's faster and simpler.
- When you actively want shared state across worktrees (e.g., you created a note in one worktree and want to see it in another).
- For data you care about long-term — these are throwaway dev DBs. Reset / drop without ceremony.

## The procedure

```bash
# 1. Pick a DB name — lowercase, underscores, no slashes, max 63 chars.
#    Convention: dg_<short-purpose>
#    Examples: dg_security_smoke, dg_tenancy_test, dg_ai_chat_dev
DB_NAME=dg_security_smoke

# 2. Create the empty DB inside the running container.
#    (Any directory works — this talks to the container, not the worktree.)
docker exec digital-garden-postgres psql -U postgres -c "CREATE DATABASE $DB_NAME;"

# 3. cd into the worktree (or the main checkout) you want this DB to belong to.
cd /Users/davidvalentine/Code/Digital-Garden                            # main checkout
# or
cd /Users/davidvalentine/Code/Digital-Garden/.claude/worktrees/<name>   # a worktree

# 4. Edit THAT worktree's .env.local. Change the database name segment of DATABASE_URL:
#    BEFORE: DATABASE_URL="postgresql://postgres:postgres@localhost:5432/digital_garden_dev?schema=public"
#    AFTER:  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dg_security_smoke?schema=public"
#    Keep LOCAL_POSTGRES=1 unchanged.

# 5. Confirm the swap took effect.
pnpm db:target
# Expect:
#   🐳 LOCAL POSTGRES
#   host:     localhost
#   database: dg_security_smoke    ← the new name
#   marker:   LOCAL_POSTGRES=1

# 6. Bootstrap the new DB (migrate deploy + db push + seed). ~30 seconds.
pnpm db:local:bootstrap

# 7. If pnpm dev was running, Ctrl+C it and restart. It will hit the new DB.
pnpm dev
```

## What changes after step 7

| Aspect | Effect |
|---|---|
| Your browser session | Session cookie still references a row in the OLD DB. The new DB doesn't have it → app treats you as signed out → sign-in page appears. Sign in fresh: `admin@example.com` / `changeme123` (seed-created) or via Google OAuth (which creates a new `User` row in the new DB). |
| The OLD DB | Untouched. Switch back any time by editing this worktree's `.env.local` to point its name back. |
| Other worktrees | Untouched — they still hit whichever DB their own `.env.local` points at. Isolation is per-DATABASE_URL, not per-process. |
| The Postgres container | One server, multiple DBs. Shares memory + connections + disk. No new container, no new port. |

## Concrete example: a DB for the security-integration-smoke branch

If you're on the `security/integration-smoke` branch in the main checkout and want a dedicated DB for it:

```bash
# Create
docker exec digital-garden-postgres psql -U postgres -c "CREATE DATABASE dg_security_smoke;"

# Switch to main checkout (your current shell is probably already here)
cd /Users/davidvalentine/Code/Digital-Garden

# Edit .env.local in your IDE: change the database name segment of DATABASE_URL
# to "dg_security_smoke" (keep everything else)

# Verify + bootstrap + restart dev
pnpm db:target
pnpm db:local:bootstrap
# Ctrl+C any existing pnpm dev, then:
pnpm dev
```

## Managing existing DBs

| Action | Command |
|---|---|
| List all DBs in the container | `docker exec digital-garden-postgres psql -U postgres -c '\l'` |
| Open an interactive psql shell into a specific DB | `docker exec -it digital-garden-postgres psql -U postgres -d <db_name>` |
| See active connections per DB | `docker exec digital-garden-postgres psql -U postgres -c 'SELECT datname, COUNT(*) FROM pg_stat_activity GROUP BY datname;'` |
| Drop a DB (requires no open connections — kill `pnpm dev` and `prisma studio` first) | `docker exec digital-garden-postgres psql -U postgres -c 'DROP DATABASE <db_name>;'` |
| Force-drop (terminates active connections) | `docker exec digital-garden-postgres psql -U postgres -c 'DROP DATABASE <db_name> WITH (FORCE);'` (Postgres 13+) |

## Cleanup when done

When you're done with a worktree's DB (e.g., the branch is merged, the experiment is over):

1. Make sure nothing is connected: stop `pnpm dev`, close `prisma studio`, close `psql` shells.
2. Drop the DB:
   ```bash
   docker exec digital-garden-postgres psql -U postgres -c 'DROP DATABASE dg_security_smoke;'
   ```
3. Either delete the worktree's `.env.local` or repoint its `DATABASE_URL` at `digital_garden_dev` (the default shared DB).

## Notes & gotchas

- **Disk space**: each empty DB is ~30–50 MB (Postgres' base catalog + indexes). Grows as you add data. Negligible until you have dozens, and you can always drop the ones you're not using.
- **Migrations are per-DB**: each DB has its own `_prisma_migrations` table. When schema.prisma changes and migrations are added, each DB you care about needs its own `npx prisma migrate deploy && npx prisma db push` (or just `pnpm db:local:bootstrap` again).
- **Seeds are per-DB**: `pnpm db:seed` writes to whichever DB your `.env.local` points at. If you want the admin user + sample data in multiple DBs, seed each one separately.
- **Cross-DB queries don't work** (without foreign data wrappers). This is intentional Postgres isolation — usually what you want for these dev DBs.
- **Container restart**: `pnpm db:local:down` / `pnpm db:local:up` preserves ALL named DBs (they all live in the same `digital-garden-dev-pg-data` volume).
- **`pnpm db:local:reset` wipes EVERYTHING**: it removes the entire volume, so every per-worktree DB is gone. Use sparingly — that's the global nuke button. After a reset you re-create the DBs you need.

## When to graduate to a separate container

This guide assumes "multiple DBs, one container" is enough — and it almost always is. The cases where you'd want a separate Postgres container instead:

- Testing against a different Postgres version (e.g., 15 vs 16).
- Simulating cross-instance replication.
- Strong isolation requirements (different users/permissions per container).

That's a different setup — extend `docker-compose.yml` with a second service on a different port + volume. Roughly five minutes of compose-file editing. Not covered here.

## Related docs

- [LOCAL-POSTGRES.md](./LOCAL-POSTGRES.md) — base local Postgres setup (prerequisite)
- [PRISMA-DATABASE-GUIDE.md](./PRISMA-DATABASE-GUIDE.md) — Prisma 7 patterns
- [PRISMA-MIGRATION-GUIDE.md](./PRISMA-MIGRATION-GUIDE.md) — authoring migrations
- [DATABASE-CHANGE-CHECKLIST.md](./DATABASE-CHANGE-CHECKLIST.md) — checklist for schema changes
