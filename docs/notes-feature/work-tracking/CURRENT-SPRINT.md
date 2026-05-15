---
sprint: 55
epoch: 12 (Main Panel Tabs + Split Workspace)
duration: multi-session
branch: epoch-12/sprint-55-wire-blocks
status: complete
last_updated: 2026-05-13
---

# Current Sprint Addendum

## May 13, 2026 — Dark Mode Epoch Complete

**Branch**: `feature/dark-mode`
**Status**: Functionally complete; awaiting deploy to address production-version-skew collab edge case (see Followups below)

### Implemented

- **Sprint A — Foundation + Editor Surface**: theme provider + `useResolvedTheme()` hook + FOUC-prevention inline script (`lib/features/theme/`); settings UI in `/settings/preferences`; editor surface retrofit; ProseMirror prose CSS pass (body, headings, blockquote, callouts, wiki-link, block system); Liquid Glass surfaces refactored to CSS variables (auto-swap across all 42 callsites)
- **Sprint B — Long-Tail + Third-Party Viewers**: tables (brand-aligned shale/gold), calendar settings buttons, flashcards (panel + review overlay + flip animation polish + minimized edit affordance), settings pages, AI surfaces, people dialogs, common surfaces, admin pages, viewer chrome (Mermaid/Excalidraw/DiagramsNet toolbars); third-party viewer theme propagation (Mermaid, Excalidraw, DiagramsNet override-beats-global, OnlyOffice); hydration mismatch fix via `suppressHydrationWarning` on `<html>`
- **Sprint C — Cleanup + Test Harness**: signed-out / auth pages retrofitted; Playwright harness scaffolded with operational dark-mode coverage (4 signed-out routes, 8 baseline snapshots) + 10 non-operational stubs (auth, editor, file-tree, content, search, extensions); `tests/e2e/README.md` documents conventions; `DevThemeToggle` removed
- **Side quest**: slash command bug for `ExcalidrawBlock`/`MermaidBlock` — root cause was missing client-side registration; restructured to create-then-insert pattern to avoid collab sync race; verified solo dev workflow

### Decisions Locked During Epoch

- Default theme: `system` (follows OS)
- DiagramsNet per-diagram theme override: persists; reset-to-global preserved as future UX
- `/embed/*` honors user theme (overlay seam in light mode is a separate concern)
- Brand canvas stays at `#465E73` (shale-dark) — text colors tuned for it
- Bubble menus + small floating popovers stay always-dark; full-page dialogs follow theme
- Visual regression: minimal Playwright harness operational + stubs scaffolded for other categories

### Verification

- `pnpm typecheck` passes
- `pnpm collab:schema:check` passes
- `pnpm test:e2e` runs 8 passing + 90 skipped (baselines captured)
- Manual visual review across multiple iterations covered editor, dialogs, sidebars, blocks, flashcards, viewers, calendar settings, auth pages

### Known Followups

- **Production deploy of `feature/dark-mode`** unblocks the slash command bug for collaborating clients (server already had `ExcalidrawBlock`/`MermaidBlock`; production client schema needs to catch up)
- **Sanitization nuance**: user flagged that `unsupportedBlock` rewriting is too aggressive for nodes the server schema knows about — consider differentiating "client doesn't render" from "truly unknown" types post-deploy
- **Authenticated dark-mode tests**: 5 `dark-mode/authenticated-routes.spec.ts` tests are stubbed pending an auth fixture (`tests/e2e/_fixtures/auth.ts`) — should sign in a test user and persist `storageState`
- **Sprint C Playwright stubs**: 10 non-operational stub specs across `auth/`, `editor/`, `file-tree/`, `content/`, `search/`, `extensions/` are placeholders awaiting future sprints
- **`ProfileMenu`** (signed-in nav profile dropdown) still has some hardcoded light styles — not in user's testing flow, defer

### Files Touched (Summary)

- New: `lib/features/theme/{provider.tsx,useResolvedTheme.ts,script.ts,index.ts}`, `lib/domain/editor/extensions/blocks/pending-diagram-creates.ts`, `playwright.config.ts`, `tests/e2e/**` (12 specs + 1 README + 1 fixture)
- Major edits: `app/globals.css` (Liquid Glass CSS vars + phantom semantic vars + dark mode rules for headings/blockquote/callouts/tabs/calendar/etc.), `app/layout.tsx`, `app/page.tsx`, `app/(auth)/sign-{in,up}/page.tsx`, `lib/design/system/surfaces.ts`, `lib/domain/editor/extensions-client.ts` (block registration), `lib/domain/editor/commands/slash-commands.tsx`, `components/content/editor/MarkdownEditor.tsx`, all four third-party viewers + their toolbars, ~30 component-level retrofits across panels/dialogs/headers
- Removed: `components/dev/DevThemeToggle.tsx` and its mount

---

## May 4, 2026 — Browser Overlay + Associated Content Foundation

**Branch**: `codex/habit-tracker-block-prototype`  
**Status**: Implemented, awaiting manual overlay/browser smoke test

### Implemented
- Added canonical-first webpage identity and association persistence with `WebResource`, `WebResourceContentLink`, and `WebResourceViewState`
- Added new trusted-install browser-extension APIs for resource context, associations, content tree picking, note/external overlay editing, and overlay view-state persistence
- Broadened the app-side backlinks affordance into a generalized Links panel for notes and external content
- Added app-hosted extension overlay routes for note TipTap editing and external-link metadata editing
- Added an in-page browser overlay content script with a floating Digital Garden launcher, associated-content surface, quick-add connection surface, content-tree association picker, and saved floating/docked/embedded view restoration

### Verification
- `npx prisma generate` passed
- `pnpm typecheck` passed
- `pnpm build` passed
- Additive SQL for the new web-resource schema was applied without destructive table drops
- Manual overlay behavior, iframe loading on live sites, and Chrome/Vivaldi smoke testing still pending

---

## Apr 30, 2026 — Browser Bookmarks Sync Foundation

**Branch**: `codex/epoch-13-people-collab`  
**Status**: Implemented, awaiting manual Chrome/Vivaldi smoke test

### Implemented
- Added bookmark integration persistence in Prisma for browser extension tokens, bookmark sync connections, and per-node sync links
- Added a versioned browser-bookmarks API surface for capability discovery, token lifecycle, connection CRUD, bootstrap, browser push sync, app pull sync, and reading queue queries
- Expanded external reference payloads so bookmarks can carry normalized/canonical URL data, reading status, domain/favicon metadata, capture and match metadata, and preserve-HTML support
- Added a built-in Digital Garden settings page for browser bookmarks under `/settings/browser-bookmarks`
- Added an in-repo MV3 extension scaffold under `extensions/browser-bookmarks/browser-extension/` with popup, options, capture flow, bookmark observers, sync alarm, session capture, and rules import/export

### Verification
- `npx prisma generate` passed
- `pnpm typecheck` passed
- `pnpm build` passed
- Manual Chrome and Vivaldi smoke testing still pending

---

## Apr 29, 2026 — Stopwatch Block Prototype

**Branch**: `codex/habit-tracker-block-prototype`  
**Status**: Implemented, awaiting manual browser smoke test

### Implemented
- Added a new document-local `stopwatch` block with persisted count-up timing, lap capture, and style variants
- Implemented elapsed-time persistence from saved `startedAt`, `accumulatedMs`, and laps so running stopwatches resume accurately across reloads
- Added a dedicated Stopwatch properties panel for title, variant, accent color, lap visibility, and display toggles
- Registered the block in both client and server TipTap extension sets and added `/stopwatch` to slash commands
- Updated schema versioning and export fallbacks so the stopwatch remains readable in HTML, Markdown, and plain text

### Verification
- `pnpm build` passed
- Manual browser smoke test still pending

---

## Apr 28, 2026 — Habit Tracker Prototype

**Branch**: `codex/habit-tracker-block-prototype`  
**Status**: Implemented, awaiting manual browser smoke test

### Implemented
- Added a new document-local `habitTracker` block with `monthly-grid`, `weekly-grid`, and `streak-cards` presets
- Added inline boolean and count interactions with period navigation and computed stats
- Added a dedicated Habit Tracker properties panel for title, preset, week start, display toggles, and habit list editing
- Registered the block in both client and server TipTap extension sets and added `/habit-tracker` to slash commands
- Updated schema versioning and export fallbacks so the tracker remains readable in HTML, Markdown, and plain text

### Verification
- `pnpm build` passed
- Manual browser smoke test still pending

---

# Sprint 55: Block Wiring + UI Fixes + Auth

## Sprint Goal
Wire all Epoch 11 block extensions into the live editor, fix block interaction bugs, and resolve auth/settings regressions introduced by the SettingsInitializer.

**Status**: Complete ✅

## Success Criteria
- [x] `pnpm build` passes
- [x] All 6 layout/content blocks accessible via slash commands
- [x] All 6 form/input blocks accessible via slash commands
- [x] Block Column insert button works (empty columns only)
- [x] Form blocks insertable from Block Column `+` menu
- [x] Rating block clickable (no RangeError)
- [x] Date format setting in Properties Panel (not in block UI)
- [x] Tabs bar scrolls on overflow
- [x] "Save as Template" toolbar button in content header
- [x] OAuth redirect loop fixed (cookie on response object)
- [x] "Failed to fetch settings" on sign-in page fixed (silent 401)
- [x] Merge conflicts with main resolved (11 files — sidebar architecture)
- [x] Properties tab auto-appears in right sidebar when block selected

## Implemented

### Block Extensions (Sprint 55a)
- Registered all 6 content/layout blocks + 6 form/input blocks in `extensions-client.ts` + `extensions-server.ts`
- Added `/block` family + `/input` family to slash commands
- `block-columns.ts` (new): `blockColumns` + `blockColumn` node pair with:
  - `+` button visible only when column is empty (`data-empty="true"` CSS toggle)
  - Column count sync via `syncColumnCount()` in `update()` hook
  - `buildBlockInsertJson` default case now skips `content` for atom blocks

### Block UI Fixes
- **Rating RangeError**: switched `posAtDOM` → `block-attrs-change` CustomEvent
- **Date Input**: moved format selector from block DOM → Properties Panel (changed `displayFormat` to `z.enum()`)
- **Divider + Date Input**: added `showContainer` toggle in Properties Panel
- **Tabs**: added `overflow-x: auto; scrollbar-width: none` for horizontal scroll on overflow
- **Renamed**: "Date Picker" → "Date Input", "Columns" → "Text Columns", "Block Columns" → "Block Column"

### Right Sidebar — Properties Tab
- `state/right-sidebar-state-store.ts`: added `"properties"` to `RightSidebarTab` union
- `RightSidebar.tsx`: auto-switches to Properties tab on block select; reverts to Backlinks on deselect
- `RightSidebarHeader.tsx`: injects Properties tab entry dynamically when block selected
- `RightSidebarContent.tsx`: renders `<PropertiesPanel />` for `activeTab === "properties"`

### Save as Template
- `lib/domain/tools/registry.ts`: added `save-as-template` tool (surfaces: `["toolbar"]`, contentTypes: `["note"]`)
- `components/content/dialogs/SaveAsTemplateDialog.tsx`: dialog with name, default title, category picker + inline create
- `MainPanelContent.tsx`: wired `handleSaveAsTemplate` → `toolHandlers`
- `ContentToolbar.tsx`: added `BookmarkPlus` to icon map

### Auth Fixes
- `app/api/auth/google/route.ts`: set `oauth_state` cookie on `response.cookies` (not `cookieStore`) — ensures cookie attaches to redirect response
- `app/api/user/settings/route.ts`: broadened auth error check to catch `"Authentication required"` + `includes("auth")`
- `state/settings-store.ts`: added silent 401 return — uses defaults, no error logged (fixes sign-in page flash)

## Merge Conflict Resolution
- 11 files merged with `main` (which had the new `useRightSidebarStateStore` per-content-id tab architecture)
- Block files kept with sprint branch changes
- Sidebar files taken from main then Properties tab re-integrated on top

## Notes
- Block Builder modal approach was pivoted — blocks now use inline insertion + right-panel Properties (per memory)
- `pnpm build` passes as of final commit `ab52261`
