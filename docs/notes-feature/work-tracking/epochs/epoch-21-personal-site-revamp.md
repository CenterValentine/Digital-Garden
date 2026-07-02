---
epoch: 21
title: davidvalentine.org Career Site Revamp
status: planned
started: 2026-06-01
last_updated: 2026-06-01
worktree: /Users/davidvalentine/Code/Digital-Garden/.claude/worktrees/feature+multi-tenancy
branch: feature/personal-site-revamp
---

# Epoch 21: davidvalentine.org Career Site Revamp

## Objective

Reimagine davidvalentine.org as a fully-realized career profile website — portfolio, projects, blog, resume, and an owner-curated nav — while bringing back the distinctive rotating branch-tree hero from the original site. The personal site becomes the testbed for new owner-only features (custom navigation, item-as-home-page) that may later generalize to all tenants but begin life as David-only conveniences.

The publishing system gains its first general-purpose enhancement on top of the multi-tenancy foundation: **path-as-item** (a published item can be designated as the home page of a path), unlocking richly composed `/blog`, `/projects`, etc. landing pages without needing a templated path-home builder.

## Decisions locked (from 2026-06-01 brainstorm)

| Topic | Decision | Rationale |
|---|---|---|
| **Home-page architecture** | Code-driven root (`/`) + optional item-as-home for any path | Site root needs maximum control (tree visualization, custom layout, three.js-class flexibility). Path roots benefit from TipTap composition. Item-as-home reuses the existing publishing block system end-to-end. |
| **Path home payload types** | TipTap content for V1. HTML files + code-driven components + resume entity as future variants of `homeItemId` / `homeRenderer` | Ship one form first to validate the pattern. Other forms become discriminated-union variants once the renderer abstraction is proven. |
| **Owner-curated nav config** | TypeScript module checked into the repo (`lib/personal/nav-config.ts`) | Owner-only by virtue of source-code access. Zero schema, zero admin UI, fully typed, edits via redeploy. Generalize to DB-backed multi-owner if/when a second owner ever wants it. |
| **Tree visual** | Hero-mode rotating tree above the fold, traditional text nav below | Brand statement + discoverability. First-time visitors who don't scroll still see the nav. Wheel-rotation works while tree is in viewport. |
| **Sequencing** | One PR per phase, each independently mergeable | Faster review, lower-risk per ship, allows resume extension to weave in at any phase. |
| **Resume extension** | Parallel-tracked, separate plan doc, merges into whichever phase it lands during | Decoupled timelines. Resume work doesn't block site revamp; site work doesn't wait on resume. |

## Phase plan

### Phase 1 — Personal nav + content surfaces (Foundation)
*One PR. ~6-8h. Ships a usable career site immediately.*

- **`lib/personal/nav-config.ts`** — typed nav config module. Items are one of:
  - `{ kind: 'page', label, href }` (direct link)
  - `{ kind: 'path', label, slug }` (link to a published path)
  - `{ kind: 'item', label, path, slug }` (link to a specific published item)
  - `{ kind: 'external', label, href }` (external link with `rel="noopener"`)
- **`components/personal/PersonalNavBar.tsx`** — server component, reads the config, renders the top nav. Highlights active route via `usePathname` (client-island).
- **`PersonalHome.tsx`** — integrate the nav bar at the top. Restructure the hero placeholder where the tree will land in Phase 3.
- **About / Now / Contact pages**:
  - `app/(personal)/about/page.tsx`
  - `app/(personal)/now/page.tsx`
  - `app/(personal)/contact/page.tsx`
  - Each is a server component for V1 with markdown-authored content inline (extracted to MDX or path-as-item in Phase 2 if it grows).
- Route group `(personal)` — wraps the new personal routes with the nav layout. Public surface stays under `(public)`; this is its sibling for code-driven personal pages.

**Verification**: davidvalentine.org renders new top nav. Clicking nav entries lands on each page. Active state highlights. davidvalentine.org/ still shows current content (tree hero placeholder for now).

### Phase 2 — Item-as-home for paths
*One PR. ~3-4h. Unlocks rich path landing pages.*

- **Schema patch**: add `homeItemId String? @db.Uuid` to `PublicPath` (nullable FK to `PublicItem`). Add reciprocal relation `PublicItem.isHomeOfPaths PublicPath[]` (one item can theoretically be the home of multiple paths — e.g., for hub pages).
- **`app/(public)/[...path]/page.tsx`** + **`app/u/[slug]/[...path]/page.tsx`**: when resolving a path with `homeItemId !== null`, render that item's content INSTEAD of the default list view. Falls back to list when no homeItem.
- **3-dot menu** on a published item gains "Set as home of [path]" / "Unset as home" actions. Action calls `PATCH /api/publishing/paths/[id]` with `{ homeItemId }`.
- **`PATCH /api/publishing/paths/[id]`**: extend to accept `homeItemId` (validate the item belongs to this tenant + this path).
- **Sites settings**: in the path list / hosts expand, show "Home: <item-title>" with a "Change" link when set.

**Verification**: David authors a "Blog index" PublicItem with hero + intro + featured posts using publishing blocks. Designates it as `/blog` home. Visiting `/blog` renders that item's content. Removing the designation reverts to list view.

### Phase 3 — Tree hero (rotating branch tree)
*One PR. ~6-8h. Brings back the distinctive identity asset.*

- **Lift from commit `cfa835c`** (with adaptation to the current repo structure):
  - `lib/personal/tree/branch-builder.ts` (was `apps/web/lib/tree-nav/branch-builder.ts`) — pure geometry, no changes
  - `components/personal/tree/IntegratedCircuitNav.tsx` (was `apps/web/components/client/tree-nav/IntegratedCircuitNav.tsx`) — adapt imports, replace old color helpers
  - `components/personal/tree/NavigationNodeIcon.tsx` — same
- **New wrapper**: `components/personal/HomeTreeHero.tsx`
  - Renders the tree in a fixed-height hero section above-the-fold
  - Wheel-rotation handler ONLY active while the hero is in viewport (Intersection Observer); past the hero, regular page scrolling resumes
  - Auto-scroll ambient progress (preserve original feel)
  - Data source: the same nav-config from Phase 1 (each top-level nav item becomes a branch)
- **`PersonalHome.tsx`**: hero slot becomes `<HomeTreeHero />`. Nav bar stays as fallback affordance below.
- **Reduced-motion preference**: respect `prefers-reduced-motion: reduce` — disable rotation/auto-scroll, render the tree static.

**Verification**: davidvalentine.org/ shows the rotating tree as hero. Wheel rotates it. Scroll past hero → normal scrolling. Clicking a branch leaf navigates to that nav item's destination. Reduced-motion users see a still tree.

### Phase 4 — Project entity (new content type)
*One PR. ~10-12h. Projects become first-class.*

- **New extension `extensions/projects/`** following the existing extension pattern:
  - `manifest.ts` — id, label, surfaces
  - `ProjectPayload` schema field on ContentNode (or as a typed JSON payload extension)
  - Project-specific editor: structured fields (title, role, dates, stack, status, links, hero image, problem statement, outcomes)
  - Project viewer for the IDE
  - Publishing pipeline: project payload renders as a project page with a consistent template (overrideable via item-as-home from Phase 2 if author wants custom)
- **`/projects` path home**: use Phase 2's item-as-home to designate a "Projects index" item showing featured projects + grid of all.
- **Per-project page**: rendered from the ProjectPayload structure.
- **Cross-link**: wiki-links from blog posts to projects resolve to the project's public URL.

**Verification**: David creates 2-3 seed projects in the IDE. They publish to /projects/<slug>. The /projects path home (item-as-home from Phase 2) renders them as a curated index. Blog wiki-links like `[[my-project]]` resolve to the project page.

### Phase 5 — Polish + brand
*One PR. ~6-8h. Distinctive feel.*

- **Typography**: choose 2-3 fonts (display + body + maybe mono), wire via next/font.
- **Color tokens for personal site**: distinct from IDE Liquid Glass system. Earth tones + gold accents (extends the existing gold-primary that already appears in the IDE for "Primary" badges).
- **Site-wide footer** in `(personal)` group: bio blurb, social links, last-updated, RSS link.
- **Custom 404**: tree-themed.
- **OG / Twitter card defaults**: per-path and per-item social preview generation (using @vercel/og or similar).
- **Reading time + word count** on published items (small win; promotes from Slice C of the publishing card backlog).

**Verification**: Site visually distinct from the IDE. OG cards render on link previews. 404 lands on-brand. Footer present on all (personal) routes.

### Resume extension (parallel track)
*Own plan doc. Merges into whichever phase it's ready during.*

Lives at `docs/notes-feature/work-tracking/RESUME-EXTENSION-PLAN.md` (to be drafted separately). High-level: new extension `extensions/resume/` with structured types (Position, Education, Skill, Achievement, Award), an editor that maps cleanly to standard resume sections, a `/resume` path home that uses item-as-home pointing at the resume entity (Phase 2's mechanism), and optional PDF generation. Decision deferred to when the plan is drafted.

## Files / areas reference

### Will create (Phase 1)
- `lib/personal/nav-config.ts`
- `components/personal/PersonalNavBar.tsx`
- `app/(personal)/layout.tsx` (route group wrapper with nav)
- `app/(personal)/about/page.tsx`
- `app/(personal)/now/page.tsx`
- `app/(personal)/contact/page.tsx`

### Will modify (Phase 1)
- `components/home/PersonalHome.tsx` — add nav, restructure hero

### Will create (Phase 2)
- (none — uses existing structure with one schema field)

### Will modify (Phase 2)
- `prisma/schema.prisma` — add `PublicPath.homeItemId` (user-applied)
- `app/(public)/[...path]/page.tsx` — check homeItemId
- `app/u/[slug]/[...path]/page.tsx` — same
- `app/api/publishing/paths/[id]/route.ts` — accept homeItemId in PATCH
- `extensions/publishing/components/sidebar/PublishItemMenu.tsx` — "Set as home" action
- `app/(authenticated)/settings/sites/page.tsx` — show path homes

### Will create (Phase 3)
- `lib/personal/tree/branch-builder.ts` (lifted)
- `components/personal/tree/IntegratedCircuitNav.tsx` (lifted)
- `components/personal/tree/NavigationNodeIcon.tsx` (lifted)
- `components/personal/HomeTreeHero.tsx` (new wrapper)

### Will modify (Phase 3)
- `components/home/PersonalHome.tsx` — hero slot

### Will create (Phase 4)
- `extensions/projects/` (full extension scaffold)
- ProjectPayload schema (user-applied)

### Will create (Phase 5)
- `app/(personal)/_components/Footer.tsx`
- `app/not-found.tsx` (or custom under personal)
- OG image route handlers

## Non-goals (out of scope for Epoch 21)

- Generalizing nav config to multi-tenant (stays owner-only via source-code edits)
- Templated path home pages (item-as-home only; templates are a future option if it proves needed)
- Tenant transfer, memberships, team workspaces
- Analytics / view counts beyond reading-time stat
- A custom CMS-like editor for path home pages — they're authored as regular content items
- Public subdomain registry / discovery UI
- Generalizing the rotating tree as a tenant-customizable widget (stays a david-specific code component)

## Verification (epoch-level)

Each phase has its own per-PR verification. Epoch-level success criteria:
- davidvalentine.org/ has the rotating tree hero
- About / Now / Contact / Projects / Resume / Blog all reachable from top nav
- David can author a blog/projects/anywhere path home as a publishing item with full block composition
- Reduced-motion users get a usable static experience
- The IDE for david is unchanged — personal site is its own surface, no IDE regressions

## Epoch doc migration

This is the source-of-truth plan. Per project convention, also referenced from:
- `docs/notes-feature/STATUS.md` (frontmatter update when Phase 1 starts)
- Each phase's PR description

When new phases or scope items emerge mid-epoch, append to this doc with a dated note rather than scattering across PR descriptions.
