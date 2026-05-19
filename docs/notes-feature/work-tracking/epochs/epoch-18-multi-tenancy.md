---
epoch: 18
title: Multi-Tenancy Foundation
status: in_progress
started: 2026-05-18
last_updated: 2026-05-18
worktree: /Users/davidvalentine/Code/Digital-Garden/.claude/worktrees/feature+multi-tenancy
branch: feature/multi-tenancy
detailed_plan: ../MULTI-TENANCY-PLAN.md
---

# Epoch 18: Multi-Tenancy Foundation

## Objective

Evolve the single-tenant publishing system (Epoch 15) into a multi-tenant foundation so the Digital Garden codebase can serve three distinct audiences from one repo and one deploy: David's personal site at `davidvalentine.org`, a future SaaS marketing site at `digital-garden.com`, and any other user's published content under their own custom domain. The plan also lifts the per-tenant publishing model: any user can own multiple sites, each scoped to its own published-content tree, with a destination picker added to the existing `CreatePublicItemDialog`.

No user-customizable homepage builder ships in this epoch — the default tenant index page is server-rendered and not user-customizable. David's code-driven home stays as a special case (gated by `tenant.slug === 'david'`). A placeholder `Tenant.homeTemplate` field is added so a future template engine can slot in without a schema migration.

## Architecture

Three layers of change, each independently rollable:

| Layer | What changes | Why |
|---|---|---|
| **Data model** | New `Tenant` + `TenantHost` tables. `User.primaryTenantId` (nullable FK). `PublicItem.tenantId` + `PublicPath.tenantId` (additive, backfilled, then constrained non-null in a follow-up). `Tenant.homeTemplate` as a forward-looking placeholder. | Tenant becomes the publishing scope, not just a routing label. `ownerId` on `PublicItem` is kept as the audit/permission field; `tenantId` is the destination. |
| **Request routing** | New `middleware.ts` resolves `host → tenant` via `lib/domain/tenancy/resolve-tenant.ts` and injects `x-tenant-id` + `x-tenant-slug` request headers. Public-render pages query by `tenantId` instead of `ownerId`. Behavior is feature-flagged behind `MULTITENANT_ENABLED` (default off — current behavior preserved). | Cleanly separates "who serves this request" from the handler bodies. With the flag off, the env-derived `SITE_OWNER_ID` continues to govern behavior. |
| **Performance** | Route 1 — Edge Config for sub-ms host lookups. Route 2 — per-tenant `cacheTag` so publish actions only invalidate that tenant's content. Route 3 — static-first public content with on-demand revalidation. Route 4 — route-group bundle splitting (`(personal)`, `(platform)`, `(public)`, `(authenticated)`) so personal-home visitors don't download IDE code. | Multi-tenant adds a lookup per request and a scope per query — both are mitigated by the same caching+config plumbing Vercel ships natively. |

**Closed-set decisions (locked in the plan):**

| Topic | Decision |
|---|---|
| Tenant model | Full `Tenant` + `TenantHost` tables (chosen over a minimal `Host`-only table for forward flexibility) |
| Item-to-tenant relationship | **1:1** — publishing the same source ContentNode to two sites creates two PublicItems. No M:N junction table |
| Default publish destination | `User.primaryTenantId`. Single-tenant users see no UX change; multi-tenant users get a picker in `CreatePublicItemDialog` |
| Tenant management surface | Settings → "Sites" page (`app/(authenticated)/settings/sites/`) ships in this epoch |
| URL shape | Subpath now (`digital-garden.com/u/<slug>/...`), subdomain deferred |
| Plan scope | Foundation only — digital-garden.com NOT launched in this epoch. DNS + domain config separate |
| UI vocabulary | "Site" in UI; `Tenant` in code |

## Phases

Numbering follows [`../MULTI-TENANCY-PLAN.md`](../MULTI-TENANCY-PLAN.md). Status keys: ⚪ planned, 🟡 in progress, ✅ complete.

### Phase 0 — Foundation work (outside code) ✅

- **0.1 Worktree's `.env.local` wired to dev Neon branch.** Branch forked from prod's `main` (Neon copy-on-write). Confirmed populated User table on the `dev-david` Neon branch + `neondb` database (not the Prisma shadow DB).
- **0.2 Vercel CLI** — deferred until Phase 6 (only needed for Edge Config).
- **0.3 Edge Config store** — deferred to Phase 6.
- **0.4 `/etc/hosts` entries** — pending; needed for Phase 2 local testing.

### Phase 1 — Schema + tenancy helpers (additive, no behavior change) ✅

`prisma/schema.prisma` added `Tenant`, `TenantHost`, `User.primaryTenantId`, `PublicItem.tenantId`, `PublicPath.tenantId`, `PublicPathRedirect.tenantId`. Composite indexes for the new query shape (`[tenantId, state, deletedAt]`, `[tenantId, lastPublishedAt desc]`, `[tenantId, parentId]`, `[tenantId, isActive]`). `lib/domain/tenancy/` module: `types.ts`, `resolve-tenant.ts`, `get-current-tenant.ts`, `index.ts` (barrel). One-shot `scripts/backfill-tenants.ts` + `scripts/_load-env.ts` helper created `david` tenant + `davidvalentine.org` / `www.davidvalentine.org` TenantHost rows and backfilled 5 PublicItems + 3 PublicPaths cleanly on dev branch. Follow-up PR will make the new columns non-null after prod backfill verifies clean. Commits: `44c8c31` (docs) + `83c18cd` (code). Gates: build ✓, lint 159/159 (0 errors).

### Phase 2 — Proxy in pass-through mode ✅

Integrated tenant resolution into the existing `proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`). Reads `host` header, wraps work in `withTrace(traceId, …)` so spans get a valid context, calls `resolveTenantByHost` which opens `tenancy:host:resolve` + `tenancy:tenant:lookup` spans, injects `x-tenant-id` + `x-tenant-slug` + `x-trace-id` headers. With `MULTITENANT_ENABLED=false` (default) the proxy short-circuits — zero overhead, no DB call. URL rewriting deferred to Phase 7. Smoke tested both flag states: flag off renders identically, flag on resolves `davidvalentine.org` → `david` tenant with full trace emitted.

**Lessons captured:**
- `startSpan` / `withSpan` require an active `withTrace` context — the proxy must open its own (the route-trace wrapper hasn't run yet at proxy time). `logger.*` calls handle no-trace gracefully (fall back to `[trace:no-trace]`), but spans throw.
- Forwarding the proxy's `trace_id` via `x-trace-id` header lets the downstream `withRouteTrace` continue the same trace tree instead of starting a new one.

### Phase 3 — Wire public-render routes to query by tenant ✅

[app/page.tsx](app/page.tsx) and [app/(public)/[...path]/page.tsx](app/(public)/[...path]/page.tsx) swapped `SITE_OWNER_ID` reads for `await getCurrentTenant()` and query by `tenantId` instead of `ownerId`. Helper functions in the catch-all (`resolvePublicItem`, `resolvePublicPath`) refactored to take `tenantId`. Redirect lookup tenant-scoped via `findFirst({ where: { tenantId, fromPath } })` — the global `fromPath @unique` constraint will become `[tenantId, fromPath]` composite in a follow-up.

With flag off, the helper returns David's tenant via the legacy fallback (`SITE_OWNER_ID` → user → `primaryTenantId`), so rendered output is identical. Smoke-tested all three states: flag off, flag on with known host (`davidvalentine.org` → `david` tenant), flag on with unknown host (legacy fallback kicks in). Build clean: 136 static pages generated, ratchet held at 159/159.

**Lessons captured:**
- `withSpan` throws outside `withTrace`. Helpers callable from build-time prerender, scripts, OR request handlers need self-created trace context. Added `ensureTraceContext` utility to `lib/domain/tenancy/resolve-tenant.ts`: no-op when a trace is active, opens a fresh one when not. Pattern saved as project memory.

### Phase 3b — Tenant-scoped publishing API ✅

All 9 publishing API routes updated. GET/PATCH/DELETE handlers filter by Prisma relation `where: { ..., tenant: { ownerId: session.user.id } }` instead of `ownerId: session.user.id` — semantically the same today (because backfill set `ownerId = tenant.ownerId`), but future-proof against tenant transfers. POST handlers (`items/route.ts`, `paths/route.ts`) accept optional `tenantId` and default to `session.user.primaryTenantId` via a new helper `lib/domain/tenancy/api.ts::resolveWritableTenantId`. The helper validates that the user owns the requested tenant, throwing a typed `TenantAuthError` that routes catch and convert to 403/404 responses.

**Cron unchanged.** The scheduled-publish route already iterates all due `PublicItem.state === "scheduled"` rows across the whole DB regardless of owner — multi-tenant friendly out of the box. The plan's "iterate by tenant" was a misread of the existing implementation.

**No `archive` route exists** despite the plan listing one. Either renamed or deferred — not blocking.

Files modified (9):
- `app/api/publishing/items/route.ts` (GET + POST)
- `app/api/publishing/items/[id]/route.ts` (GET + PATCH)
- `app/api/publishing/items/[id]/{publish,unpublish,sync,schedule,validate,revisions}/route.ts`
- `app/api/publishing/paths/route.ts` (GET + POST)
- `app/api/publishing/paths/[id]/route.ts` (PATCH + DELETE)

Files added: `lib/domain/tenancy/api.ts`, barrel update in `lib/domain/tenancy/index.ts`.

Today's clients (which don't send `tenantId`) get exact same behavior: items/paths created on user's primary tenant. Phase 6b will introduce the first client that passes `tenantId` explicitly (the destination picker).

### Phase 4 — Cache invalidation scaffolding ✅ *(scope reduced)*

Original plan was "every public render is `cacheTag`'d and every mutation calls `revalidateTag`." In Next.js 16, `cacheTag` requires `cacheComponents: true` in next.config.ts, which makes every component dynamic by default — far too broad a blast radius for this phase.

**Pragmatic substitute shipped:**
- New helper `lib/domain/tenancy/cache.ts` → `invalidateTenantCache({ type, id })`. Two effects per call:
  1. `revalidateTag(`tenant:<id>`, "default")` — forward-compat scaffolding. No tagged caches exist today (no `unstable_cache` wrappers, no `'use cache'` directives), so this is a no-op. Becomes meaningful when a future Cache Components epoch lands.
  2. `revalidatePath("/")` plus the affected URL — invalidates ISR-cached pages immediately. Works today because the public pages set `export const revalidate = 60`.
- Wired into 7 publishing mutation routes: `items/route.ts` POST, `items/[id]/route.ts` PATCH, `items/[id]/publish/route.ts`, `items/[id]/unpublish/route.ts`, `paths/route.ts` POST, `paths/[id]/route.ts` PATCH + DELETE.
- `sync`, `schedule`, `validate`, `revisions` routes skipped — none change the rendered public output (working revision / scheduledFor / validation state are IDE-internal; the cron handles actual publish render changes via the publish route's path on each tick).

**Known limitation, documented:** `revalidatePath` is host-agnostic. In a multi-tenant prod deployment, a publish on tenant A also invalidates tenant B's same-URL pages (e.g., both have `/garden/note`). Acceptable single-tenant today; the long-term fix is migrating to Cache Components where `cacheTag` IS host-aware.

**Lessons captured:**
- `revalidateTag` in Next 16 requires 2 args: `(tag, profile)`. Saved as project memory.
- Cache Components opt-in is global, not per-page. Enabling it changes the default rendering model app-wide.

### Phase 5 — Static-first published content ⚪

`(public)/[...path]/page.tsx` `revalidate` extends to 3600 with on-demand revalidation via Phase 4 tags. Belt-and-suspenders: even if `revalidateTag` misfires, pages eventually refresh within an hour.

### Phase 6 — Edge Config for tenant resolution ⚪

Replaces the DB lookup in `resolveTenant` with `@vercel/edge-config` reads. DB stays as fallback for new tenants not yet synced. New `lib/domain/tenancy/sync-edge-config.ts` helper pushes mappings on `TenantHost` create/update.

### Phase 6b — Tenant picker in `CreatePublicItemDialog` ⚪

Dialog gains an optional "Publish to" select listing the user's tenants, defaulting to primary. Hidden when the user owns exactly one tenant. Backed by new `GET /api/user/tenants` route.

### Phase 6c — Settings "Sites" page ⚪

`app/(authenticated)/settings/sites/page.tsx` — list/create/rename/delete sites, set primary, claim hosts. Backed by `app/api/user/tenants/[...]` routes. Custom-host claiming flow ships steps 1–3 (UI + DNS instructions + manual admin verify); automated DNS verification is deferred.

### Phase 7 — Route group splitting + subpath URLs ⚪

`app/page.tsx` becomes a dispatcher: `tenant.isPersonal && tenant.slug === 'david'` → `<PersonalHome>`; else → `<DefaultTenantIndex>`. New `(personal)`, `(platform)`, `(tenant)` route groups for bundle splitting. `app/u/[slug]/page.tsx` + `app/u/[slug]/[...path]/page.tsx` ship subpath URLs for digital-garden.com (which is itself not launched yet).

## Observability requirements

All new server code complies with [`../OBSERVABILITY-CLEANUP-PLAN.md`](../OBSERVABILITY-CLEANUP-PLAN.md):
- Every new API route wraps in `withRouteTrace`
- Tenant resolution, DB lookups, Edge Config reads, backfill iterations wrap in `withSpan`
- `console.*` outside `lib/core/logger/` is lint-warned and on a path to lint-error (the `scripts/**` directory is on the deferral list, so `backfill-tenants.ts` may use `console.*` initially; preferred is to use the logger from the start)
- Events follow `<layer>:<noun>:<state>` from the closed-set vocabulary

**Open governance decision:** add a `tenancy` layer to the `ServerLayer` set in [lib/core/logger/types.ts](lib/core/logger/types.ts), or fit events into existing `route`/`admin` layers? Recommended: add the layer (cross-cutting work justifies its own column), but the decision is a charter update separate from this epoch's PR. See the plan's Observability standards section.

## Gate state

| Gate | Status |
|---|---|
| `pnpm typecheck` | TBD |
| `pnpm lint` | TBD |
| `pnpm collab:schema:check` | TBD |
| `pnpm build` | TBD |
| Manual smoke (davidvalentine.local with flag off / on) | TBD |

## Non-goals

- digital-garden.com domain going live (separate effort once foundation is proven)
- Subdomain support (`<slug>.digital-garden.com`) — subpath only for now
- Tenant-authored homepage builder / template picker / per-tenant theming UI (placeholder `homeTemplate` field left on `Tenant` so a future engine can slot in)
- Team membership / shared tenant ownership (schema supports a future join table)
- Background DNS verification for custom hosts (manual admin verify in this epoch)
- Removing `PublicItem.ownerId` after `tenantId` exists (kept for audit/permission)

## Branch state

- Branch: `feature/multi-tenancy`
- Worktree: `/Users/davidvalentine/Code/Digital-Garden/.claude/worktrees/feature+multi-tenancy`
- Base: `132b3dc` (`origin/main`, PR #38 publishing + observability merge)
- Working tree: pending Phase 1 schema changes
- Dev DB: Neon branch `dev-david` (compute `ep-bold-unit-aflm1m4z`), forked from prod `main` with full data, `pg_trgm` extension enabled, schema synced via `prisma db push`

## Integration

This epoch builds on Epoch 15 (publishing) and Epoch 17 (observability). Both are now on `main`. No further integration branch is needed — `feature/multi-tenancy` PRs directly to `main` when phases ship.

## Reference docs

- [`../MULTI-TENANCY-PLAN.md`](../MULTI-TENANCY-PLAN.md) — detailed phase-by-phase plan, all file paths, verification steps, rollback procedure
- [`epoch-15-publishing.md`](epoch-15-publishing.md) — the publishing system this epoch extends
- [`epoch-17-observability.md`](epoch-17-observability.md) — the observability discipline this epoch must comply with
- [`../OBSERVABILITY-CLEANUP-PLAN.md`](../OBSERVABILITY-CLEANUP-PLAN.md) — closed-set vocabulary + `withRouteTrace` pattern
