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

### Phase 1 — Schema + tenancy helpers (additive, no behavior change) 🟡

`prisma/schema.prisma` adds `Tenant`, `TenantHost`, `User.primaryTenantId`, `PublicItem.tenantId`, `PublicPath.tenantId`. Composite indexes for the new query shape (`[tenantId, state, deletedAt]`, `[tenantId, slug]`, `[tenantId, parentId]`). `lib/domain/tenancy/` module: `types.ts`, `resolve-tenant.ts`, `get-current-tenant.ts`, `index.ts` (barrel). One-shot `scripts/backfill-tenants.ts` creates one `Tenant` per existing User who owns publications, sets `primaryTenantId`, creates `davidvalentine.org` `TenantHost` mapping, and populates `tenantId` on all existing `PublicItem` / `PublicPath` rows. Follow-up PR makes the new columns non-null after backfill verifies clean.

### Phase 2 — Middleware in pass-through mode ⚪

`middleware.ts` reads host, calls `resolveTenant(host)` wrapped in a `tenancy:host:resolve` span, injects `x-tenant-id` + `x-tenant-slug` headers. Does NOT rewrite URLs in this phase. With `MULTITENANT_ENABLED=false`, falls back to `SITE_OWNER_ID`-derived tenant so behavior is identical.

### Phase 3 — Wire public-render routes to query by tenant ⚪

[app/page.tsx](app/page.tsx) and [app/(public)/[...path]/page.tsx](app/(public)/[...path]/page.tsx) swap `SITE_OWNER_ID` reads for `await getCurrentTenant()` and query by `tenantId` instead of `ownerId`. With flag off, the helper returns David's tenant via the legacy fallback so output is identical.

### Phase 3b — Tenant-scoped publishing API ⚪

All `/api/publishing/*` writes accept optional `tenantId`, default to `session.user.primaryTenantId`, and authorize via `tenant.ownerId === session.user.id`. Scheduled-publish cron iterates by tenant.

### Phase 4 — Cache tags scoped by tenant ⚪

Every public render adds `cacheTag('tenant:<id>:...')`. Every publishing mutation calls `revalidateTag('tenant:<id>')` looked up from the affected item (NOT from the session — critical for items on a non-primary tenant).

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
