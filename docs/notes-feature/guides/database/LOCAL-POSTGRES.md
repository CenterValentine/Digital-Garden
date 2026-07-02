# Local Postgres for Development

Optional Postgres-in-Docker setup for local dev. Avoids burning the metered Neon compute quota during day-to-day work and supports offline development.

**This is an option, not a replacement.** Neon remains the default for preview/production, and you can switch back at any time. CI continues to use Neon.

## When to use this

- You're iterating on schema/queries and don't want every dev-server restart counting against the Neon quota.
- You want a clean, throwaway database for testing migrations end-to-end.
- You're on a plane / coffee shop / spotty wifi and want offline dev.
- You're spinning up a fresh Codespace and want to avoid sharing Neon connections with other agents.

## When NOT to use this

- Reproducing a bug that involves real production data — use Neon.
- Testing anything that depends on Vercel build-time DB access — use Neon.
- Working on something that affects other developers' fixture state — use Neon.

## One-time setup

You need Docker (Desktop on Mac, or `docker` + `docker compose` on Linux/Codespaces).

```bash
# 1. Back up your existing .env.local — this is your ticket back to Neon
cp .env.local .env.local.neon

# 2. Merge the local-postgres vars into .env.local. You can either:
#    - Copy the DATABASE_URL + LOCAL_POSTGRES=1 lines from .env.docker.example
#      into .env.local (replacing the existing DATABASE_URL), OR
#    - cp .env.docker.example .env.local and paste back your OAuth, AI,
#      and storage credentials.

# 3. One-command bootstrap: starts container + migrates + db push + seeds
pnpm db:local:bootstrap
```

That's it. `pnpm dev` will now use the local DB and auto-start the container if it's stopped.

### What `db:local:bootstrap` does

1. Safety check — refuses to run unless `LOCAL_POSTGRES=1` and `DATABASE_URL` points at `localhost`.
2. Starts the Postgres container (or confirms it's already healthy).
3. Runs `npx prisma migrate deploy` to apply the migration history.
4. Runs `npx prisma db push` to sync schema for the un-migrated tables (see drift section below).
5. Runs `pnpm db:seed` to populate sample data + an admin user (`admin@example.com` / `changeme123`).

### Auto-start: how `pnpm dev` knows about the container

After the one-time bootstrap, `pnpm dev` automatically:

- Reads `LOCAL_POSTGRES` from `.env.local`.
- If `LOCAL_POSTGRES=1` and the container isn't running, starts it before Next.js boots.
- If `LOCAL_POSTGRES` is unset (Neon mode), skips the check entirely.

You should never need to manually `docker compose up` after the first bootstrap.

## Known issue: migration drift

Several features in this codebase shipped their schema changes via `prisma db push` against Neon without backfilling proper migration files. As a result, `prisma migrate deploy` alone produces a DB missing ~30 tables that the running app expects. The `npx prisma db push` step above is the documented workaround until backfill migrations land.

Affected feature areas (each has a follow-up item in BACKLOG.md):

| Feature area | Missing tables |
|---|---|
| Tenancy (PR #47, Phases 5-12) | `Tenant`, `TenantHost`, plus `User.canClaimCustomHosts`/`User.primaryTenantId` columns |
| Publishing system | `PublicItem`, `PublicItemRevision`, `PublicPath`, `PublicPathRedirect`, `PreviewToken`, `Series` |
| Publishing payloads | `BlogPostPayload`, `CaseStudyPayload`, `ChatPayload`, `DataPayload`, `ExternalPayload`, `FolderPayload`, `HopePayload`, `MediaItemPayload`, `PagePayload`, `ProfileSectionPayload`, `ProjectPayload`, `VisualizationPayload`, `WorkflowPayload`, `BookmarkPayload` |
| Browser extension | `BrowserExtensionToken`, `BrowserExtensionInstall`, `BookmarkSyncConnection`, `BookmarkSyncConnectionInstall`, `BookmarkSyncLink` |
| Web resources | `WebResource`, `WebResourceContentLink`, `WebResourceViewState` |

**Template for backfill**: `prisma/migrations/20260530150000_baseline_ai_chat_tables/migration.sql` — the AI Chat tables were backfilled in PR #48 using idempotent SQL (`CREATE TABLE IF NOT EXISTS`, `DO` blocks for enums/constraints). The same pattern applies for each feature area above. After backfill migrations merge, the `db push` step in the quick-start can be deleted.

Once each backfill lands, existing Neon environments (prod, prod-mirror dev, live preview branches) will need:

```bash
npx prisma migrate resolve --applied <new-backfill-migration-name>
```

run against them once, so they record the migration as already applied without trying to re-create existing tables.

## Daily workflow

The Postgres container persists across reboots (volume is named `digital-garden-dev-pg-data`). You generally don't need to touch it — `pnpm dev` just works.

Useful commands:

| Command | Purpose |
|---|---|
| `pnpm db:local:bootstrap` | One-command first-time setup (or full re-bootstrap) — starts container, applies migrations, syncs schema, seeds |
| `pnpm db:local:up` | Start (or resume) the Postgres container (usually unnecessary — `pnpm dev` auto-starts it) |
| `pnpm db:local:down` | Stop the container (data preserved) |
| `pnpm db:local:reset` | Wipe data and restart — useful when migrations get tangled |
| `pnpm db:target` | Print which DB you're pointed at (local vs Neon vs other) |
| `pnpm db:seed` | Re-seed if you reset |
| `npx prisma studio` | GUI to browse local DB at http://localhost:5555 |

## Adopting in another worktree (without rebasing)

The Docker container is **host-level**, not per-worktree. Once started from any directory, it's reachable from every worktree on your laptop at `localhost:5432`.

To opt in from a worktree that doesn't yet have this commit merged in:

1. Make sure the container is running somewhere (this worktree's `pnpm db:local:up`, or any other checkout's).
2. In the OTHER worktree's `.env.local`, add (or replace `DATABASE_URL` with) the two lines from [.env.docker.example](../../../.env.docker.example):
   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/digital_garden_dev?schema=public"
   LOCAL_POSTGRES=1
   ```
3. Run `pnpm dev` in that worktree. It hits the shared local container.

You get the Neon cost savings immediately. The convenience scripts (`pnpm db:target`, `pnpm db:local:bootstrap`, the predev auto-start) become available when that worktree eventually merges main.

> **Why this works**: `docker-compose.yml` sets `name: digital-garden-dev`, which pins the container/volume/network names. Multiple worktrees running `docker compose up` all converge on the same container — they don't fight for port 5432.

## Switching back to Neon

```bash
cp .env.local.neon .env.local
pnpm db:target  # confirm "☁️  NEON" banner
```

That's it. Your local Postgres keeps running in the background; restoring `.env.local.neon` just points the app away. To free RAM, also run `pnpm db:local:down`.

## What to expect on first sign-in (post-#47)

This codebase auto-creates a personal tenant on first OAuth sign-in (Epoch 20 / Phase G0). When you sign in against a fresh local DB, you'll get a clean user record and a personal tenant — no manual steps. Your existing Google OAuth credentials in `.env.local` continue to work; the user record is per-database, so you'll be a "new user" from the local DB's perspective.

## Using in GitHub Codespaces

The setup works in Codespaces with three caveats:

1. **Use Codespaces Secrets, not `.env.local`.** Files don't survive Codespace rebuilds. Set `DATABASE_URL` and `LOCAL_POSTGRES=1` as Codespace Secrets in GitHub → Settings → Codespaces. They get injected into the env automatically and persist across rebuilds.

2. **Google OAuth redirect URI.** Codespaces gives each codespace a unique HTTPS URL (`https://<name>-3015.app.github.dev`). Google Sign-In won't redirect to it unless that URL is in the OAuth client's authorized redirect list. Either add the Codespace URL on first use, or rely on pre-known wildcards if you have them configured.

3. **Data does not survive a rebuild.** The named Docker volume is per-codespace and gets wiped on rebuild (the whole Docker daemon resets). After a rebuild, re-run `pnpm db:local:up && npx prisma migrate deploy && pnpm db:seed`. Treat it as ephemeral.

Inside Codespaces, the topology is Docker-in-Docker — `localhost:5432` from the dev process reaches the Postgres container as expected. No service-name juggling needed.

## Troubleshooting

**Port 5432 already in use** — You have a system Postgres running. Either stop it, or override the host port:

```bash
# In .env.local:
LOCAL_POSTGRES_PORT=5433
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/digital_garden_dev?schema=public"

# Then:
pnpm db:local:up
```

**"database digital_garden_dev does not exist"** — The container started but the init script didn't run. This happens if a stale volume from a previous bring-up persisted with no DB inside it.

```bash
pnpm db:local:reset  # wipes the volume and re-initializes
```

**`prisma migrate deploy` errors with "no migration history"** — Either you're pointed at Neon (run `pnpm db:target` to check) or the local DB was created outside this setup. Reset and retry.

**`pnpm db:target` shows local but you wanted Neon** — Your `.env.local` still has the local vars. Restore from `.env.local.neon`.

**Auto-save / Hocuspocus errors** — Local Postgres only handles the primary app DB. The Hocuspocus collaboration server runs separately on Google Cloud Run regardless of which DB you're pointed at. Real-time collab will degrade to local-only mode if you're offline (expected behavior).

## What this does NOT do

- Replace Neon for production or preview deployments.
- Migrate any data from Neon → local (it's a fresh DB; if you need prod-like fixtures, run `pnpm db:seed`).
- Change CI behavior — workflows still run against Neon.
- Set up the Hocuspocus collaboration server locally — that remains a remote service. See `docs/notes-feature/guides/collaboration/` for the collab story.

## Related docs

- [PRISMA-DATABASE-GUIDE.md](./PRISMA-DATABASE-GUIDE.md) — Prisma 7 patterns + driver adapter setup
- [PRISMA-MIGRATION-GUIDE.md](./PRISMA-MIGRATION-GUIDE.md) — Authoring migrations
- [DATABASE-CHANGE-CHECKLIST.md](./DATABASE-CHANGE-CHECKLIST.md) — Mandatory checklist for schema changes
