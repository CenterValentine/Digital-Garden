# Platform Portability — what couples us to Vercel, and what it would take to leave

**Last updated:** 2026-09-09
**Status:** Reference / analysis. **No work has been done from this document, and none is scheduled.**
**Purpose:** So that a future decision to move off Vercel — or to stay deliberately — is made from measured facts rather than re-derived under pressure.

---

## How to use this document — read this first

**This is not a backlog. Nothing here should be scheduled as a project.**

It is an *opportunistic* reference. The intended use is: you are already rebuilding, replacing, or substantially reworking some service for an unrelated reason, and at that moment this document tells you which of the available shapes happens to also buy portability — so you take the portable option for free instead of discovering later that you painted yourself in.

**Applies when you are already:**

- rewriting or replacing anything in `lib/infrastructure/media/` (the native-dep surface)
- touching `components/public/TipTapContent.tsx` or the public render path (the jsdom surface)
- reworking tenant resolution or `proxy.ts`
- standing up a new deployment target for any reason
- changing how published content is stored or rendered
- picking a region for a new database or service

**Does not apply when:** nothing is being rebuilt. The correct action is then to do nothing. Vercel is a perfectly reasonable host, the coupling that mattered has already been undone (see below), and a migration undertaken for its own sake would cost far more than it returns.

The bet this document makes is that over a few years enough services get rebuilt for their own reasons that portability accrues incidentally — without a migration ever being a project.

---

## Why this exists

In September 2026 an unpaid $110.40 balance triggered a Vercel **soft block** (`softBlock: {reason: "UNPAID_INVOICE"}`). Every deployment began returning `HTTP 402 / DEPLOYMENT_DISABLED`, including `davidvalentine.org`, which was down for five days before anyone noticed. The hard block (`blocked`) was never set, so data and projects were intact throughout.

The lesson was not "Vercel is bad." It was that **hosting, database provisioning, secrets, and file storage all terminated at one vendor relationship**, so a small billing dispute became a total outage of the public web presence. Portability is insurance against coupling, independent of any opinion about the vendor.

### What was decoupled in response (already done)

| Asset | Before | After |
|---|---|---|
| Database | Neon **via Vercel Marketplace** | Neon project owned directly (61 MB, 103 tables, PG 17.11) |
| Backups | none | `scripts/backup-neon.sh` → `~/Backups/digital-garden/`, verified restorable |
| Secrets | Vercel only | `.env.production.backup` (69 keys; 12 are write-only and unrecoverable) |
| DNS | Cloudflare (already) | unchanged — `davidvalentine.org`, `thinketh.is` both on Cloudflare |

**Still coupled:** hosting, and the `digital-garden-files` Vercel Blob store.

---

## The four things that pin us to a Node runtime

Any host that runs a real Node process satisfies all four without code changes. Only *edge runtimes* (Cloudflare Workers, Deno Deploy, Vercel Edge) have a problem.

### 1. Node middleware — `proxy.ts`

Multi-tenancy resolves the `Host` header to a tenant via `resolveTenantByHost()` (Prisma) and injects `x-tenant-id` / `x-tenant-slug`. `@opennextjs/cloudflare` **does not support Node Middleware** (as of 2026-09). Without it there is no tenant resolution at all.

### 2. Native binaries

| Dep | Used by | On public render path? |
|---|---|---|
| `canvas` | `lib/infrastructure/media/pdf-processor.ts` (PDF thumbnails) | **No** |
| `fluent-ffmpeg`, `@ffmpeg-installer/*` | `lib/infrastructure/media/video-processor.ts` | **No** |
| `sharp` | no direct imports — transitive, Next.js image optimization | **No** |

**Key finding: none of the native dependencies are used by the public site.** They are authoring-side only. This is what makes a public/authoring split tractable if it is ever wanted.

### 3. Bundle ceiling

Cloudflare Workers: **3 MiB free / 10 MiB paid, gzipped.** With 264 API routes, the TipTap tree, Excalidraw, the AI SDK, and a ~40k-LOC generated Prisma client, this is very likely exceeded. Unverified — measure `.next/standalone` before assuming either way.

### 4. jsdom

Five call sites; only one is on the public path:

- `components/public/TipTapContent.tsx` ← **public**, feeds ProseMirror's `DOMSerializer`
- `lib/domain/content/svg-sanitizer.ts`
- `lib/domain/ai/acquisition/extract.ts`
- `lib/domain/ai/acquisition/server-fetch.ts`
- `app/api/speed-reader/extract/route.ts`

---

## Host options

All of these run a real Node process, so all four constraints above evaporate. No code changes required.

| Host | Effort | Cost | Notes |
|---|---|---|---|
| **Google Cloud Run** | Low | ~$0 at this traffic | **Already in use for Hocuspocus.** `Dockerfile.hocuspocus` + `cloudbuild.hocuspocus.yaml` are working templates. Scales to zero. |
| **Railway** | Very low | ~$5/mo | Git-connected; closest to Vercel's DX |
| **Render** | Very low | $7/mo always-on | Free tier cold-starts — unsuitable for a portfolio |
| **Fly.io** | Low | ~$5/mo | Docker, multi-region |
| **Coolify on home server** | Medium | $0 | `chrome-x-debian`, 16 GB, Cloudflare Tunnel already proven with n8n. See [HOME-SERVER.md](HOME-SERVER.md) |
| Cloudflare Pages (static snapshot) | Low | $0 | Public site only, content frozen until re-snapshot |
| Cloudflare Workers (OpenNext) | **High** | $0–5 | Requires all four blockers resolved — see below |

**What Vercel uniquely provides** is zero-config Next.js: ISR wiring, image optimization, and edge caching configured automatically. Everywhere else these are set up by hand. That is the real switching cost — not raw capability.

### Prerequisites already in the repo

- `next.config.ts` sets `output: "standalone"` — emits a self-contained server bundle at `.next/standalone`
- `Dockerfile` at repo root — multi-stage, includes the cairo/pango libs `canvas` needs at runtime
- `.dockerignore` carries an explicit `!dist/variables.css` exception (see Known Traps)

Neither is exercised by Vercel deploys, so both are inert until used.

---

## If Cloudflare Workers is ever wanted

Not recommended at present — the effort is days-to-weeks against hours for any Node host, and it leaves a split to maintain. Recorded so the option is understood rather than re-investigated.

| Blocker | Options |
|---|---|
| **Node middleware** | (a) Move resolution into the route — Server Components can call `headers()` directly, so `app/(public)/[...path]/page.tsx` reads `Host` and calls `resolveTenantByHost()` itself. (b) Put the host→tenant map in **Workers KV** — it is tiny and rarely changes, so it reads at the edge in microseconds with no Prisma, and runs on Edge middleware. (c) One deployment per domain. |
| **Native binaries** | Impossible on Workers — V8 isolate, no `dlopen`, no `child_process`. Replace rather than port: Cloudflare Images for `sharp`, Cloudflare Stream or a separate service for `ffmpeg`, WASM or a separate service for PDF rendering. Or leave all of it on the Node host. |
| **Bundle ceiling** | Measure first. A public-only build would be far smaller than the full app. |
| **jsdom** | (a) **`linkedom`** — pure JS, much lighter, built for constrained runtimes; closest to a drop-in. (b) `happy-dom`. (c) **Pre-render at write time** — store rendered HTML alongside `NotePayload.tiptapJson` on save, so the public route serves stored HTML and needs no DOM at read time. Architecturally the nicest and fits how ISR already thinks. |
| **Prisma** | Needs `@prisma/adapter-neon` + `@neondatabase/serverless` for HTTP-based Postgres access. |

### The seam this exposes

The app is really **two applications sharing a database**:

- a **read-mostly published site** — small dependency surface, cacheable, latency-sensitive for visitors
- a **heavy authoring IDE** — native media processing, 264 API routes, collaboration, AI

Vercel let us ignore that seam by running both in one deployment. Cloudflare's constraints do not create the seam; they expose one that was always there. Formalising it is only worth doing if the public site's performance becomes a real problem.

---

## Measured facts (2026-09-09)

Recorded so they are not re-derived. Re-measure before relying on them.

| Measurement | Value |
|---|---|
| Database size | 61 MB, 103 tables, PG 17.11; dump compresses to 7.1 MB |
| Neon region | `us-east-2` (Ohio) — **66–110 ms TCP RTT** from Utah |
| Nearest Cloudflare POP | `DEN` (Denver) |
| Public site content | 6 `PublicPath`, 10 `PublicItem`, 3 `SitePage` rows |
| Total content | 1,367 `ContentNode` rows |
| DNS TTL | `davidvalentine.org` A record: **105 s** — cutover is ~2 minutes |
| Build wall time | median **1 m 15 s** (Turbopack), 260 builds/month |

**Region note:** `us-east-2` was Neon's default at restore time, not a choice. If the origin ends up in the western US (home server, or Cloud Run `us-west1` where Hocuspocus already runs), re-restoring the dump into `us-west-2` cuts the DB round trip from ~66 ms to ~20 ms. The dump makes this a five-minute operation.

**ISR mitigates most of it:** `app/(public)/[...path]/page.tsx` sets `export const revalidate = 60`, so the majority of public requests serve pre-rendered HTML and never touch Postgres. DB latency mainly affects authenticated IDE use, which is single-user.

---

## Known traps found while containerising

Containerising surfaced two latent bugs, because a container builds from what is *declared* rather than from whatever happens to be on disk.

### 1. `pnpm build:tokens` is a silent no-op

`style-dictionary.config.js` sources from `lib/design-system/tokens/global.json`. The real path is **`lib/design/system/tokens/global.json`**. The task prints `No tokens for variables.css. File not created.` and **exits 0**, so no gate catches it. Every environment kept working because `dist/variables.css` is committed to git — the output has been the stale 2026-04-26 version ever since.

`app/globals.css` imports it directly (`@import "../dist/variables.css"`), so a build without that file fails outright. `.dockerignore` therefore carries `!dist/variables.css`.

**Unresolved.** Either fix the path and review the resulting CSS diff, or delete the dead task and treat `dist/variables.css` as hand-maintained. Currently it is neither.

### 2. Docker Desktop memory

The build sets `NODE_OPTIONS=--max-old-space-size=5120` to match Vercel's 8 GB container. A default Docker Desktop VM (7.65 GiB) OOMs, because Turbopack scales its worker pool to available cores — 12 on the Mac versus 4 on Vercel's Standard builder, so peak concurrent allocation is far higher at the same heap cap. Raise Docker's memory to 12 GB, or build with `--cpus=4`. The home server (16 GB, native Docker, no VM) is unaffected.

---

## Vercel cost mechanics worth remembering

The September 2026 bill was **$64.46 of Build CPU Minutes out of an $87.80 subtotal** — 90.7% of build CPU time was spent on **Turbo (30 vCPU)** for builds averaging 75 seconds.

- Build billing is `wall-minutes × vCPU count × $0.0035`, **rounded up to the whole minute**. At 1 m 15 s every build bills 2 minutes, so ~37% was paid for time nothing was running.
- **Elastic** is an auto-scaler, not a machine type. It escalated Standard → Enhanced → Turbo after two resource-exhaustion events in June/July and never scaled back down, despite the underlying cause (a webpack build timeout) having been fixed by the Turbopack migration on **2026-06-09**, ten days before Elastic was even enabled.
- **Standard builds are unbilled** unless on-demand concurrency is enabled — which is on by default.
- Vercel's UI quotes Elastic in **$/CPU-minute** and Standard in **$/build-minute** — different denominators, which makes the metered option read as cheaper than the free one.

Second-largest line was **Fluid Provisioned Memory** ($15.96 for 1,503 GB-hrs). Vercel bills provisioned memory for an instance's entire lifetime *including I/O wait*, and `/api/conversations/events` is an SSE stream with no visibility gating and no `maxDuration` — one continuously open browser tab accounts for roughly 1,460 GB-hrs/month, ~97% of that line. `presenceStreamSuspended` in `lib/domain/collaboration/runtime.ts` already solves this for the presence stream; the conversations stream never got the same treatment. **Worth fixing on any platform** — on a persistent Node server it costs nothing, but it also wastes a connection slot.

---

## Decision of record (2026-09-09): stay on Vercel

**We are staying on Vercel.** The September incident was painful, but the coupling that made it dangerous — the database, the secrets, DNS — has already been undone. What remains is hosting, and Vercel hosts this app well with zero configuration. Migrating now would trade a solved problem for weeks of work.

The posture is **inch away, never march.** Portability accrues as a side effect of work done for other reasons; it is never the reason for the work.

### Standing guidance

1. **Do not schedule a migration.** If this document ever appears in a sprint plan as its own item, that is a misreading.
2. **Keep `Dockerfile` and `output: "standalone"` current.** They are inert on Vercel and cost nothing to maintain. They are the difference between an exit measured in hours and one measured in weeks.
3. **Back up the Blob store.** `digital-garden-files` is the last un-backed-up asset; a database dump does not cover it. This is the one genuinely outstanding item.
4. **Keep spend management configured**, and keep the build machine on **Standard**. The September bill was 79% build CPU, entirely avoidable via one dropdown.
5. **Take the portable option when it is free.** When rebuilding something on the trigger list above, prefer the shape that does not deepen the coupling — but only when it costs nothing extra.
6. **If a move ever does happen: Cloud Run first.** Already in use for Hocuspocus, already understood, scales to zero, no code changes required.
7. **Do not pursue the Workers path** unless the public site specifically needs global edge performance. If that day comes, do the pre-render-at-write change first — it removes the jsdom blocker as a side effect and is worth doing on its own merits.

### Revisit this decision if

- A second billing or availability incident occurs (once is an incident; twice is a pattern)
- Monthly Vercel cost exceeds ~$40 sustained after the build machine fix
- The public site develops a real global-audience performance requirement
- The authoring app and published site diverge enough that the seam described above becomes obvious in day-to-day work

---

## Related

- [HOME-SERVER.md](HOME-SERVER.md) — Coolify + Cloudflare Tunnel runbook
- `scripts/backup-neon.sh` — prod dump, restores onto any Postgres 17
- `Dockerfile`, `.dockerignore`, `next.config.ts` (`output: "standalone"`)
