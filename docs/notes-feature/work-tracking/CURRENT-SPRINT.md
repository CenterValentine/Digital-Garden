---
sprint: 55
epoch: 12 (Main Panel Tabs + Split Workspace)
duration: multi-session
branch: epoch-12/sprint-55-wire-blocks
status: complete
---

# Current Sprint Addendum

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
