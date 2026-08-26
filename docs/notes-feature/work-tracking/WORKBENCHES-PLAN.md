---
status: executing — client stack (store action, selector dwell submenu + hide/unhide + settings card, tri-state scope filter, delete-dialog warning) BUILT 2026-08-24 and typecheck-green; server half blocked on the owner-run workbenches migration (columns parentWorkspaceId + dormantAt), then: workbenches route, guards, delete/purge hooks, clearout cron
created: 2026-08-24
depends_on: feat/file-tree-reference-drawer (scoped tree drops the view-root row)
---

# Workbenches — folder-derived sub-workspaces

A **workbench** is a lightweight workspace derived from a **first-level subfolder of a
view-workspace's root**. Hovering a view workspace in the workspaces dropdown (~1 s)
reveals its subfolders as a submenu; clicking one *materializes* it as a workbench —
panels/tabs behave exactly like a workspace (open/close synced everywhere, tab order +
layout desktop-authoritative, aux surfaces independent), and the file tree scopes to
that subfolder. Users cannot create custom workbenches: folders ARE the vocabulary.

## Design decisions (proposed)

### 1. A workbench IS a `ContentWorkspace` row (child of its parent workspace)

Add one nullable column, `parentWorkspaceId` (self-FK, `onDelete: Cascade`), created
**lazily on first click**. The workbench row sets `isView = true` and
`viewRootContentId = <subfolder id>` — the folder pointer needs no new column.

Why a real row and not JSON under the parent's `settings`:
- `paneState` + `baseUpdatedAt` 409 conflict handling, `layoutAuthority` (desktop-only
  layout coupling, R1–R8), open-intent/claims, offline persistence, and the
  BroadcastChannel/poll sync **all key off a workspace id**. A row inherits every one of
  those behaviors for free; a JSON blob re-implements all of them.
- `activateWorkspace(id)`, URL `?workspace=`, and per-workspace tree snapshots
  (`workspace-tree-state-snapshots`) work unchanged.

Consequences to encode server-side:
- List route returns workbenches nested (or flagged) so the selector can group them
  under their parent and every "all workspaces" surface can exclude them by
  `parentWorkspaceId !== null`.
- Slug: `<parent-slug>--<folder-slug>` (unique per owner; regenerate on collision).
- No settings affordances and **not renameable**: name/icon mirror the folder — the
  ONLY way to rename a workbench is renaming its folder (the selector's inline /
  double-click rename is disabled on workbench rows); no expiration; `isLocked`
  inherited from parent read-only.
- Guard on activation + on workbench creation: target folder must currently be a
  first-level child of the parent's `viewRootContentId` (else 409 → client refreshes
  the submenu).

### 2. Toggle lives with the view toggle; stored in parent `settings` JSON

`settings.workbenches = { enabled: boolean, hiddenFolderIds: string[],
dormantClearoutDays?: number }`, default **on when `isView`** (absent key = enabled,
empty hidden list, 30-day clearout; `dormantClearoutDays` clamped server-side to
1–365). Surfaced in the workspace settings dialog "View" tab under the existing
"Enable as View" switch. No migration needed for the toggle itself. Turning it off
hides the submenu and archives nothing — existing workbench rows go dormant.

### 3. Retarget semantics: **dormant + restorable** (DECIDED 2026-08-24)

When the parent's view root changes, existing workbenches point at folders that are no
longer first-level children.

- **Dormant (chosen).** Dormancy is a *filter, not state*: the submenu lists the
  CURRENT first-level subfolders and joins them to existing workbench rows by
  `viewRootContentId`. Rows that no longer match simply don't render; retarget back (or
  to any parent that contains those folders at level 1) and they reappear with layouts
  intact. Zero data loss, ~zero extra code, no background jobs.
  Cost: invisible rows accumulate — bounded by the dormant-clearout cron (§4).
- **Erase.** Predictable "fresh start", no accumulation — but destroys pane layouts on
  what is often an exploratory retarget, and needs an actual deletion pass + a scarier
  warning. Not recommended.

**Warning dialog** (on retarget, only when ≥1 workbench would go dormant): "Workbenches
under *X* keep their layouts but won't be available until a view containing those
folders is targeted again." One checkbox: "…don't warn again" (localStorage, matching
the expiration-warning pattern in `WorkspaceSelector`).

### 4. Folder lifecycle sync (owner requirement, 2026-08-24)

Workbenches mirror the folder arrangement. The submenu's join (current first-level
subfolders ⋈ workbench rows by `viewRootContentId`) makes *visibility* self-syncing in
every case; the row lifecycle follows the folder's:

- **Folder renamed** → workbench name mirrors on next sync (the name is derived,
  never stored independently).
- **Folder moved out of the view / view retargeted** → dormant (filter drops it;
  restorable, per §3).
- **Folder soft-deleted (trash)** → workbench **archived** in the content-delete
  service, subtree-aware: deleting an ancestor archives every workbench whose folder
  sits inside the deleted subtree. A trash restore restores the join, and the archived
  row reactivates on next activation — layouts survive a trash round-trip.
- **Trash purge (hard delete)** → workbench rows **deleted** in the purge path — the
  existing `app/api/cron/purge-trash` job is the concrete home for the hook; the
  `viewRootContentId` FK (`onDelete: SetNull`) is the backstop, and every read path
  treats a null-`viewRootContentId` workbench as dead.
- **Deleting a folder that backs a workbench** → the file-tree delete confirmation
  gains a warning line naming the affected workbench(es) ("also archives workbench
  *X*"), with emphasis when one of them is currently ACTIVE (that one falls back to
  the parent workspace after the delete).
- **Active workbench loses its folder** (deleted mid-session, possibly from another
  device) → the activation guard plus the workspace-sync poll fall back to the parent
  workspace, reusing the store's existing workspace-not-found fallback.
- **Dormant clearout (cron)** — a daily job under `app/api/cron/` (pattern-match the
  existing `purge-trash` / `notifications-maintenance` / `studio-context-sweep`
  routes), self-healing with no write-path hooks: for each workbench, if its folder is no longer a first-level
  child of the parent's view root and `dormantAt` is unset → stamp it; if it matches
  again → clear it; if `dormantAt` is older than the clearout window → delete the row.
  Window per parent workspace: `settings.workbenches.dormantClearoutDays`, default
  **30 days**, user-overridable up to **365** (clamped server-side). Requires a
  `dormantAt` timestamp column in the P1 migration.

### 5. Dropdown UX (WorkspaceSelector)

- View workspaces with workbenches enabled get a chevron affordance; the submenu
  opens **only via hover dwell (~1 s)** — never on click. Clicking a workspace row
  always targets the WORKSPACE itself: workbenches are a deliberately more acute
  layer behind the dwell, and workspace selection semantics stay untouched. Prefer
  Radix `DropdownMenuSub` with a controlled open + dwell timer over a hand-rolled
  portal; fall back to `useAnchoredMenu` only if Radix fights the existing row
  buttons.
- Submenu rows: folder icon + title for EVERY first-level subfolder; a subtle dot marks
  ones that already exist as workbenches; the active workbench gets the active accent.
  Click → create-if-missing → `activateWorkspace(workbenchId)`.
- **Hide / unhide (owner requirement, 2026-08-24):** right-click (or an overflow "…")
  on a submenu row → "Hide from workbenches", adding the folder id to
  `settings.workbenches.hiddenFolderIds` (synced across devices like any
  workspace-settings write). Hidden folders are filtered from the submenu; hiding the
  ACTIVE workbench first falls back to the parent workspace. When ≥1 folder is hidden,
  a submenu footer shows "N hidden · unhide all" — one click clears the whole list
  (blanket unhide only; no per-folder management UI).
- Data source: the already-fetched tree when fresh, else
  `GET /api/content/workspaces/[id]/workbenches` (subfolders + existing workbench ids)
  fetched on first hover.
- Selector trigger label while a workbench is active: `Parent · Workbench`.

### 6. File-tree scope escape hatch becomes tri-state

`RootNodeHeader`'s bypass dropdown grows from boolean to
`"workbench" | "view" | "root"` (image-3 request): active workbench default =
workbench; picking "view" scopes to the parent's root; "root — show all files"
unchanged. Still ephemeral, reset on workspace change. `LeftSidebarContent`'s
`scopedRootParentId` (added with the root-row removal) already centralizes the remap —
it just resolves to workbench folder / parent view root / null respectively.

## Phases

- **P0 — shipped with the root-row fix (this branch):** scoped tree returns the view
  root's children at top level; all top-level writes remap through
  `scopedRootParentId`; header survives empty views.
- **P1 — schema + server:** `parentWorkspaceId` + `dormantAt` migration (owner-run,
  additive, ships ahead of code); create/list/activate guards; workbench
  normalization in `extensions/workplaces/server/service.ts`; `settings.workbenches`
  normalizer.
- **P2 — selector submenu:** dwell-open submenu, lazy fetch, create-on-click,
  activation, `Parent · Workbench` trigger label, hide-folder affordance +
  "unhide all" footer.
- **P3 — tri-state scope filter:** RootNodeHeader enum + `scopedRootParentId`
  resolution + picker `useWorkspaceViewOptions` gains workbench entries.
- **P4 — lifecycle:** retarget warning dialog, dormancy filter, orphan guard on
  activation, folder-rename mirror, delete→archive + purge→delete hooks in the
  content delete/trash services, delete-confirmation warning for folders backing
  workbenches, active-workbench fallback.
- **P5 — dormant clearout cron:** daily sweep with `dormantAt` stamping; default
  30-day window, per-workspace override ≤ 365 days.

Each phase is independently shippable; P1 needs the migration handed to the owner per
the database checklist.

## Decisions (owner, 2026-08-24)

1. Retarget semantics: **dormant + restorable** (dormancy = submenu filter; erase rejected).
2. Submenu contents: **all first-level subfolders**, lazily materialized; subtle dot on
   ones that already exist as workbenches.
3. Folder lifecycle stays mirrored: soft delete → archive (trash-restorable), purge →
   delete row, move/retarget → dormant (2026-08-24).
4. Submenu hide: per-folder "Hide from workbenches" + blanket "unhide all" footer only
   (2026-08-24).
8. Nesting (2026-08-26): the submenu may descend up to **3 folder layers**
   (`settings.workbenches.maxDepth`, default **1** — opt-in). Workbench rows
   stay FLAT (parent = the top workspace at any depth; nesting is a property
   of the MENU, not the data), hide/reorder work per layer (orders keyed by
   parent folder in `folderOrders`), nested panels carry no header, and the
   nested dwell is 400ms vs the root's 250ms. `createWorkbench` and the
   dormant sweep validate by hop-bounded ancestor walk within the parent's
   current depth budget — lowering the budget makes deeper benches dormant.
5. Workbenches are **not renameable** — renaming happens only by renaming the folder
   (2026-08-24).
6. Submenu opens on dwell only; **a click always selects the workspace itself** — no
   dwell-skip on click (2026-08-24).
7. Dormant clearout cron: default **30 days**, user-overridable up to **365**
   (2026-08-24).

## Open questions (owner)

1. Should a workbench inherit the parent's *items/claims* for open-intent conflicts, or
   claim independently like any workspace (recommended: independent — zero special
   cases)?
