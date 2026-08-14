# Layout Intent / Projection — Intent Taxonomy & Infra Plan

**Status:** Taxonomy v1 (this doc) — gating the workspace-infra update.
**Branch:** `feat/layout-intent-projection`.
**Owner rulings so far:** (1) active-tab syncing is **decoupled — device-local**; (2) active workspace selection is **device-local**; (3) phones support single + one orientation-adaptive 2-pane split, and rendering constraints must **never write back** into shared state (no "phone coercion writes"); (4) one rule set, no per-device exceptions — exceptions dissolve by classifying state correctly, not by branching sync.

## 1. Principle

Every piece of "workspace state" is exactly one of four classes:

| Class | Name | Storage | Sync |
|---|---|---|---|
| **I** | **Workspace intent** — what the workspace *is* | Workspace record (server) | ✅ across devices |
| **II** | **Projection** — how *this device class* renders the intent | Nowhere — pure function of (intent, device class, orientation, surface) | ❌ never stored |
| **III** | **Device navigation** — where *this device* is within the intent | Device-local (zustand/localStorage/URL), may be namespaced per workspace | ❌ never synced |
| **IV** | **User preference** — cross-workspace taste | Settings (server, per user) | ✅ via settings |

Rules: **sync intents, derive projections, keep navigation local.** Composition/content = intent. Geometry/arrangement/position = projection or navigation. A projection may read anything; it may write **nothing**.

## 2. What syncs today (audit of `WorkspaceStatePayload`)

`extensions/workplaces/server/types.ts` — pushed by `persistActiveWorkspace()` (`workspace-store.ts:895`, PATCH `/api/content/workspaces/[id]/state`), triggered by `WorkplacesShellController` on every workspace-snapshot change:

| Field | Today | Target class | Note |
|---|---|---|---|
| `layoutMode` | synced | **I** | The intent. Phones render a projection of it; quad remains legal intent everywhere. |
| `activePaneId` | synced | **III** | Owner ruling. Move to per-device slice. |
| `activeContentId` (global) | synced | **III** | "Active tab" — owner ruling. Per-device. |
| `paneTabContentIds[pane].contentIds` | synced | **I** | The tab **set + order** per pane is composition — stays synced. |
| `paneTabContentIds[pane].activeContentId` | synced | **III** | Per-pane active tab — per-device, keyed (workspaceId, paneId). |

Adjacent server-owned intent (unchanged by this plan): workspace identity/name/archive, item assignments & claims (`WorkspaceOpenConflict` machinery), view roots/folder scopes, folder view settings (per-folder config).

## 3. Full state taxonomy

### Class I — Workspace intent (synced)
| Item | Where today | Notes |
|---|---|---|
| `layoutMode` (single / dual-v / dual-h / quad) | content-store → payload | Set from ANY device writes through (incl. phone — a phone user *choosing* a layout edits intent; the phone then renders its projection of it). |
| Pane tab sets + order | content-store → payload | |
| Pinned tabs (`isPinned`) | content-store tab state | Pinning is composition. Verify it round-trips the payload today. |
| Pane content assignment (which note in which pane) | payload | Write-through from projections allowed (composition rule). |
| Workspace membership/claims/scopes | server | Already server-owned. |

### Class II — Projection (derived, never stored, never written back)
| Projection | Surface(s) | Replaces |
|---|---|---|
| quad → 2-pane (panes 1–2 + "2 more" hint) on phones | phone web, shell | the deleted coercion write |
| dual-v ⇄ dual-h orientation mapping | phone web, shell | the deleted rotation write |
| 3-pane shell → single pane + drawers + bottom nav | phone web, shell | (already render-only via `useIsMobile`/`useIsPhone`) |
| Landscape nav auto-hide + focus-mode chrome hiding | phone web, shell | (render-only today — `chromePeek`/`focusMode` are Class III inputs) |
| Forced single-pane, no workspace bar | extension side-panel iframe | today achieved by mounting patterns — must ALSO stop persisting (see §5) |
| Forced single pane + collapsed right sidebar | `/content/focus/[id]` route | today `FocusContentWorkspace` **writes** `restoreWorkspace({layoutMode:"single"})` + `setCollapsed(true)` — ghost writes to replace with a projection input (route → projection) |
| Fullscreen visualization (no chrome) | `/content/*/fullscreen` | render-only today ✓ |
| Right-sidebar auto-collapse under 960px | narrow desktop | today an effect writing collapse store (`ResizablePanels`) — acceptable (writes Class III, not intent) but should become pure projection with the redesign |
| Native-shell chrome hiding (`html[data-native-shell]`) | shell | CSS-only ✓ |

### Class III — Device navigation (local; namespace per workspace where noted)
| Item | Store today | Keying |
|---|---|---|
| Active workspace id | workspace-store (synced-ish via restore flows) | device |
| `activePaneId` | content-store → **synced (to move)** | device × workspace |
| Per-pane active tab | content-store → **synced (to move)** | device × workspace × pane |
| Temporary tabs (`isTemporary`) | content-store (already guarded from URL/localStorage — `content-store.ts:895` comment) | device |
| Tab-title cache (`workspaceTabTitles`), tab preferences, `LAST_SELECTED_KEY`, `?content=` URL param | localStorage/URL | device |
| Sidebar widths & visibility | panel-store (localStorage v3) | device |
| Left/right collapse modes, left view (files/search/…) | collapse/view stores | device |
| Drawer open, `focusMode`, `chromePeek` | mobile-ui-store (ephemeral) | device |
| Tree expansion snapshot | `saveTreeSnapshotForWorkspace` (local) | device × workspace ✓ already |
| Navigation history, search query/results, outline, editor stats | respective stores | device |
| Scroll positions, selection, editor focus | component state | device |

### Class IV — User preference (settings-synced)
Theme, editor preferences, periodic-notes config, etc. **Future candidates:** user-tunable projection parameters (e.g. "phones always open single-pane") — these are preferences *about* projections, not workspace state; they belong in settings, keeping the no-exceptions rule intact.

## 4. Surfaces coverage matrix

| Surface | Intent read | Intent write | Projection | Notes |
|---|---|---|---|---|
| Desktop ≥960px | ✓ | ✓ | identity | baseline |
| Desktop narrow window | ✓ | ✓ | mobile layout via `useIsMobile` | user keeps chosen layout (no phone coercion) |
| Tablet (any orientation) | ✓ | ✓ | identity (all panes) | owner ruling: tablets = full panes |
| Phone web portrait / landscape | ✓ | ✓ (composition only) | dual orientation mapping; quad→dual+hint | coercion writes deleted |
| **Native shell (WebView)** | ✓ | ✓ (composition only) | same as phone web + shell chrome CSS | same web code path; bridge adds nothing stateful |
| **Extension side-panel iframe** (`/embed/panel`) | ✓ | **✗ — must not persist** | forced single-pane, no workspace bar | mounts `MainPanelWorkspace` + real stores today; `WorkplacesShellController` persist path must be inert here (see §5) |
| **Extension overlay iframe** | ✓ | ✗ | projection of panel surface | same embed family; verify which shell controllers mount |
| `/content/focus/[id]` | ✓ | ✗ | forced single + collapsed right | replace today's ghost writes |
| `/mobile` launcher + `/mobile/note/[id]` reader | ✗ (own simple pages) | ✗ | n/a | no workspace state; safe |
| Published/public pages | ✗ | ✗ | n/a | out of scope |

## 5. Known ghost-writers to eliminate (evidence)

1. **Phone coercion effect** — `MobileNotesLayout` `setLayoutMode()` on orientation/quad (PR #113): rendering constraint mutating intent. → delete; replace with projection fn.
2. **Focus route** — `FocusContentWorkspace` `restoreWorkspace({layoutMode:"single"})` + `setCollapsed(true)`: route projection expressed as writes. → projection input.
3. **Embed panel persistence — CONFIRMED** — `/embed/panel` mounts `MainPanelWorkspace`, whose `shellControllers` render gated only on `!isFocusMode` (`MainPanelWorkspace.tsx:716`), and `WorkplacesShellController` (the `persistActiveWorkspace` trigger, registered `extensions/workplaces/client.tsx:13`) therefore runs inside the extension iframe: any tab activity in the panel PATCHes workspace state and, with today's payload, overwrites `activeContentId`/`activePaneId` chosen on desktop. → embed surfaces get a read-only sync mode (no persist controller). Overlay iframe: same family — verify its mount set in the infra pass.
4. **Right-sidebar <960px auto-collapse** — writes a Class III store from a viewport condition; lowest priority (never syncs), fold into projection when touched.
5. **Workspace-sync restore echo** — `restoreContentWorkspace(workspace)` re-applies server payload over live local state (the revert-fight). With III-fields removed from the payload, the echo can no longer fight the device's own navigation.

## 6. Infra update (next step, after owner review)

1. **Split the payload**: `WorkspaceStatePayload` drops `activePaneId` + both `activeContentId`s → they move to a per-device slice (`localStorage`, keyed `dg:ws-nav:{workspaceId}`) with a migration that seeds device slices from the last synced values (no data loss; server keeps ignoring-but-accepting old fields during rollout for stale clients).
2. **`useProjectedLayout()`**: pure fn of (intent.layoutMode, isPhone, isLandscape, surface) consumed by `MainPanelWorkspace`; delete ghost-writers 1–2.
3. **Embed read-only mode**: surface flag (embed/overlay) gates the persist controller.
4. **First-open default** (decision below) for a device that has never opened the workspace.

### Open decisions (owner)
- **D1 — First-open seed:** new device opens a workspace: land on (a) first pane/first tab, or (b) a synced *hint* (`lastActiveContentId` kept server-side as advisory-only, never re-applied to a device with its own slice)? Lean: (b) — cheap continuity without the echo.
- **D2 — Phone layout switcher scope:** phone offers single + the one orientation-appropriate dual in its switcher; quad intent set elsewhere still renders (projected). Confirm switcher should *hide* quad on phones vs. allow setting it blind.
- **D3 — Pane sizes:** Allotment sizes as Class III per device (recommended) vs. Class I synced geometry.
- **D4 — Tree expansion:** stays device×workspace local (today's behavior) — confirm.

## 7. Verification plan (for the infra PR)

- Two-device fight test: phone + desktop on one workspace; rotate phone, switch tabs on both — desktop layout/active tab must never move; tab set changes must appear on both.
- Embed test: change tabs in the extension panel → desktop workspace state unchanged after reload; panel still follows tab-set changes from desktop.
- Focus route: open/leave `/content/focus/x` → workspace layoutMode + right-sidebar state unchanged.
- Reload persistence: per-device slice restores active pane/tab per workspace; fresh device gets D1 behavior.
- Stale client: old app version PATCHing legacy fields must not clobber (server accepts + ignores III fields).
