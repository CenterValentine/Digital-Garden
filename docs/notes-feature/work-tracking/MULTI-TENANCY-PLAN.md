# Multi-Tenant Foundation for Publishing System

## Context

**Branch / worktree:** `feature/multi-tenancy`, worktree at `.claude/worktrees/feature+multi-tenancy/`, branched from `origin/main` at commit `132b3dc` (PR #38 "feature/observability-and-publishing" merge). This is the follow-up to the publishing system, which is now on `main` — not on a separate feature branch.

**Major changes on main since the prior draft of this plan:**
- **Publishing system merged** (PR #38). `PublicItem`, `PublicPath`, `PublicPathRedirect`, dialogs, sidebar UI, public renderer, scheduled-publish cron all in `main` now.
- **Server-side observability layer landed** ([lib/core/logger/](lib/core/logger/), governed by [docs/notes-feature/work-tracking/OBSERVABILITY-CLEANUP-PLAN.md](docs/notes-feature/work-tracking/OBSERVABILITY-CLEANUP-PLAN.md)). Every API route handler wraps in `withRouteTrace`. Operations use `withSpan`. `console.*` outside `lib/core/logger/` is lint-warned and on a path to lint-error. Closed-set vocabulary for events.
- **Epoch 17 observability tracking doc exists** at [docs/notes-feature/work-tracking/epochs/epoch-17-observability.md](docs/notes-feature/work-tracking/epochs/epoch-17-observability.md). The convention for multi-week feature work is one epoch doc per epoch; this plan should be promoted into an epoch doc (likely `epoch-18-multi-tenancy.md`) before implementation starts — see "Epoch doc migration" at the bottom.

**Where today's app stands:** `davidvalentine.org` serves David's personal home plus his published content, all keyed on a hardcoded `SITE_OWNER_ID` env var. We want to evolve this into a multi-tenant foundation that supports three audiences within one codebase:

1. **davidvalentine.org** — David's code-driven personal home + his published content rendered under the same domain.
2. **digital-garden.com** (future, not launched in this PR) — Marketing/landing + IDE signup + a subpath surface (`/u/<slug>/...`) for any user's published content.
3. **Other users with custom domains** (future, foundation-only here) — Their published content under their own domain via the same renderer.

**Key constraint (this epoch):** No user-customizable homepage builder ships in this PR. Each non-personal tenant gets a built-in default index page when their domain root is hit. David has a code-driven home (one special case, gated by tenant slug) — that does not change.

**Future-friendliness:** The architecture should leave the door open for a tenant-authored home system later (template picker, per-tenant theme, even custom MDX/JSX) — but building any of it is **explicitly out of scope for this epoch**. The home renderer in `app/page.tsx` is structured as a dispatcher (`if (isPersonal && slug === 'david') ... else <DefaultTenantIndex />`) so a third branch (`else if (tenant.homeTemplate) <TemplateHome />`) can be added later without disturbing the foundation. Placeholder fields on the `Tenant` model (e.g., a nullable `homeTemplate` slot) are acceptable to add now if it costs nothing; building the template engine, picker UI, or theming surfaces is not.

**Existing seam:** The original publishing author designed for this — see [app/(public)/[...path]/page.tsx:5-6](app/(public)/[...path]/page.tsx#L5-L6) (`// In a multi-tenant future this comes from the request host`). The data model is already `ownerId`-scoped; only the *resolution* of ownership is single-tenant today.

**Performance targets (Routes 1+2+3+4 from prior discussion):**
- Route 1 — Edge Config for tenant resolution (sub-ms host lookups).
- Route 2 — Cache tags scoped by tenant (`cacheTag('tenant:<id>:...')`).
- Route 3 — Static-first published content with on-demand revalidation.
- Route 4 — Route-group bundle splitting (personal home ships zero IDE JS).

**Decisions locked:**
- Tenant model: full `Tenant` table (future-proofs multi-site-per-user and team workspaces).
- Plan scope: foundation only — digital-garden.com is NOT launched in this PR. DNS/domain work is a separate effort.
- URL shape: subpath now (`digital-garden.com/u/<slug>/...`), subdomain support deferred.
- **Tenant is a publishing scope, not just a routing concept.** `PublicItem` and `PublicPath` carry a `tenantId` — each publication belongs to exactly one site.
- **Item-to-tenant relationship: 1:1.** Publishing the same source ContentNode to two sites means creating two PublicItems with different `tenantId` values. No M:N junction table.
- **Default destination: user's primary tenant.** New `User.primaryTenantId` (nullable FK). Single-tenant users see no UX change. Multi-tenant users get a picker in the existing `CreatePublicItemDialog`.
- **Tenant management lives in Settings.** A new "Sites" page under `app/(authenticated)/settings/sites/` lets users create, rename, and pick a primary tenant. Custom-domain claiming UI in this same page.
- **In UI, we call it "Site."** Code uses `Tenant`. UI strings say "Site" / "your site" / "this site." No "tenant" leaks to the user.

**Reversibility:** Every behavioral change is gated behind `MULTITENANT_ENABLED` env var. With flag OFF, the codebase behaves identically to today.

---

## Observability standards *(must follow in every phase)*

The observability layer that landed in PR #38 is a hard requirement, not a "nice to have." Every new file added by this plan must comply with [OBSERVABILITY-CLEANUP-PLAN.md](docs/notes-feature/work-tracking/OBSERVABILITY-CLEANUP-PLAN.md).

### Mandatory patterns

- **Every API route handler wraps in `withRouteTrace`.** Pattern from existing routes ([app/api/publishing/items/route.ts:15](app/api/publishing/items/route.ts#L15)):
  ```ts
  import { withRouteTrace } from "@/lib/core/logger/route-trace";
  export async function POST(req: NextRequest) {
    return withRouteTrace(req, { route: "/api/user/tenants" }, async () => {
      // handler body
    });
  }
  ```
- **Meaningful operations wrap in `withSpan`.** Tenant resolution, DB-backed lookups, Edge Config reads, backfill loop iterations — all become spans so they appear in the trace.
- **No `console.*` outside `lib/core/logger/`.** Use `logger.info/warn/error` with scalar-only attrs (`Record<string, string | number | boolean>` — non-scalar values are a compile error). The lint ratchet is at `--max-warnings 175` and is the migration's enforcement mechanism.
- **Event names follow `<layer>:<noun>:<state>`.** Closed-set vocabulary defined in [lib/core/logger/types.ts](lib/core/logger/types.ts).
- **No PII in attrs.** Tenant IDs and slugs are fine. User emails are not.

### Layer-set decision for tenancy events

The closed `ServerLayer` set today is: `route | auth | tree | content | editor | collab | storage | ai | export | external | browser_ext | periodic | admin`. There is no `tenancy` layer. Per the doc, "adding to these sets is a deliberate decision recorded in OBSERVABILITY-CLEANUP-PLAN.md, not an inline change."

Two options for this PR:

| Option | Event examples | Trade-off |
|---|---|---|
| **A. Add new `tenancy` layer** (governance update to OBSERVABILITY-CLEANUP-PLAN.md required) | `tenancy:host:resolved`, `tenancy:host:not_found`, `tenancy:tenant:created`, `tenancy:tenant:renamed`, `tenancy:host:claimed` | Cleanest semantic separation; tenant events get their own column in trace summaries. Costs one charter PR + type-set update. |
| **B. Fit within existing layers** | `route:tenant:resolved` (middleware), `admin:tenant:created` (settings UI), `route:tenant:not_found` (middleware 404) | Zero governance overhead; events still discoverable. Slightly muddier — tenancy is conceptually distinct from "this request's routing" and from "admin panel actions." |

**Recommendation:** **Option A** — add a `tenancy` layer. The work is cross-cutting (middleware, API routes, settings UI, cron iteration), and lumping it into `route` would dilute that layer's meaning. The charter update is a 1-line PR plus a sentence in the layer inventory.

### Required spans (minimum)

- `tenancy:host:resolve` — every middleware request that calls `resolveTenant`.
- `tenancy:tenant:lookup` — DB or Edge Config read for a tenant.
- `tenancy:edge_config:sync` — pushing host→tenant entries to Edge Config (Phase 6).
- `tenancy:publish:invalidate` — when a publish action calls `revalidateTag('tenant:<id>')` (Phase 4).
- Every new API route handler (Phase 3b, 6b, 6c) gets the standard `withRouteTrace` wrapper.

---

## Phase 0 — Foundation work *(outside code)*

These four setup steps happen **before** any code changes. They isolate dev from prod and prepare Vercel-side infrastructure. Detailed hand-holding included.

### 0.1 — Wire the worktree's `.env.local` to your dev Neon branch

**Status:** You already have the Neon branch created. This step configures the `feature/multi-tenancy` worktree to use it without disturbing your other worktrees / main checkout.

**Why this works:** `.env.local` lives in the worktree directory (`.claude/worktrees/feature+multi-tenancy/.env.local`). It is NOT a tracked git file (it's gitignored), so each worktree has its own independent env. Editing it here does not affect `/Users/davidvalentine/Code/Digital-Garden/.env.local` (the main checkout) or any other worktree.

**Steps:**

1. From the Neon dashboard (or `vercel env pull` if you've set up the branch in Vercel), copy the dev branch's connection strings — you want all four: `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_URL_NON_POOLING`.
2. In the worktree directory (`/Users/davidvalentine/Code/Digital-Garden/.claude/worktrees/feature+multi-tenancy/`), create or edit `.env.local`:
   - If your other worktrees' env was useful, start by copying it: `cp /Users/davidvalentine/Code/Digital-Garden/.env.local ./.env.local`
   - **Replace** the four Postgres values with the dev-branch versions.
   - Leave everything else (`STORAGE_ENCRYPTION_KEY`, `SITE_OWNER_ID`, Google OAuth secrets, etc.) as-is for now.
3. Add `MULTITENANT_ENABLED=false` to the bottom — the feature flag this plan keys behavior off.
4. Run `npx prisma db push` from inside the worktree. Should succeed against the dev branch.
5. Run `npx prisma studio` and visually confirm you see data — Neon branches start with a full copy of parent.

**Verification:** Make a tiny edit to a ContentNode in `prisma studio` against the dev branch. Refresh davidvalentine.org in prod — your edit should NOT appear. If it does, you're still pointed at prod; double-check the env values.

**Gotchas:**
- The connection string includes a branch-specific endpoint subdomain (the part before `.us-east-2.aws.neon.tech`). Don't manually edit it.
- `vercel env pull` overwrites `.env.local` — back up first if you've already configured the worktree.
- Other worktrees / your main checkout keep their existing `.env.local` files. This step is fully isolated.

### 0.2 — Install Vercel CLI

**Why:** Steps in Phase 6 (Edge Config) and any future production debugging need the CLI.

**Steps:**

```bash
npm i -g vercel
vercel login              # opens browser, sign in
vercel link               # run from the worktree root; picks the existing project
```

**Verification:** `vercel env ls` should list your project's env vars.

### 0.3 — Create Vercel Edge Config store *(needed by Phase 6, can defer)*

**Why:** Edge Config gives sub-millisecond reads at the edge for the host→tenant mapping. It's the lookup table middleware will hit on every request.

**Steps (when ready for Phase 6, not now):**

1. Vercel dashboard → your project → **Storage** tab → **Create New** → **Edge Config**.
2. Name it `tenant-hosts`.
3. Vercel auto-creates an env var `EDGE_CONFIG` containing the connection string. Pull it locally with `vercel env pull .env.local` (note: this **overwrites** your `.env.local` — back it up first).
4. In the dashboard, manually add one entry to start:
   - Key: `host:davidvalentine.org`
   - Value: `{"tenantId":"<david's tenant UUID>","slug":"david"}`

**Verification:** From your terminal — `curl https://edge-config.vercel.com/<your-store-id>/item/host:davidvalentine.org -H "Authorization: Bearer <token>"` returns the JSON.

**Gotcha:** Edge Config is eventually consistent — writes take a few seconds to propagate globally. Not an issue here because tenant additions are infrequent.

### 0.4 — Local `/etc/hosts` entries for multi-host testing

**Why:** Your dev server runs at `localhost:3015`. You need to test "what does davidvalentine.org see?" vs "what does digital-garden.com see?" locally.

**Steps:**

1. Open `/etc/hosts` with sudo: `sudo nano /etc/hosts`
2. Add these lines at the bottom:
   ```
   127.0.0.1 davidvalentine.local
   127.0.0.1 digital-garden.local
   127.0.0.1 testuser.local
   ```
3. Save (Ctrl+O, Enter, Ctrl+X in nano).
4. Flush DNS cache: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`

**Verification:** Visit `http://davidvalentine.local:3015` in your browser — should reach your dev server. Inspect the request — `Host` header should be `davidvalentine.local:3015`.

**Gotchas:**
- Use `.local` (not the real `.org`) so this never collides with your live site if DNS misbehaves.
- Don't add HTTPS — browsers will reject self-signed certs for `.local`. Plain HTTP is fine for dev.
- These entries are personal to your machine. CI and production are unaffected.

---

## Phase 1 — Schema & tenancy helpers *(additive, no behavior change)*

Goal: introduce the `Tenant` concept without changing any user-visible behavior. Deploy after this phase is safe — nothing reads from these tables yet.

### Files to add

- `prisma/schema.prisma` — add `Tenant` and `TenantHost` models.
- `lib/domain/tenancy/types.ts` — `Tenant`, `TenantHost`, `ResolvedTenant` types.
- `lib/domain/tenancy/resolve-tenant.ts` — `resolveTenant(host?: string): Promise<ResolvedTenant>` (DB-backed in this phase; Edge Config added in Phase 6).
- `lib/domain/tenancy/get-current-tenant.ts` — server-only helper reading from request headers, with env-var fallback when `MULTITENANT_ENABLED` is false.
- `lib/domain/tenancy/index.ts` — barrel export.

### Schema (Prisma)

```prisma
model Tenant {
  id            String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ownerId       String       @db.Uuid
  slug          String       @unique
  displayName   String
  isPersonal    Boolean      @default(false)
  // Future-facing placeholder: a tenant-authored home template id/key.
  // Not read by any code in this epoch. Reserved so a future template engine
  // can land without a schema migration. Leave null for now.
  homeTemplate  String?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  owner         User         @relation("OwnedTenants", fields: [ownerId], references: [id], onDelete: Cascade)
  hosts         TenantHost[]
  publicPaths   PublicPath[]
  publicItems   PublicItem[]
  @@index([ownerId])
}

model TenantHost {
  host       String   @id           // e.g. "davidvalentine.org"
  tenantId   String   @db.Uuid
  isPrimary  Boolean  @default(false) // primary host for this tenant (canonical URL)
  createdAt  DateTime @default(now())
  tenant     Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@index([tenantId])
}
```

**Existing model edits (additive):**

```prisma
model User {
  // ... existing fields
  primaryTenantId  String?  @db.Uuid              // nullable — backfilled before being made required
  primaryTenant    Tenant?  @relation("PrimaryTenantOfUser", fields: [primaryTenantId], references: [id], onDelete: SetNull)
  ownedTenants     Tenant[] @relation("OwnedTenants")
}

model PublicItem {
  // ... existing fields (ownerId stays for audit/permission)
  tenantId    String   @db.Uuid                   // nullable initially; non-null after backfill
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@index([tenantId, state, deletedAt])
  @@index([tenantId, slug])
}

model PublicPath {
  // ... existing fields
  tenantId    String   @db.Uuid
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@index([tenantId, parentId])
  @@index([tenantId, slug])
}
```

**Why this shape:**
- `Tenant` is the publishing destination noun; `TenantHost` is its 1:many child for canonical + alias hostnames.
- `slug` is globally unique — used for subpath URLs (`digital-garden.com/u/<slug>/...`).
- `isPersonal` flag identifies tenants that get a code-driven home (only David's, at first).
- `ownerId` on `Tenant` links to a `User` — every tenant has exactly one human owner. Membership/sharing is a future migration.
- `User.primaryTenantId` is nullable so the migration is non-breaking; backfill populates it; a follow-up migration makes it required.
- `PublicItem.tenantId` is the publishing scope. `PublicItem.ownerId` stays — it identifies who can edit/delete the publication. The two are usually the same user, but the separation keeps "ownership" distinct from "destination."
- **New composite indexes** are critical: every public-route query becomes `WHERE tenantId = ? AND ...`. Without these, the new query pattern would do sequential scans at scale.

### Backfill

Add a one-shot script at `scripts/backfill-tenants.ts` that runs in this order:

1. **For every existing `User`** that owns any `PublicItem` or `PublicPath`:
   - Create one `Tenant` row (`slug` = a derived slug from email/handle, `displayName` = User.name, `isPersonal: true`, `ownerId` = user.id).
   - Set `User.primaryTenantId` = that tenant's id.
2. **For David specifically** (`SITE_OWNER_ID` env), additionally create a `TenantHost` row mapping `davidvalentine.org` → his tenant (`isPrimary: true`).
3. **For every existing `PublicItem` and `PublicPath`**: set `tenantId` = the owner's primary tenant.
4. **Verify no nulls remain** in `PublicItem.tenantId` or `PublicPath.tenantId`. Abort if any found.

Run once locally against dev branch, smoke-test the public surface, then once against prod when shipping.

**Follow-up migration (post-backfill):** A second small migration makes `PublicItem.tenantId` and `PublicPath.tenantId` non-null, and adds a `User.primaryTenantId` non-null constraint (after confirming all users have one). Ship as a separate PR after backfill is verified safe.

### Env var

Add `MULTITENANT_ENABLED=false` to `.env.local` and document in `.env.example`.

### Verification

- `pnpm build` passes.
- `pnpm collab:schema:check` passes.
- `npx prisma studio` shows the new tables.
- Backfill script creates one Tenant row and one TenantHost row.
- No app code reads from these tables yet — site behavior is unchanged.

---

## Phase 2 — Middleware in pass-through mode

Goal: instrument every request with tenant context, without rewriting any paths yet.

### Files to add

- `middleware.ts` (repo root, NOT inside `src/`).

### Behavior

- Read `host` from request headers (strip port for local dev).
- Wrap the resolution in `withSpan('tenancy:host:resolve', ...)` so each request shows up in traces.
- Call `resolveTenant(host)` → returns `{ tenantId, slug, ownerId, isPersonal }`. The helper itself emits `tenancy:tenant:lookup` spans internally.
- Inject two headers into the request: `x-tenant-id`, `x-tenant-slug`.
- Emit `tenancy:host:resolved` (or `tenancy:host:not_found`) with `attrs: { host, tenantId?, slug? }`.
- Pass through to the route — **do not rewrite the URL**.
- If `MULTITENANT_ENABLED=false`, skip the lookup entirely and inject the `SITE_OWNER_ID`-derived tenant (so old code paths see the same headers but routed through the legacy env var).

**Note on middleware + observability:** Middleware runs before `withRouteTrace` opens the route span, so the tenancy span will be a top-level span in the trace, not nested under `route:request`. This is acceptable — middleware is conceptually outside the request handler.

### Matcher config

Exclude paths that don't need tenant routing:

```ts
export const config = {
  matcher: [
    // Run on everything except Next.js internals, Vercel internals, static files, and API auth.
    '/((?!_next/static|_next/image|_vercel|favicon.ico|.*\\..*|api/auth).*)',
  ],
};
```

**Why exclude `/api/auth`:** Session/sign-in routes don't need tenant context and run before a tenant could possibly be resolved for an unauthenticated user.

**Note on API routes:** Most `/api/publishing/*` routes use `session.user.id`, not host-based tenancy — they don't strictly need the header. Including them in middleware is harmless but pays a small lookup cost on every API request. Defer narrowing until we measure.

### Verification

- Visit `http://davidvalentine.local:3015` → site renders normally, server logs show `x-tenant-id` header injected.
- Visit `http://digital-garden.local:3015` → no tenant row exists yet, middleware returns 404 OR (preferred) falls back to a default behavior. Decide: 404 is cleaner, but render an empty "site not configured" page so dev isn't blocked.
- Flip `MULTITENANT_ENABLED=true` locally and confirm the lookup path works.

---

## Phase 3 — Wire public-render routes to query by tenant

Goal: the two single-tenant call sites switch from `ownerId` (env-derived) to `tenantId` (header-derived). With `MULTITENANT_ENABLED=false`, behavior is identical (header still resolves to David's tenant via the legacy fallback).

### Files to modify

- [app/page.tsx](app/page.tsx) — lines 4, 9, 15, 26. Replace `SITE_OWNER_ID` reads with `await getCurrentTenant()` returning `{ tenantId, ownerId, slug, isPersonal, ... }`. Queries change from `where: { ownerId: SITE_OWNER_ID }` to `where: { tenantId: tenant.tenantId }`.
- [app/(public)/[...path]/page.tsx](app/(public)/[...path]/page.tsx) — lines 6, 20, 53, 69, 104–138. Same swap. The `resolvePublicItem` and `resolvePublicPath` helpers refactor to take `tenantId` (not `ownerId`) as their first arg.

### Helper pattern

```ts
// lib/domain/tenancy/get-current-tenant.ts
export async function getCurrentTenant(): Promise<ResolvedTenant> {
  const h = await headers();
  const tenantId = h.get('x-tenant-id');
  if (!tenantId || process.env.MULTITENANT_ENABLED !== 'true') {
    return resolveLegacyTenant(); // reads SITE_OWNER_ID, returns David's tenantId
  }
  return getTenantById(tenantId);
}
```

### Verification

- Flag OFF: davidvalentine.org renders exactly as before. No visual diff.
- Flag ON locally: visit `http://davidvalentine.local:3015` → renders David's content (queried via `tenantId`, not `ownerId`). Visit `http://testuser.local:3015` → 404 (or "site not configured" placeholder).
- Existing authenticated publishing API routes (`/api/publishing/*`) are NOT modified yet — they're addressed in Phase 3b.

---

## Phase 3b — Tenant-scoped publishing API

Goal: writes from the IDE specify a destination tenant. Default to user's primary tenant when the client doesn't specify, so existing single-tenant clients keep working.

### Files to modify

- `app/api/publishing/items/route.ts` (POST) — accept optional `tenantId` in body. Validate that `tenantId` belongs to a tenant where `ownerId === session.user.id`. If omitted, default to `session.user.primaryTenantId`. Persist on `PublicItem.tenantId`.
- `app/api/publishing/paths/route.ts` (POST) — same pattern for path creation.
- `app/api/publishing/items/route.ts` (GET), `app/api/publishing/items/[id]/*` (all), `app/api/publishing/paths/route.ts` (GET), `app/api/publishing/paths/[id]/*` — switch authorization checks from `where: { ownerId: session.user.id }` to `where: { tenant: { ownerId: session.user.id } }`. The user can read/write any PublicItem on any tenant they own.
- `app/api/publishing/scheduled-publish/route.ts` (cron) — iterate over all `Tenant` rows that have items scheduled, instead of a single owner.

### Why keep `ownerId` on `PublicItem`?

It's redundant with `Tenant.ownerId` once tenantId is set, but:
- It enables direct ownership queries without a JOIN.
- It's an audit field — if a tenant is later transferred to another user, you still know who originally created the item.
- Removing it is a separate cleanup, not worth the risk in this PR.

### Verification

- Create a PublicItem via IDE with no `tenantId` in payload → defaults to user's primary tenant.
- Create a second tenant for the same user, then create a PublicItem with the new `tenantId` → succeeds.
- Try to create a PublicItem with another user's `tenantId` → 403.

---

## Phase 4 — Cache tags scoped by tenant *(Route 2)*

Goal: every public render is cache-tagged with the tenant ID, so publish actions on tenant A do not invalidate tenant B's content.

### Files to modify

- `app/(public)/[...path]/page.tsx` — add `cacheTag(`tenant:${tenantId}:path:${fullPath}`)` after tenant resolution.
- `app/page.tsx` — same pattern, `cacheTag(`tenant:${tenantId}:index`)`.
- All publishing API route handlers that mutate `PublicItem`/`PublicPath` — add `revalidateTag(`tenant:${tenantId}`)` (looked up from the affected item, NOT from the session) after the mutation:
  - `app/api/publishing/items/[id]/publish/route.ts`
  - `app/api/publishing/items/[id]/unpublish/route.ts`
  - `app/api/publishing/items/[id]/archive/route.ts`
  - `app/api/publishing/items/[id]/sync/route.ts`
  - `app/api/publishing/items/[id]/schedule/route.ts`
  - `app/api/publishing/paths/route.ts` (POST/PATCH/DELETE)
  - `app/api/publishing/items/route.ts` (POST)

**Why a single broad tag instead of per-item tags:** Simpler to reason about. Per-publish cost of invalidating a tenant's whole tree is small if the tenant has under a few thousand items. Optimize per-item later if needed.

**Critical: invalidate by item's tenantId, not user's primary tenantId.** A user editing an item on their non-primary tenant must invalidate THAT tenant's cache, not their primary's.

### Verification

- Publish an item in the IDE. Visit the public URL on davidvalentine.local — content appears.
- Edit the item, publish again. Public URL reflects the update on next visit (not stale).
- Publish on tenant A. Tenant B's URLs do NOT re-render (no log entries for B's cache misses).

---

## Phase 5 — Static-first published content *(Route 3)*

Goal: public content served from CDN cache by default; pages re-render only when explicitly invalidated.

### Files to modify

- `app/(public)/[...path]/page.tsx` — currently `revalidate = 60`. Bump to `revalidate = 3600` (1 hour) or set to `false` for pure on-demand. Combined with Phase 4's `revalidateTag` calls, the cache busts immediately on publish but otherwise serves from cache.

### Decision point

Two options:
- **`revalidate = 3600`** — Belt and suspenders. Even if `revalidateTag` ever misfires (e.g., a publish action that bypasses the API), the page eventually picks up changes within an hour.
- **`revalidate = false`** — Pure on-demand. Stale forever unless `revalidateTag` is called. Faster, but bugs in invalidation are silent failures.

**Recommendation:** Start with `3600`. Switch to `false` once you trust the invalidation pipeline.

### Verification

- First visit to a public URL: server log shows the render. Subsequent visits within 1 hour: no server log (served from cache).
- Publish an item: `revalidateTag` fires, next visit re-renders.

---

## Phase 6 — Edge Config for tenant resolution *(Route 1 full)*

Goal: replace the DB lookup in `resolveTenant` with an Edge Config read. Drops ~50ms per request to sub-millisecond.

### Prerequisite

Phase 0.3 must be complete (Edge Config store created, `EDGE_CONFIG` env var set).

### Files to modify

- `lib/domain/tenancy/resolve-tenant.ts` — read from Edge Config first. Fall back to DB if the key is missing (handles new tenants not yet synced).
- `lib/domain/tenancy/sync-edge-config.ts` *(new)* — helper that pushes a host→tenant entry to Edge Config. Called from any code path that creates/updates `TenantHost` rows.

### Pattern

```ts
// resolve-tenant.ts
import { get } from '@vercel/edge-config';

export async function resolveTenant(host: string): Promise<ResolvedTenant | null> {
  const cached = await get<{ tenantId: string; slug: string }>(`host:${host}`);
  if (cached) return enrichFromCache(cached);
  // Fallback: DB lookup + sync to Edge Config in the background.
  const fromDb = await prisma.tenantHost.findUnique({ where: { host }, include: { tenant: true } });
  if (fromDb) syncEdgeConfig(fromDb).catch(console.error); // fire-and-forget
  return fromDb ? toResolvedTenant(fromDb) : null;
}
```

### Verification

- After backfilling Edge Config with David's host, log middleware tenant resolution time — should drop from ~50ms to ~1ms.
- Add a new TenantHost row directly in DB (without syncing). First request misses Edge Config, falls back to DB, then writes to Edge Config. Second request hits Edge Config.

---

## Phase 6b — Tenant picker in `CreatePublicItemDialog`

Goal: when a user owns multiple tenants, the publish-creation dialog shows a destination picker. Single-tenant users see no UI change.

### Files to modify

- `CreatePublicItemDialog` (path TBD on `feature/publishing-system` — likely `components/publishing/CreatePublicItemDialog.tsx` or under the publishing extension): add an optional "Publish to" select that lists the user's tenants. Defaults to `user.primaryTenantId`. Hidden if the user owns exactly one tenant.
- `useUserTenants` hook *(new)* — `lib/domain/tenancy/use-user-tenants.ts` — client-side fetch of `/api/user/tenants` (tenants owned by the session user).
- `GET /api/user/tenants/route.ts` *(new)* — returns `{ tenants: Tenant[], primaryTenantId: string }` for the session user.

### Verification

- Single-tenant user: dialog renders identically to before.
- Multi-tenant user: dialog shows a "Publish to" select pre-filled with primary. Submitting passes `tenantId` to the POST endpoint.

---

## Phase 6c — Settings "Sites" page

Goal: self-serve UI for users to create/rename tenants, set their primary, and (admin-validated) attach custom hosts.

### Files to add

- `app/(authenticated)/settings/sites/page.tsx` — list of user's tenants. CRUD UI: create new, rename, delete (with publication check), set as primary, add/remove hosts.
- `components/settings/sites/SiteList.tsx` — list rendering.
- `components/settings/sites/SiteEditDialog.tsx` — create/edit form.
- `components/settings/sites/HostManagement.tsx` — add/remove `TenantHost` rows with verification flow.
- `app/api/user/tenants/route.ts` (POST) — create a new tenant for the session user. Validate slug uniqueness.
- `app/api/user/tenants/[id]/route.ts` (PATCH/DELETE) — rename, set primary, soft-delete (only if no published items).
- `app/api/user/tenants/[id]/hosts/route.ts` (POST/DELETE) — add or remove a `TenantHost` for a tenant the user owns.

**Observability requirements for these routes:** All four API route files must:
- Wrap the handler body in `withRouteTrace(req, { route: "/api/user/tenants/..." }, ...)`.
- Wrap DB mutations in `withSpan('tenancy:tenant:create' | 'tenancy:tenant:rename' | 'tenancy:tenant:delete' | 'tenancy:host:add' | 'tenancy:host:remove', ...)`.
- Emit a corresponding `tenancy:<noun>:<state>` event after each mutation.
- After successfully adding a host, also emit `tenancy:edge_config:sync` (Phase 6 wires the actual sync call).
- Use `logger.warn` for authorization failures (e.g., "user tried to modify another user's tenant"); never `console.*`.

### Settings page styling

Per project conventions ([CLAUDE.md](CLAUDE.md)):
- `"use client"` page
- Glass-0 cards
- `PATCH` to `/api/user/...` endpoints
- Toast feedback via `sonner`
- Inline SVG icons in the settings sidebar (not `lucide-react`)

### Custom-domain claiming flow

Adding a host doesn't automatically point the user's DNS at Vercel — that's their job. Flow:
1. User enters `mysite.com` in HostManagement.
2. UI tells them: "Add a CNAME record from `mysite.com` to `cname.vercel-dns.com`."
3. We mark the host as `pending: true`.
4. A background job (or manual admin verification at first) confirms DNS resolves to Vercel, then sets `pending: false`.
5. Once verified, Edge Config is updated and the host is live.

**For this PR, ship steps 1–3 + a manual admin "verify" button.** Background DNS verification is a follow-up.

### Verification

- Create a tenant via Settings → Sites → "New Site". Confirm row exists in DB.
- Set non-primary tenant as primary → `User.primaryTenantId` updates.
- Try to delete a tenant with published items → blocked with explanatory error.
- Add a host to a tenant → row created with `pending: true`, instructions shown.

---

## Phase 7 — Route group splitting + subpath URLs *(Route 4)*

Goal: David's personal home stays code-driven; everyone else gets a generic index; subpath URL pattern works for digital-garden.com (even though digital-garden.com isn't live yet).

### Files to add/modify

- `app/page.tsx` — refactor to dispatch:
  ```ts
  const tenant = await getCurrentTenant();
  if (tenant.isPersonal && tenant.slug === 'david') return <PersonalHome tenant={tenant} />;
  return <DefaultTenantIndex tenant={tenant} />;
  ```
- `components/home/PersonalHome.tsx` *(new)* — moves the current personal home rendering. Pure server component, no IDE imports.
- `components/home/DefaultTenantIndex.tsx` *(new)* — generic index page (list of root paths + recent items). Reuses the existing query patterns from `app/page.tsx:13-40`.
- `app/u/[slug]/[...path]/page.tsx` *(new)* — subpath route for `digital-garden.com/u/<slug>/...`. Resolves slug → tenant, then renders the same components as `app/(public)/[...path]/page.tsx` but scoped to that tenant.
- `app/u/[slug]/page.tsx` *(new)* — subpath tenant root: renders `DefaultTenantIndex` for that tenant.

### Bundle splitting note

`PersonalHome` and `DefaultTenantIndex` should be separate files so Next.js can code-split them — visitors to davidvalentine.org never download `DefaultTenantIndex`, and vice versa.

### Verification

- davidvalentine.local renders `PersonalHome`.
- `http://localhost:3015/u/david` renders `DefaultTenantIndex` for David (same content, different presentation).
- `http://localhost:3015/u/david/garden/some-note` renders the public note via subpath.
- Inspect Network tab: `PersonalHome` bundle does NOT include IDE / editor code.

---

## Phase 8 — Verification, deployment, rollback

### Local verification checklist (before merge)

- [ ] `pnpm build` passes.
- [ ] `pnpm collab:schema:check` passes.
- [ ] `pnpm typecheck` passes.
- [ ] With `MULTITENANT_ENABLED=false`: davidvalentine.local renders identically to current prod (visual diff against screenshots).
- [ ] With `MULTITENANT_ENABLED=true`: davidvalentine.local renders correctly; testuser.local 404s gracefully.
- [ ] Publishing an item in the IDE invalidates the right cache tag.
- [ ] Public URL serves from cache on subsequent visits.
- [ ] Subpath URL `localhost:3015/u/david/...` works.

### Deployment steps (production rollout)

1. Merge PR with `MULTITENANT_ENABLED=false` set in Vercel prod env. **Deploy code changes only; flag is off; behavior is identical.**
2. Run `scripts/backfill-tenants.ts` against prod (one-shot — creates David's Tenant + TenantHost rows).
3. Push the davidvalentine.org → tenant entry into Edge Config (Phase 6).
4. Smoke-test davidvalentine.org — should still render normally.
5. Flip `MULTITENANT_ENABLED=true` in Vercel prod env. Redeploy.
6. Watch logs for tenant resolution time. Verify davidvalentine.org still renders.

### Rollback procedure

- **If middleware breaks anything**: Set `MULTITENANT_ENABLED=false` in Vercel, redeploy. Site reverts to current behavior. No DB rollback needed (Tenant tables remain, just unused).
- **If schema migration causes issues**: The migration is purely additive (new tables), so reverting code keeps the tables harmlessly present.

---

## Non-goals (out of scope for this plan)

- **digital-garden.com going live.** No DNS, no domain config in Vercel, no marketing page beyond a stub. Separate effort once foundation is proven.
- **Subdomain support** (`<slug>.digital-garden.com`). Deferred — subpath only for now.
- **Tenant-authored homepage builder / template picker / per-tenant theming UI.** Out of scope for this epoch. The default tenant index is server-rendered and not user-customizable in this PR. Architecture leaves a clean dispatcher seam (`app/page.tsx`) and a nullable `Tenant.homeTemplate` placeholder field so a future template engine can slot in without schema migrations.
- **Team membership / shared tenant ownership.** Schema supports a future `TenantMembership` join table, but not built here.
- **Background DNS verification for custom hosts.** Phase 6c ships the user-facing instructions and a manual admin verify button. Automated DNS-resolves-to-Vercel checking is a follow-up.
- **Removing `PublicItem.ownerId` after `tenantId` exists.** Kept for audit trail and direct ownership queries; cleanup is a separate decision.

---

## Files reference

**Will modify:**
- `prisma/schema.prisma` — add `Tenant`, `TenantHost`, `User.primaryTenantId`, `PublicItem.tenantId`, `PublicPath.tenantId`, composite indexes
- `app/page.tsx` — query by tenantId; dispatch to PersonalHome vs DefaultTenantIndex (Phase 7)
- `app/(public)/[...path]/page.tsx` — query by tenantId
- `app/api/publishing/items/route.ts` — accept `tenantId`, default to primary
- `app/api/publishing/items/[id]/*/route.ts` — authorization via tenant ownership; cache invalidation
- `app/api/publishing/paths/route.ts`, `app/api/publishing/paths/[id]/route.ts` — same pattern
- `app/api/publishing/scheduled-publish/route.ts` — iterate by tenant
- `CreatePublicItemDialog` (path now confirmable on `main` post-PR #38) — add tenant picker
- `.env.example` — document `MULTITENANT_ENABLED`, `EDGE_CONFIG`

**Will create:**
- `middleware.ts`
- `lib/domain/tenancy/types.ts`
- `lib/domain/tenancy/resolve-tenant.ts`
- `lib/domain/tenancy/get-current-tenant.ts`
- `lib/domain/tenancy/sync-edge-config.ts` (Phase 6)
- `lib/domain/tenancy/use-user-tenants.ts` (client hook, Phase 6b)
- `lib/domain/tenancy/index.ts` — barrel export
- `scripts/backfill-tenants.ts`
- `components/home/PersonalHome.tsx`
- `components/home/DefaultTenantIndex.tsx`
- `components/settings/sites/SiteList.tsx`
- `components/settings/sites/SiteEditDialog.tsx`
- `components/settings/sites/HostManagement.tsx`
- `app/(authenticated)/settings/sites/page.tsx`
- `app/api/user/tenants/route.ts` (GET, POST)
- `app/api/user/tenants/[id]/route.ts` (PATCH, DELETE)
- `app/api/user/tenants/[id]/hosts/route.ts` (POST, DELETE)
- `app/u/[slug]/page.tsx`
- `app/u/[slug]/[...path]/page.tsx`

**Will reuse (no changes):**
- `lib/database/client.ts` — Prisma singleton
- `next/cache` for `cacheTag` / `revalidateTag` (Next.js 16 native)
- Existing settings page layout / Glass-0 card patterns
- Existing toast helpers (`sonner`)
- `lib/core/logger/` — `withRouteTrace`, `withSpan`, `logger`. Mandatory for all new server code per the Observability Standards section.

---

## Epoch doc migration

This plan currently lives at `.claude/plans/swift-booping-rain.md` — a Claude-side scratchpad. The project's convention for multi-week feature work is one tracked epoch document under `docs/notes-feature/work-tracking/epochs/`, following the pattern of `epoch-15-publishing.md`, `epoch-16-dark-mode.md`, `epoch-17-observability.md`.

**Before implementation starts, promote this plan to `docs/notes-feature/work-tracking/epochs/epoch-18-multi-tenancy.md`** so it's:
- Tracked in git alongside the work it describes
- Referenced from `docs/notes-feature/STATUS.md`
- Discoverable to future contributors / future Claude sessions

The promotion is a copy-with-light-rewrite — match the structure of `epoch-17-observability.md` (which is the most recent and observability-aware template). Keep the implementation sequencing, file references, and verification checklist intact; restructure the prose to match the epoch doc style.

**Suggested next step the user can trigger:** "Promote `/Users/davidvalentine/.claude/plans/swift-booping-rain.md` into `docs/notes-feature/work-tracking/epochs/epoch-18-multi-tenancy.md` following the structure of epoch-17."
