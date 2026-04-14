# Hocuspocus Railway Setup

Epoch 13 uses a separate Hocuspocus process for live Yjs transport. The Next.js app can stay on Vercel, but the WebSocket server should run on a long-lived Node host such as Railway.

## Railway Service

Create a Railway service from this repository and use these settings:

- Build command: `pnpm install --frozen-lockfile`
- Start command: `pnpm start:collab`
- Health check path: `/healthz`
- Readiness check path, if configured separately: `/readyz`

The service listens on `process.env.PORT`, which Railway injects automatically.

## Required Environment Variables

- `DATABASE_URL`: the same Neon Postgres connection string used by the app.
- `COLLABORATION_TOKEN_SECRET`: a strong random secret shared by the Next.js app and Hocuspocus service.
- `NEXT_PUBLIC_HOCUSPOCUS_URL`: the public WebSocket URL consumed by the app, for example `wss://your-service.up.railway.app`.

Optional tuning:

- `HOCUSPOCUS_ACCESS_REVALIDATION_MS`: defaults to `2000`.
- `HOCUSPOCUS_STORE_DEBOUNCE_MS`: defaults to `2000`.
- `HOCUSPOCUS_STORE_MAX_DEBOUNCE_MS`: defaults to `10000`.

Run `pnpm collab:env:check` before deployment to verify required variables are present.

## Health Checks

- `GET /healthz` returns process health and uptime without touching the database.
- `GET /readyz` verifies database connectivity with `SELECT 1`.

Railway should use `/healthz` for basic liveness. Use `/readyz` when you want deploy promotion to depend on database connectivity.

## Maintenance Rules

- Keep `COLLABORATION_TOKEN_SECRET` synchronized between Vercel and Railway.
- Run `pnpm collab:schema:check` in CI before deploying either service.
- Do not deploy Hocuspocus without `DATABASE_URL`; collaborative Yjs state must persist server-side.
- Do not use Vercel serverless functions for the Hocuspocus WebSocket process.
