# Deployment Guide

How the Digital Garden actually runs in production: **three independently-deployed services**
plus managed data stores. This is the honest topology — see the README's architecture diagram
for the picture.

| Service | Platform | Deploy command | Notes |
|---|---|---|---|
| Next.js app (UI + API + AI domain) | Vercel | `vercel --prod` | `vercel-build` intentionally skips typecheck/lint (enforced locally + in CI) for fast deploys; Turbopack |
| Hocuspocus (Y.js collaboration) | Google Cloud Run | `gcloud builds submit --config cloudbuild.hocuspocus.yaml .` | See redeploy rules below — this is the #1 operational footgun |
| n8n (workflow spoke) | Any long-lived host | self-hosted | Reference setup: a home server behind a Cloudflare Tunnel — zero inbound ports |

Managed stores: **PostgreSQL** (Neon in production; local Docker for dev) and **object storage**
(Cloudflare R2 primary; AWS S3 and Vercel Blob supported).

---

## 1. Environment variables

Copy [`.env.example`](../.env.example) to `.env.local` and fill in. Groups, from
most- to least-required:

### Core (required)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection. Local dev: use `localhost` (not `127.0.0.1` — Docker binds IPv6) |
| `STORAGE_ENCRYPTION_KEY` | 32-byte hex; encrypts stored provider credentials |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth sign-in |
| `NEXTAUTH_SECRET` | Session signing |
| `LOCAL_POSTGRES=1` | Only when pointed at local Docker Postgres — read by the `db:target` safety check |

### Collaboration

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_HOCUSPOCUS_URL` | WebSocket URL the browser connects to. Dev: `ws://localhost:1234` — never a `0.0.0.0` bind address |
| `COLLABORATION_TOKEN_SECRET` | Signs per-document access tokens |
| `HOCUSPOCUS_PORT`, `HOCUSPOCUS_STORE_DEBOUNCE_MS`, `HOCUSPOCUS_STORE_MAX_DEBOUNCE_MS`, `HOCUSPOCUS_ACCESS_REVALIDATION_MS` | Server-side tunables (Hocuspocus process only) |

### Platform & site

| Var | Purpose |
|---|---|
| `PLATFORM_DOMAIN`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_BASE_URL` | Canonical host resolution (public site + app) |
| `SITE_OWNER_ID` | Which user owns the public personal site |
| `MULTITENANT_ENABLED` | Tenancy flag — leave off for single-owner deployments |
| `CRON_SECRET` | Authenticates Vercel cron invocations of `app/api/cron/` |

### Workflows (n8n spoke)

| Var | Purpose |
|---|---|
| `N8N_BASE_URL`, `N8N_API_KEY` | Outbound calls to your n8n instance |
| `WORKFLOWS_CALLBACK_BASE_URL` | **Public** URL n8n calls back to — must be reachable from the n8n host (a localhost dev server is not; use a deployed URL or tunnel) |

### Storage providers (configure at least one)

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` ·
AWS S3 equivalents · `BLOB_READ_WRITE_TOKEN` (Vercel Blob). Providers can also be configured
per-user in-app (credentials encrypted with `STORAGE_ENCRYPTION_KEY`).

### AI

Model keys are **BYOK-first**: users add provider keys in-app (stored encrypted). Env keys act as
server-side fallbacks / feature keys: `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, plus media-generation
providers (`TOGETHER_API_KEY`, `FIREWORKS_API_KEY`, `FAL_API_KEY`, `RUNWAY_API_KEY`) as needed.
Resumable streams need the Upstash Redis credentials provisioned by the Vercel integration
(project-prefixed `dg_*` REST vars).

### Observability

`LOG_LEVEL`, `LOG_TRACE`, `LOG_RECORD` — structured logging + trace recording
(`pnpm trace:view` to inspect).

---

## 2. Database: migrations & the baseline

Production migrations are **manual and reviewed** — never run from CI:

```bash
npx prisma migrate deploy
```

⚠ **Baseline caveat:** the migration history was squashed to a single from-empty baseline
(PR #119). Any database created **before** that squash must be marked as baselined once, before
its next `migrate deploy`:

```bash
npx prisma migrate resolve --applied 00000000000000_baseline
```

Full runbook: [MIGRATION-BASELINE-SQUASH.md](notes-feature/guides/database/MIGRATION-BASELINE-SQUASH.md).
Development uses `npx prisma db push` (no migration files); the
[database change checklist](notes-feature/guides/database/DATABASE-CHANGE-CHECKLIST.md) is
mandatory for schema changes.

## 3. Hocuspocus deploy rules (read before deploying)

1. **Deploy only from a checkout at `origin/main`.** Cloud Build ships your *working directory*.
   Verify first: `git rev-list --count HEAD..origin/main` must print `0`.
2. **Redeploy after every merge that touches the TipTap/collab schema** (new blocks, new marks).
   The collab server is a Docker snapshot — Vercel deploys do NOT update it. A stale server
   serializes unknown blocks as `unsupportedBlock` placeholders **inside collaborative documents**.
3. Don't infer staleness from `/readyz` `uptimeMs` — with `min-instances=0` it measures cold-start
   age, not deploy age. Use `gcloud builds list`.

## 4. n8n spoke

Any long-lived host works. The reference deployment: Coolify on a home server, exposed via
Cloudflare Tunnel (no inbound ports — `cloudflared` runs as a host service). Configure
`N8N_BASE_URL` to the tunnel hostname and point n8n's callback workflows at
`WORKFLOWS_CALLBACK_BASE_URL`. In n8n webhook nodes, remember the payload nests under
`$json.body.*`.

## 5. Local development

```bash
pnpm install
cp .env.example .env.local     # fill in core vars
pnpm db:local:up               # Docker Postgres
npx prisma generate
npx prisma migrate deploy
pnpm db:seed
pnpm dev                       # http://localhost:3015
pnpm dev:collab                # second terminal — required for live collaboration
```

Gotchas that cost real debugging time:

- **Local collab is required** in dev: the hosted Hocuspocus authorizes against the production DB
  and cannot see locally-created content. Run `pnpm dev:collab` from the **same checkout** as the
  dev server.
- Full builds need heap: `NODE_OPTIONS='--max-old-space-size=8192' pnpm build`.
- `pnpm dev` hardcodes port 3015; parallel worktrees need explicit `--port`.
- `pnpm db:target` tells you which database you're pointed at before you do anything regrettable.

## 6. Post-deploy verification

- App: sign in, open a note, confirm the auto-save indicator cycles.
- Collab: `/readyz` on the Hocuspocus service; open one note in two browsers, see both cursors.
- Workflows: trigger a Run; confirm the n8n execution and the inbound callback land in run history.
- Publishing: load a public page (davidvalentine.org) in light **and** dark themes.
