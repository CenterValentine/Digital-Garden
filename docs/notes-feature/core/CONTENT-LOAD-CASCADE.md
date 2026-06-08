# Content Page Load Cascade — Spec & Remediation Plan

> Status: **DRAFT for approval** (2026-06-07). Authoritative contract for how
> the authenticated `/content` page loads. New features and refactors that
> touch the content surface MUST conform to the cascade and rules below.

## 1. Why this exists

The content page assembles from four independently-hydrating sources
(workspace store, content store, right-sidebar state, panel stores) with no
shared readiness contract. Each consumer renders a best-effort *fallback*
while its prerequisites are still loading. The visible result is a load that
flickers and can wedge:

Observed regression (right "chat" sidepanel):
1. A blank chat paints (component mounts on default state pre-hydration).
2. It regresses to the loading skeleton (stores arrive, remount).
3. The chat is "lost" to **links** (tab resolver falls back because
   `selectedContentType` + persisted `savedTab` aren't ready yet).
4. All sidepanel tabs go **unresponsive** (`selectedContentId` is null in the
   stuck window, so `handleTabChange` early-returns and the main area never
   resolves a content type).

The fix is not one component — it is an **ordered readiness contract**:
render a *loader*, never a wrong default, until a stage's prerequisite is
ready; and abort cleanly on navigation.

## 2. The canonical cascade (load order)

`*` = a sub-surface with its own internal unfurling order (out of scope for
the top-level order, but each must honor §3 rules).

0. **Active workspace settings** — `workspace-store.loadWorkspaces()`.
   THE root. Resolves active workspace (URL `?workspace=` → persisted
   `activeWorkspaceId` → Main) and restores its content snapshot. **Every
   other interface depends on this.** Nothing below may render real (non-
   skeleton) UI until the active workspace id is resolved.
1. **Left sidepanel** * — file tree (with workspace filter if applicable) OR
   the active extension's preference view. Independent of which content is
   active; can load in parallel with stage 0's content restore.
2. **Workspace panel-presence layout** — how many panes and their split
   (single / dual / quad), from the restored workspace.
3. **Active workspace tab presences** — the tab strips, applied into the
   panel layout per the layout rules (which pane owns which tabs). Tab
   presence carries **content id AND title** from the restored snapshot, so
   tabs render **named and immediately clickable** — NO "Loading…" tab label
   and no loader on the tab strip (§3.8). Carrying the id is what makes
   stage-incomplete tab switching possible (§3.6): clicking a tab is just a
   selection change against a known id; the gated cascade re-runs for it.
4. **Active workspace's active content** * — the highest-priority interface.
   The focused pane's active tab's content. No lazy-loading: this renders on
   the critical path. (Hocuspocus attaches here — see §4.)
5. **Active content's sidepanel** * — the right panel, restored to the
   **last-seen view for THIS content** (`right-sidebar-state-store`). Shows a
   **preference loader** until the resolved view's component is ready (§3.4).
6. **Other (non-active) panes' content** — remaining visible panes hydrate
   after the active pane's content + sidepanel.
7. **Bounded preload** — optionally pre-fetch up to **N** most-recently-used
   tabs' content off the critical path, so switching is instant. Strictly
   capped (no "tabaholic" blowup) and never competes with stages 0-5 (§3.9).

> Minor surfaces (status bar, toolbar buttons, breadcrumb, presence avatars)
> are not ordered here — each settles within its own container without
> blocking the stage that owns it.

## 3. Core rules (enforceable requirements)

1. **Loader, not default.** A surface whose prerequisite (workspace id,
   content type, persisted preference) is not yet ready MUST render a
   skeleton/loader for its slot — NEVER a guessed default that later
   "corrects." This is the direct fix for frames 1→3 of the regression.
2. **Single readiness gate per stage.** Each stage exposes one boolean
   "ready" derived from its real prerequisites (e.g. workspace resolved;
   content-store hydrated; right-sidebar store hydrated AND content type
   known). Consumers gate on it; they do not each invent their own race
   guards.
3. **No lazy-loading on the critical path.** The active content (stage 4) and
   its active sidepanel (stage 5) are eagerly loaded in cascade order. Lazy/
   suspense splitting is allowed only for stages ≥6 and for `*` sub-surfaces
   that are not the active one.  For multi-pane layouts, the last-active pane's content is critical-path.
4. **Right panel shows a preference loader** until the resolved view
   (links / outline / tags / chat / publish / properties / extension)
   mounts. The tab buttons are **not clickable until the active sidepanel has
   loaded** (prevents the unresponsive-but-wrong-tab window).
5. **Last-seen sidepanel per content.** Opening any content restores the
   right-panel view the user last had for that content id. Until that
   specific view restores, §3.4's loader shows.
6. **Navigation interrupts loading (must always be responsive).**
   - The user can switch tabs/panes **even while loading is incomplete.**
   - Switching panes mid-flight **aborts further cascading** of the old
     pane's sidepanel and restarts the cascade for the new selection.
   - Selecting a tab within a pane **stops in-progress active-content
     rendering** for the superseded tab — but **in-flight persistence
     (autosave / message persist) MUST complete** (never cancel a write).
   - Sideview tabs remain **non-interactive until the active sidepanel has
     loaded**; everything else stays interactive throughout.
7. **Abortability.** Per-stage async work (content fetch, summary warm,
   sidepanel data) is cancellable (AbortController / cancelled-flag) and is
   cancelled when its selection key changes.
8. **Tabs render ready, not loading.** Tab presence includes content id +
   title in the restored workspace snapshot, so the tab strip paints named
   and clickable from the first frame. Tabs do NOT show a "Loading…" label or
   a per-tab spinner; the *body* (stage 4) owns the loading state, not the
   tab. (If a title is genuinely unknown it falls back to a neutral label,
   not the word "Loading".)
9. **Bounded preload.** Pre-fetching non-active tab content is encouraged for
   instant switching but MUST be: (a) off the critical path (never before
   stage 4 dispatch), and (b) capped to the **N** most-recently-used tabs
   (recommend N≈3-5) to bound memory/requests. No unbounded "preload every
   open tab."
10. **Frugal critical path.** Make zero unnecessary network/expensive calls
    before the active-content fetch is dispatched. Structural frames — left
    panel, right panel, main panel, panes, and sidebar *state shells* — are a
    **prerequisite** for the critical path and must render cheaply and
    synchronously (skeleton frames, no network), so the main-content slot is
    ready to receive its fetch as early as possible. Dedupe overlapping calls
    (e.g. content summary vs. full content) so the same data isn't fetched
    twice on the path.

## 4. Hocuspocus in the cascade

- Mounts **per visible collaborative editor instance** — one provider for
  every *rendered* pane showing a note (`MarkdownEditor` → collaboration
  runtime), scoped to that content. **Never page-global.**
- **Multi-pane / non-focused panes DO collaborate.** Each visible pane gets
  its own provider, so another user's live edits stream into a viewed pane
  **even when it is not the focused pane**. Focus governs only *load
  priority*, not whether collaboration runs:
  - Focused pane's provider connects at **stage 4** (critical path).
  - Other visible panes' providers connect at **stage 6** (after the active
    pane's content + sidepanel) — but they still connect and render live.
  - **Background tabs** (a non-active tab within a pane — not rendered) get
    **no** provider until selected. You collaborate on what's on screen, not
    on tabs you can't see.
- **Non-blocking promotion.** Each editor paints immediately in
  `plainFallback` / `localFallback`; its provider connects afterward and
  promotes `editorMode` `"collaboration-local"` → `"collaboration"`
  (`canonical`). It must never gate first contentful paint of the editor.
  Only for collaborative types (notes).
- **Teardown on navigation** (rule §3.6): switching a pane's active content —
  or hiding a pane via a layout change — tears down that pane's provider
  before the next content's provider mounts.

## 5. Component inventory (content page load)

| Stage | Component / module | Role |
|---|---|---|
| 0 | `app/(authenticated)/content/page.tsx` | Server entry; inlines warm-cache `initialContent` for `?content=` |
| 0 | `app/(authenticated)/content/loading.tsx` | Route-segment skeleton (left tree + editor; right panel omitted by design) |
| 0 | `MainPanelWorkspace` | Client root; mounts the shell + panels |
| 0 | `WorkplacesShellController` | Fires `loadWorkspaces(?workspace)`; persists active workspace |
| 0 | `extensions/workplaces/state/workspace-store` | `loadWorkspaces` → resolve active → `restoreContentWorkspace` + `warmContentSummaryCache` + tree snapshot |
| 0 | `state/content-store` (persist) | panes, tabs, `selectedContentId/Type`; URL + localStorage sync |
| 1 | `LeftSidebar` → `LeftSidebarContent` → `FileTree`/`FileNode` | tree, workspace filter; `FileTreeSkeleton` |
| 1 | `left-panel-view-store` / extension registry | active left view (tree vs extension preference) |
| 2-3 | `ResizablePanels` → `PanelLayout` → `MainPanel` | pane layout + tab strips |
| 4 | `MainPanelContent` | per-tab fetch (`isLoading` → "Loading…"), contentType dispatch, viewers/editor |
| 4 | `MarkdownEditor` + collaboration runtime | note editor; Hocuspocus mount/promote (§4) |
| 5 | `CollapsibleRightPanel` → `RightSidebar` | right-panel shell + collapse |
| 5 | `RightSidebarHeader` + `right-sidebar-state-store` (persist) | tab buttons + per-content last-seen tab; hydration gate |
| 5 | `RightSidebarContent` | mounts `MultiConversationSidebar` / `Outline` / `Backlinks` / `Tags` / `Publish` / `Properties` / extension |
| 3 | tab strip (in `MainPanelHeader`) + restored snapshot | tab id + title carried in snapshot → tabs named & clickable immediately (§3.8) |
| 6-7 | bounded MRU preloader (new) | pre-fetch ≤N recent tabs off critical path (§3.9) |
| — | `warmContentSummaryCache` | backfills any missing titles (must already be in the snapshot, not "Loading…") |
| — | panel stores (`panel-store`, `left/right-panel-collapse`, `right-sidebar-state`) | widths/visibility/collapse, all persisted & hydrating independently |

## 6. Gap analysis (current vs. spec)

- **No shared readiness gate** → every consumer guards independently and
  renders fallbacks (root cause of the regression). Violates §3.1-3.2.
- **Right panel renders the view directly from a best-effort `activeTab`**
  resolved against possibly-empty `availableTabs` → wrong-default flash; no
  preference loader; tabs clickable (but no-op) during the stuck window.
  Violates §3.4, §4-rule 5, §3.6.
- **`activeWorkspaceId` restore** depends on URL param + a localStorage
  fallback (added recently); the cascade must treat "workspace resolved" as
  the gate for everything below (§2.0).
- **No abort-on-navigation** for sidepanel/content cascades. Violates §3.6-3.7.
- **Tab titles flash "Loading…"** because the snapshot/summary isn't carrying
  titles up front. Violates §3.8 — tabs must paint named (and clickable) from
  the snapshot's id+title, with no "Loading" tab label.
- **No bounded preload** and **no explicit frugal-critical-path discipline** —
  structural frames + critical fetch ordering aren't enforced. Targets §3.9-3.10.

## 7. Remediation plan (phased; first pass = full cascade + LCP)

**Phase A — Readiness contract + regression kill (correctness).**
- Introduce a `useContentLoadStage()` / readiness selectors layer: one source
  of truth for `workspaceReady`, `contentStoreHydrated`, `activeContentType`,
  `rightSidebarReady`.
- Right panel: render a **preference loader** until `rightSidebarReady &&
  activeContentType`; gate tab buttons non-interactive until then (§3.4).
  Stop resolving to a default tab pre-readiness.
- Keep navigation responsive: selection changes always allowed; abort the
  superseded sidepanel/content cascade (AbortController + key-change reset),
  preserving in-flight saves (§3.6-3.7).

**Phase B — Cascade ordering.**
- Sequence stages 0→5 against the readiness gate so active content + its
  sidepanel are eager and ordered; non-active panes are deferred to stage 6.
- Carry tab id+title in the restored snapshot so tabs paint ready (§3.8); tab
  switching is a selection change that re-runs the gated cascade (§3.6).
- Confirm Hocuspocus mounts per visible editor — focused at stage 4, other
  visible panes at stage 6 — as promote-only with teardown on nav (§4).

**Phase C — LCP optimization + frugality.**
- Structural frames (L/R/main/panes/sidebar state shells) render cheaply &
  synchronously as a prerequisite, so the main-content slot is ready ASAP
  (§3.10). No network before the active-content fetch is dispatched.
- Prioritize the active content's fetch (server inline already exists for
  `?content=`; extend to the restored active tab on warm reload).
- Dedupe overlapping fetches (content summary vs full content); ensure no
  lazy boundary sits on the critical path (§3.3).
- Add the bounded MRU preloader (≤N tabs, off critical path) (§3.9).
- Defer/parallelize stages 1 and 6.

## 8. Verification

- Repro the 6-frame regression: hard-refresh on a workspace whose active
  content has the **chat** sidepanel selected → it must restore directly to a
  chat *loader* then the chat, never links, never unresponsive.
- Mid-flight nav: during a slow load, switching tabs/panes is immediately
  responsive; the old cascade aborts; saves still complete.
- Hocuspocus: editor paints before the provider connects; switching notes
  tears the provider down.
- Gates: `pnpm typecheck` → `pnpm lint` (≤175) → `pnpm build`; browser
  smoke on `:3017`. Consider a Playwright timing assertion for the cascade.
