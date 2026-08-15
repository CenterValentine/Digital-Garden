---
sprint: 55
epoch: 12 (Main Panel Tabs + Split Workspace)
duration: multi-session
branch: epoch-12/sprint-55-wire-blocks
status: complete
last_updated: 2026-05-13
---

# Current Sprint Addendum

## August 14, 2026 — Note Window block + clipboard round-trip fixes

**Tree**: main working tree (no branch yet — owner decides branch/PR)
**Status**: All CI gates green (typecheck, lint 149/175, collab:schema, markdown:blocks incl. new HTML-strictness layer, blockid:hygiene [new], extensions); production build verified locally; owner browser smoke pending. **⚠ Hocuspocus redeploy required post-merge** (new `noteWindow` node type — an un-redeployed collab server rewrites it to `unsupportedBlock`).

### Shipped in this arc
- **Note Window block** (`noteWindow`, `/window`, schema 1.15.0): windows any note or sidecar note inline; editable via the pane-identical runtime wiring (new `"note-window"` surfaceKind); presence-gated (shared 10s poller) snapshot mode when the target is live elsewhere; hover-visible refresh / "Sync latest" promote; picker (browse + search + blank-line create-at-top with required name); header rename that renames the actual file; Y.Doc-resident retarget history (copy/paste/duplicate/template-immune); collapsed expand-on-click nesting with depth cap 3 + ancestor-chain cycle guard; windows count as backlinks (+ AI context).
- **BlockIdPasteHygiene** extension (collision-scoped transformPasted re-id, all blockId-bearing types) + unconditional duplicate-route walk + `pnpm blockid:hygiene:check` (wired into build).
- **Bug fix**: mermaid/excalidraw header rename caret loss (title-only fast path via shared `inline-edit.ts` helpers) + blur/Enter commit that PATCHes the real ContentNode title (closes the rename desync).
- **Bug fix**: accordion "▶Title" paste artifact — `contentElement` on accordion/cardPanel/pullQuote parse rules; pullQuote also gained `priority: 51` (was losing its type to StarterKit's blockquote rule on every paste). New norm-free HTML round-trip layer in `validate-markdown-block-safety.ts` pins the class.

### Addendum (same day): ContentTreePicker promotion + pane tab-strip "+"
- Picker promoted to its canonical shared home: `components/content/pickers/ContentTreePicker.tsx` (owner-endorsed pattern). `NoteWindowPicker` is now a thin flavor wrapper (named inline-create rows, "Previously windowed" recents). Config surface: `disabledIds/disabledReason`, `recents/recentsLabel`, `inlineCreateRows`, `holdToCreate`, `eligibleTypes`, `searchPlaceholder`.
- **Pane tab-strip "+"** (`PaneTabAddButton`, mounted in MainPanelHeader after the last tab): click → picker → clicking a row opens that content as a tab in THAT pane; **press-and-hold a row (500ms)** → a blank note titled "Untitled" lands inline at that placement (sibling right after a file via sibling-index move; top of a folder) and opens in the pane — no naming step, user renames via existing affordances.
- Mobile-web-view proofing: hover-revealed Note Window refresh is now always visible under `@media (hover: none)` (hover-reveal is unreachable on touch).
- **🔥 REGRESSION FIX (2026-08-15) — cross-editor window-event leak.** `/mermaid` with N Note Windows mounted inserted a mermaid into EVERY open document (N+1 copies) and created N+1 visualization ContentNodes owned by scattered notes (why "referenced content" looked wrong). Root cause: `create-diagram-block` / `embed-diagram-create` are window-level CustomEvents with NO editor addressing, designed when exactly one MarkdownEditor was ever mounted — every instance (host + each Note Window + each split pane, which likely already had this bug) handled every event. Fix: dispatchers now put their `editor` instance in the event detail; listeners hard-bail unless `detail.editor === editor`. `block-attrs-change` got the same treatment (permissively — unaddressed dispatchers like PropertiesPanel keep broadcast) because blockIds legitimately repeat ACROSS documents (cross-note paste keeps ids), so a blockId-only search can cross-write attrs between two mounted editors. ⚠ Remaining unaddressed window events flagged for the nested-editor examination: `editor-image-upload`, `editor-open-ai-image`, `insert-ai-image`, `insert-ai-audio`, `scroll-to-heading`.
- **Picker create affordance redesign (owner, 2026-08-15):** the per-row "+ New Note" on files wrongly implied "add underneath that content." Now: folders + Root keep the "+ New Note" button ("inside" is their honest semantic); between sibling rows an **insertion gap** appears on hover (emerald line + plus marking the exact slot); clicking creates the note right there. Gaps render only at true sibling boundaries (skipped under an expanded container, where "after" would land below the subtree); faintly visible on touch (`hover:none`).
- **Picker unification + workspace view scope (owner, 2026-08-15):** the Note Window picker and the tab-strip "+" picker are now the EXACT same surface — the Note Window's named-create rows (blank-line required-name flow) were removed in favor of the shared quick-create affordances (folder/scope "+ New Note" + insertion gaps, default title "Untitled"). The **scope row** (root representation) is now a **view switcher**: clicking it lists available workspace views — ordered default-first (the active workspace's view when set, Root otherwise; check mark tracks the current selection) — and selecting one re-fetches the tree scoped via `?workspaceId=` (server resolves `viewRootContentId`). Placement math accounts for scope: top-level rows in a scoped tree parent to the view root, so "create at top of scope" and top-level gaps land inside the view, not at true root. Views come from `useWorkspaceViewOptions()` (workspace store via the core `@/state/workspace-store` re-export seam).
- **Picker interaction refinements (owner feedback on first smoke):** tree starts **fully collapsed**; rows with nested content show a chevron — **single click toggles expansion, double-click picks the container itself** (chosen over hover-to-expand for touch parity); leaf rows pick on single click. **Press-and-hold was tried and REMOVED (2026-08-15)** — its arming hint collided with the click-to-toggle gesture (flash on every folder click). Replaced by an **always-visible "+ New Note" button on every row** (folder → inside at top; file → sibling after) plus a pinned **Root row** (file-tree-style root representation) hosting the same affordance for top-level creation. Quick-created notes get the default title "Untitled"; renaming happens via existing affordances.

- **Height default + persistence (owner, 2026-08-15):** block default height 245. The last height the user sets on any window persists as `editor.noteWindowDefaultHeight` (settings-backed, cross-device) and is applied by both insert paths ("/" command + "+" gutter menu). Recording is transition-only (seeded ref on mount — merely opening a note with a custom-height window never overwrites the default).

### Smoke script (owner)
`/window` in note A → pick note B → type (editable) → open B in a second pane (same tab: both editable) → open B in a second browser tab → window flips to "Live elsewhere" snapshot ≤10s → edit in tab 2, hover-refresh in tab 1 → close tab 2 → editable again → retarget to a folder (sidecar REST; provoke 409 from another tab) → "＋ New note here" lands at top of folder → copy/paste the block → fresh blockId + empty history → duplicate note A → same → publish A → title-only placeholder, no UUID in HTML → window B inside B's windowed view → collapsed → expand = read-only snapshot → cycle → chip → B's links sidebar lists A with "window" badge. **Bug-fix smoke**: type a mermaid title continuously (caret survives) → blur → file tree shows new name; copy accordion (node + native selection) → paste → no stray line; same for cardPanel-with-header and pullQuote-with-attribution. **Picker smoke (both surfaces — tab "+" AND Note Window retarget, now identical)**: picker opens collapsed → single-click a folder toggles it, double-click opens/picks it → click a note → opens/retargets → hover the boundary between two sibling files → emerald insertion gap appears → click → "Untitled" lands in that exact slot → "+ New Note" on a FOLDER row → "Untitled" at top of that folder → "+ New Note" on the SCOPE row → "Untitled" at top of the current scope → **view scope**: click the Root/scope row → list shows [active view first, Root second] when a workspace view is active, [Root first, views after] otherwise → select a view → tree re-fetches filtered to it → create-at-top lands inside the view's root, not true root → rename via tab double-click. **Mobile web view smoke (REQUIRED before PR)**: open on a phone/responsive mode — picker fits viewport + scrolls; tap-to-expand + the per-row "+ New Note" buttons are comfortably tappable; Note Window refresh button visible WITHOUT hover (hover:none rule); tab-strip "+" tappable; rename input usable with software keyboard (warmUpMobileKeyboard).



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
