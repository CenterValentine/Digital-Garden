# Site Pages Composer — Build Plan

**Status:** PLANNED (mockup approved 2026-07-18)
**Branch:** `feature/personal-site-revamp` (worktree `feature+multi-tenancy`)
**Mockup:** https://claude.ai/code/artifact/e4f3e0a3-ebca-4fc7-b813-3006b68b709c (composer-mockup-v1)
**Supersedes:** the JSON textarea at `/settings/site-pages` as the *primary* surface (JSON stays as escape hatch)

## Decisions (locked with owner)

| Decision | Choice |
|---|---|
| Overall shape | Rail (pages+nav) · section composer · sticky live preview · slide-over content picker |
| Content picker | **Grouped list + search** — directories as expandable groups, published items nested, one search box. Both `publicPath:` (bind section) and `publicItem:` (add bound row) are first-class — targeting either is a hard requirement. |
| Preview | **Real iframe in draft mode** — `/results?preview=draft` rendered by the actual page renderer reading the draft config. No parallel HTML approximation. |
| V1 scope | **Results (`/results`, recordList) + Field Notes (`/blog`, gardenCategories)**. Home & Résumé appear in the rail read-only. |
| Emphasis | Tier buttons (Serif/Accent/Bold) on selected word; serializes to the existing emphasis string (`*x*` / `**x**`). No raw asterisks in the UI. |
| Escape hatch | "Edit as JSON" opens the validated JSON editor over the same config. |

## What already exists (do not rebuild)

- `SitePage` model (`tenantId`, `slug`, `title`, `kind`, `navLabel`, `navOrder`, `visibility`, `config Json`) + `@@unique([tenantId, slug])`
- `lib/domain/page-layout/schema.ts` — `sitePageConfig` Zod (recordList / directoryIndex / gardenCategories), `sitePageInput`
- `lib/domain/page-layout/resolve.ts` — `fetchWorkData`, `fetchFieldNotesData`, `fetchGardenData` (compose `resolvePublicPath`; timeline derived from dates)
- `app/api/site-pages/` — GET list, GET/PUT/DELETE per-slug (owner-scoped via `resolveWritableTenantId`, Zod-validated)
- JSON admin at `app/(authenticated)/settings/site-pages/page.tsx` (becomes the escape hatch)
- Docs: `docs/notes-feature/guides/publishing/SITE-PAGES-GUIDE.md`

⚠️ **Known reverted state:** the `WorkResultsPage`/`FieldNotesPage` → resolver wiring was applied earlier and lost to parallel-session churn (uncommitted). S2 re-applies it and **commits immediately**.

---

## Sprint 1 — Draft/publish model + preview seam (backend)

- Add `draftConfig Json?` to `SitePage` (published stays in `config`; `draftConfig` null = no pending edits). Dev: `db push` + `generate`. **Note:** `prisma/` is Edit-tool-protected — apply via anchored script or owner paste, per DATABASE-CHANGE-CHECKLIST.
- Extend resolvers with `{ draft?: boolean }`: draft mode reads `draftConfig ?? config`; only owner sessions may request draft.
- API: `PUT /api/site-pages/[slug]` writes **draftConfig**; new `POST /api/site-pages/[slug]/publish` copies draft→config, clears draft, bumps `updatedAt`, calls `revalidatePath` for the page route (Next 16: `revalidateTag` needs the 2-arg form; `revalidatePath` unchanged).
- Preview auth: same-host iframe shares the session cookie; the page route checks `?preview=draft` + `requireAuth` + tenant ownership before serving draft. Reading `searchParams` opts the route out of ISR for preview requests (published traffic keeps `revalidate = 60`).

**Gate:** typecheck + tsx probe: seed draft ≠ published, resolver returns each correctly by mode; publish endpoint promotes and clears.

## Sprint 2 — Re-wire the two pages (commit this time)

- `WorkResultsPage` takes `data?: WorkData`; inline copy becomes `DEFAULT_WORK_DATA`; `<Emphasis>` parser renders emphasis strings (`name: string`, not ReactNode).
- `FieldNotesPage` takes `cats?: GardenData`; injects `window.CATS` pre-boot and drops static `garden-data.js` when present (engine untouched).
- Mount points in `app/(public)/[...path]/page.tsx` call `fetchWorkData` / `fetchGardenData` with draft flag from `?preview=draft` (+ owner check).
- **Commit at end of sprint** — small, isolated commits so parallel sessions can't silently clobber again.

**Gate:** `pnpm typecheck && pnpm lint`; browser smoke — saved config renders on `/results`, `?preview=draft` shows draft while live shows published; no-config fallback pixel-identical to today.

## Sprint 3 — Composer shell (rail · page header · sections)

- Rebuild `/settings/site-pages` as the composer (components under `components/settings/site-pages/`): pages rail (title/slug/kind/nav pills), page header card (visibility segmented control, "Edit as JSON" opening the existing validated editor over the same config), section cards for all three types with add/remove/reorder (up/down v1; drag later).
- Local edit state + debounced autosave → PUT (draft). Toasts via sonner; Glass-0 cards per settings conventions.
- Nav fields (`navLabel`, `navOrder`) editable in rail. (Consuming them in the public site nav is a follow-up, noted in BACKLOG — PersonalHeader nav is code-driven today.)

**Gate:** save round-trip: composer → PUT draft → reload shows same state; JSON hatch shows byte-equivalent config; lint 0 new warnings.

## Sprint 4 — Content picker (the must-have)

- `GET /api/site-pages/content-index?tenantId=` → `{ directories: [{ path, title, publishedCount, items: [{ slug, title, payloadType, firstPublishedAt, excerpt }] }] }` — grouped, one query pass, reusing tenancy resolvers.
- Slide-over picker: search box filtering directories *and* items; per-directory **Bind directory** (sets `section.bind`) ; per-item **Add row** (appends `{ ref: "publicItem:<slug>" }`).
- Bound sections show the `auto · /path · N posts` source chip; empty directories listed but visually muted.

**Gate:** picker lists real published content; bind/add emit refs that validate against `sitePageConfig`; binding `/blog` shows its posts in the section within one autosave cycle.

## Sprint 5 — Row editor: inherited/override + emphasis

- Row expand: for `ref` rows show inherited values (title/date/excerpt from content-index payload) greyed with `INHERITED` chips; editing a field flips it to `OVERRIDE` (gold) and writes only that key; clearing an override reverts to inherited.
- Emphasis editor for titles/labels: select word → Serif/Accent/Bold tier buttons → serialize to emphasis string. Round-trips `*x*`/`**x**` cleanly.
- Full field coverage: type, year (display) + date (sortable), status enum + statusLabel, blurb, facts pairs, timelineNote, hidden. Garden items: meta/blurb + DNA `sub` pair editor.

**Gate:** emitted config Zod-green for all field combinations; override→clear→inherit round-trip; timeline reorders when dates change.

## Sprint 6 — Live preview + publish loop

- Preview pane: iframe `src=/results?preview=draft` (or `/blog`), remounted (key bump) on autosave success; DRAFT badge; URL bar shows the real path.
- **Publish changes** → POST publish → revalidate → toast; draft chip clears until next edit.
- Polish: unsaved/draft indicators in rail, empty-section connect affordance, reduced-motion respected.

**Gate:** full loop in browser — edit → autosave → iframe updates → Publish → live page (no preview param) shows it; `NODE_OPTIONS=--max-old-space-size=8192 pnpm build` green.

---

## V2 — Home & beyond (queued; starts immediately after V1 ships)

Owner directive (2026-07-18): begin Home as soon as V1 lands. Pre-scoped so V2 starts without a planning round:

1. **Home garden bindings** — the m44 garden home consumes category/content data the same way Field Notes does (`/public/garden/*.js` globals). Same recipe as S2: resolve a `home` SitePage server-side, inject the global pre-boot, static files as fallback. Engine files never edited.
2. **Home composer view** — the rail's read-only Home card becomes editable: intro copy, category → directory bindings, featured items (reuses the S4 picker and S5 row editor as-is).
3. **Sign-in link fix rides along** — replace the hardcoded `https://notetrellis.com/sign-in` in `m44-markup.ts` / `field-notes-markup.ts` with an env-aware URL (root cause of the 2026-07-14 sign-in detour).
4. **Résumé page (growth rings)** — candidate third surface; rings data → recordList-style config with date ranges. Decide at V2 kickoff.
5. **Nav consumption** — PersonalHeader reads `navLabel`/`navOrder` from published SitePages instead of hardcoded links.

## Risks / notes

- **Parallel-session clobbering** — this worktree has other active sessions; commit per-sprint, never leave the wiring uncommitted (bitten twice).
- **Neon dev DB is metered** — keep probes/scripts light; no polling loops.
- **Garden engine is fragile recovered code** — S2 only changes where `window.CATS` comes from; never the engine files.
- **Preview cache** — ensure draft requests bypass ISR (searchParams → dynamic) and publish triggers revalidation, else "Publish did nothing" reports.
- Field Notes counts inherit the `resolvePublicPath` 50-item cap (documented; fine at current scale).

## Pre-merge checklist

- [ ] Gates: `pnpm typecheck` · `pnpm lint` (0 new, ≤175) · full `pnpm build`
- [ ] Migration: `draftConfig` column applied + `prisma generate`; DATABASE-CHANGE-CHECKLIST walked
- [ ] Smoke: JSON hatch ↔ composer parity · bind `/blog` → rows+preview · override/inherit round-trip · emphasis tiers render on `/results` · publish → live change · no-config fallback unchanged
- [ ] Preview auth: draft mode denied for non-owner/anon
- [ ] Docs: SITE-PAGES-GUIDE.md updated for composer · STATUS.md · BACKLOG.md (nav-consumption follow-up)
- [ ] Post-merge: none (no Hocuspocus impact — no TipTap schema change)
