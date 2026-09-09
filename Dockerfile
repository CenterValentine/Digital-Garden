# Portable production image for the Digital Garden web app.
#
# Purpose: run the same app outside Vercel — Coolify on the home server, a VM,
# Railway, anywhere with a Node runtime. Requires `output: "standalone"` in
# next.config.ts (Next traces the minimal server into .next/standalone).
#
# Build:  docker build -t digital-garden .
# Run:    docker run --env-file .env.production.backup -p 3000:3000 digital-garden
#
# Pinned to node:22-bookworm-slim to match Dockerfile.hocuspocus — the same base
# already builds this repo's Prisma client and TipTap tree in production.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# openssl: required by Prisma's query engine.
# cairo/pango/jpeg/gif/rsvg: required by `canvas`, which next.config.ts lists in
#   serverExternalPackages — it is NOT bundled, so its native libs must exist at
#   runtime as well as build time. Omitting these is the most common cause of a
#   container that builds fine and then crashes on first PDF/visualization route.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends \
       ca-certificates openssl \
       libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

# ── Build stage ─────────────────────────────────────────────────────────────
FROM base AS build

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY . .

# Generates into lib/database/generated/prisma (custom `output` in schema.prisma),
# not node_modules/.prisma — so it must run before the build and be carried into
# the runner explicitly below.
RUN pnpm exec prisma generate

# Same heap cap as the vercel-build script. The default ~4GB V8 heap aborts on
# this module graph; 5120 MB fits inside an 8 GB container with room to spare.
ENV NODE_OPTIONS=--max-old-space-size=5120
RUN pnpm build:tokens \
  && pnpm exec next build --turbopack

# ── Runtime stage ───────────────────────────────────────────────────────────
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# .next/standalone contains server.js plus only the traced node_modules.
# static/ and public/ are deliberately excluded from that trace and must be
# copied alongside it, or every asset 404s while the HTML renders fine.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# Safety net: the custom Prisma output path is sometimes missed by Next's
# dependency tracing. Copying it costs a few MB and removes a whole failure mode.
COPY --from=build --chown=nextjs:nodejs /app/lib/database/generated ./lib/database/generated

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
