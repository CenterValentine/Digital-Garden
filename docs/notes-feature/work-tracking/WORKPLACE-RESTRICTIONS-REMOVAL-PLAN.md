---
title: Workplace Restrictions Removal — claims, borrow, share, view exceptions
status: shipped — PR #289 merged 2026-10-09 (7c940cd7); schema drop PR #290 merged (1a538ac5) and applied to prod 2026-10-09 07:05 UTC; Hocuspocus rev 00015-qgc
created: 2026-10-08
branch: refactor/remove-workplace-claims (worktree .claude/worktrees/claims-removal, from origin/main 3f966a0c)
decisions: "D1 keep workplace expiration (owner, 2026-10-08) · D2 MINOR · D3 drop isLocked · D4 no rename"
owner_decision: "Shortcuts and views alone govern content viewing discipline. Remove every content-viewing restriction, warning and blocker in Workplaces — and the tables, routes and logic that exist only to serve them. Never ask the user whether to borrow or share content."
supersedes_parts_of: epoch-14-saved-content-workspaces.md (claims / borrow / share / open-intent)
---

# Workplace Restrictions Removal Plan

> **Read §R (Regression guards) before deleting anything.** Several symbols slated for
> removal do a second job that has nothing to do with restrictions. §R lists each one,
> what replaces it, and the check that proves the replacement holds.

## 0. Decision of record

Workplaces (saved layouts, panes, tabs, views, workbenches, membership) **stay**. The
**ownership layer** built in Epoch 14 — the idea that a workplace *claims* content,
that a locked workplace's claim *blocks* another workplace from opening it, that a
view's root *restricts* what may be opened, and the borrow / share / exception
mechanisms built to soften those blocks — **goes, entirely**. Views keep their one
real job: scoping the file tree to a root folder (plus workbenches derived from it).

What this means for the user after the change:

| Situation | Today | After |
|---|---|---|
| Open a note in workplace B that workplace A "claimed" | Conflict dialog: Borrow / Share / Go there / Cancel | Opens. |
| Open a note outside a view's root folder (tree click, wiki-link, search, daily summary) | "Outside the scope of this view" dialog | Opens as a tab. The tree still shows only the view root. |
| View settings → "View Exceptions" | Pick folders exempted from the view-root restriction | Section removed; nothing to exempt. |
| Tab context menu → "Share permanently" | Mints a shared claim in another workplace | Removed. "Move tab to" stays. |
| Settings → Extensions → Workplaces → "Claimed Content" | Lists / releases / reassigns claims; "N locked workplaces" | Removed. |
| Daily / weekly summary block → open a file | Opens, then auto-borrows for `autoBorrowDurationMinutes` if refused | Opens. Attribute removed. |
| Borrowed-tab expiry badge in the tab strip, "Borrowed tab expired" toast | Shown | Removed. |
| Folder-claim overlap error ("This folder overlaps with existing workspace claims") | Thrown by the assignments route | Route removed. |

Why this is the right call against PRODUCT-PRINCIPLES §1: claims were a *parallel*
container of "what belongs where" next to the folder tree the user already maintains.
Views (a root folder) and shortcuts (a folder's own pointer to content elsewhere) *are*
the folder tree. The claim table was the structure we told users not to build.

### Two things that look related but are NOT in scope (owner to confirm)

1. **Workplace expiration** (`ContentWorkspace.expiresAt`, the "Workspace expiration is
   approaching" dialog, the expiry toast, `cleanupExpiredWorkspaces` archiving expired
   workplaces). That is a *temporary workplace* feature, not a content restriction.
   **Default: keep.** It shares the `BorrowPreset` / `borrowUntilForPreset` helpers in
   `WorkspaceSelector.tsx`; those get renamed to expiry-neutral names, not deleted.
2. **R1 membership** (`ContentWorkspaceTab`, `isPinned`, `/tabs`, `/tabs/move`). That is
   the *open set* — tabs — and is the thing that replaces claims as "what is in this
   workplace". Untouched. (Memory: "claims ≠ tabs"; PR #254.)

---

## 1. Inventory — every file touched, by layer

Legend: **DELETE** = file removed · **GUT** = large section removed · **EDIT** = small change ·
**VERIFY** = read, confirm nothing remains.

### 1.1 Database (Prisma) — `prisma/` is owner-protected; agent stages, owner applies

| File | Action | Detail |
|---|---|---|
| `prisma/schema.prisma` L48–57 | DELETE enums | `ContentWorkspaceItemAssignmentType` (primary/shared/borrowed), `ContentWorkspaceItemScope` (item/recursive). |
| `prisma/schema.prisma` L651–674 | DELETE model | `ContentWorkspaceItem` (and its 3 indexes). |
| `prisma/schema.prisma` L637 | EDIT | drop `items ContentWorkspaceItem[]` from `ContentWorkspace`. |
| `prisma/schema.prisma` L182 | EDIT | drop `workspaceItems ContentWorkspaceItem[]` from `ContentNode`. |
| `prisma/schema.prisma` L620 | EDIT | drop `isLocked Boolean` from `ContentWorkspace` — it existed only to say "this workplace's claims block others" (`resolveOpenIntent` filters candidates on `isLocked: true`; the selector sets it when folder claims exist). |
| `prisma/migrations/<ts>_drop_workspace_claims/migration.sql` | NEW | `DROP TABLE "ContentWorkspaceItem"; DROP TYPE "ContentWorkspaceItemAssignmentType"; DROP TYPE "ContentWorkspaceItemScope"; ALTER TABLE "ContentWorkspace" DROP COLUMN "isLocked";` — generated with `prisma migrate diff`, reviewed, handed to the owner as a script (see §3). |
| `prisma/migrations/00000000000000_baseline/migration.sql` | VERIFY, no edit | Baseline stays as-is; the new migration drops on top. `migration-drift` gate replays history → must reproduce the new schema. |
| `prisma/migrations-archive/...20260407090000_add_content_workspaces/` | no edit | Archive, not replayed. |
| `lib/database/generated/prisma/` | regenerate | `npx prisma generate`; commit if the client is committed (memory: stale committed Prisma client bites). |

**Destructive-migration ordering (opposite of the additive rule):** the code that stops
reading the table deploys **first**; the owner runs `prisma migrate deploy` **after** the
Vercel deploy is live. Until then the orphan table sits untouched — no code references it.
Dropping first would 500 every workspace read on the old deploy.

**Data note:** rows in `ContentWorkspaceItem` are lost by design. They carried no user
content — only "workplace X claims content Y (type, scope, expiry)". Nothing is backfilled.

### 1.2 Workplaces server — `extensions/workplaces/server/`

| File | Action | Detail |
|---|---|---|
| `types.ts` | GUT | Remove `ContentWorkspaceItemAssignmentType` / `ContentWorkspaceItemScope` imports (L1–4), `WorkspaceItemResponse` (L64–72), `items` on `ContentWorkspaceResponse` (L252), `isLocked` (L231), `WorkspaceOpenConflict` (L287–298), `WorkspaceOpenIntentResponse` (L300–312). `contentMeta` doc-comment (L253–260) rewritten: it is no longer "a superset of items", it is the title map for open tabs. |
| `service.ts` | GUT | **Delete:** `getAncestorIds` (L1450, only the gate uses it — confirm with grep before removing), `reachedThroughViewShortcuts` (L1480), `findOverlappingPrimaryRecursiveClaims` (L1504), `resolveOpenIntent` (L1559–1789), `assignContentToWorkspace` (L1791–1879), `unassignContentFromWorkspace` (L1881–1898). **Edit:** `formatWorkspace` (L265–352: drop `items`, `isLocked`; `contentMeta` built from tabs + pane state only), `buildContentLookup` (L436–462: no `covered` set — every open id is looked up), `cleanupExpiredWorkspaces` (L379–412: drop the two `contentWorkspaceItem.deleteMany`, keep workplace-level expiry), `listWorkspaces` / `getWorkspace` (drop `include: { items }`), `duplicateWorkspace` (L602–696: drop the `createMany` of items and the `items` include; drop `isLocked: source.isLocked`), `updateWorkspace` (L698–773: drop `isLocked` handling L723–725), `resetWorkspaces` (L794–825: drop `isLocked: false`), `removeContentFromWorkspaces` (L1063–1115: drop the item `deleteMany`; keep workbench archive + pane-state scrub), the `WorkspaceWithItems` type and every `include: { items … }` block. `workspaceStateHasContent` (L229) — delete if the gate was its only caller. |
| `routes.ts` | GUT | Delete `ASSIGNMENT_TYPES` (L35), `handleResolveWorkplaceOpenIntent` (L203–233), `handleAssignContentToWorkplace` (L701–757), `handleUnassignContentFromWorkplace` (L759–774); drop the `isLocked` field from `handleUpdateWorkplace`'s body parsing (L272); drop the Prisma enum imports (L3–4) and the `resolveOpenIntent` import (L19). |
| `index.ts` | EDIT | Remove re-exports of the deleted handlers/services. |
| `ensure-main.ts` | EDIT | Drop `isLocked` from `REQUIRED` (L25) and the drift comparison (L55). |
| `membership.ts` | VERIFY | No claim references expected (membership is the keeper). |
| `layout-records.ts` | VERIFY | None expected. |

### 1.3 API route files — `app/api/content/workspaces/`

| File | Action |
|---|---|
| `open-intent/route.ts` | DELETE (directory too). |
| `[id]/assignments/route.ts` | DELETE. |
| `[id]/assignments/[contentId]/route.ts` | DELETE (directory too). |
| `[id]/route.ts` | VERIFY — PATCH passes through to `handleUpdateWorkplace`; nothing else. |
| `app/api/integrations/browser-extension/workspaces/route.ts` | VERIFY — grep found no claim references. |
| `app/api/content/content/[id]/route.ts` L1679–1682 | KEEP call to `removeContentFromWorkspaces` (it still scrubs pane state and archives workbenches); the function itself is edited in 1.2. |

### 1.4 Workplaces client state — `extensions/workplaces/state/`

| File | Action | Detail |
|---|---|---|
| `workspace-store.ts` | GUT | **Delete:** `PendingOpenIntent` (L44), `conflict` / `pendingOpenIntent` state (L62–63, L1095–1096, L1232–1233, L2304–2305), `borrowPendingContent` / `sharePendingContent` / `switchToConflictWorkspace` / `cancelOpenConflict` / `assignContentToWorkspace` / `unassignContentFromWorkspace` (signatures L130–152, bodies L2109–2243), `claimToCarry` (L175–182) and its use in `moveTabToWorkspace` (L1390–1410, undo path L1456–1462 — the "Tab moved, but its workplace claim stayed behind" toast goes), `closeReleasedBorrowedTabs` (L851–895 + calls L1121, L2249), `isContentAlreadyInWorkspace` (L844–848), the whole **provisional-open** machinery (`provisionalOpens`, `persistDeferredByProvisional`, `settleProvisionalOpen`, `rollbackProvisionalOpen`, L235–288; the deferral in `persistNow` L1899–1904). **Rewrite `requestOpenContent` (L1999–2107)**: every branch becomes `directOpenContent(contentId, options)` + `persistActiveWorkspace()` — the Main-workspace fast path becomes the only path. Keep the `page-template` and `temp-` short-circuits only if `directOpenContent` needs them (it does not; delete). **Edit:** `updateWorkspace` signature drops `isLocked` (L117, L1707); `urlContentBelongsToWorkspace` (L675) tests `membershipContentIds` ∪ pane-state ids instead of `items`; `warmContentSummaryCache` (L1136) warms from `contentMeta` instead of `items`; `sendContentToWorkspace` doc-comment (L102–112) loses "through the workplace guard". |
| `workspace-sync.ts` L28 | EDIT | Warm the summary cache from `contentMeta`, not `ws.items`. |
| `surface-family.ts` | VERIFY | None expected. |

`state/content-store.ts` — **KEEP** `markLocalOpenIntents` / `getPendingOpenIntents` /
`clearPendingWorkspaceIntents` (L699–760, L2360–2400). Despite the name, these are the
*local-open survives a reconcile write* guard (cold-load fix, 2026-10-04), not the claim
gate. Rename is optional; recommend leaving it to keep the diff honest.

### 1.5 Workplaces UI — `extensions/workplaces/components|shell|settings`

| File | Action | Detail |
|---|---|---|
| `components/WorkspaceConflictDialog.tsx` | DELETE | Entire borrow-vs-share dialog. |
| `components/content/workspaces/WorkspaceConflictDialog.tsx` | DELETE | One-line re-export shim (directory `components/content/workspaces/` goes if empty). |
| `components/BorrowedTabBadge.tsx` | DELETE | |
| `shell/WorkplacesShellController.tsx` | EDIT | Drop the dialog import (L4) and render (L47). If the controller then renders nothing, keep it as the effect host it also is — check L1–46 first. |
| `shell/WorkplacesTabMenuSection.tsx` | EDIT | Delete the "Share permanently" heading + list (L155–178), `shareTargets`, and the `assignContentToWorkspace` selector. "Move tab to" stays whole. |
| `shell/WorkspaceDropTarget.tsx` | VERIFY | Drop targets call `sendContentToWorkspace` / `moveTabToWorkspace`; no claim calls expected, but confirm any copy saying "guard" / "claim". |
| `components/WorkspaceSelector.tsx` (3606 lines) | GUT | **Delete:** `ClaimConflictItem` (L79–87), claim state (L614–630: `claimConflictState`, `claimBorrowPreset/Until`, `claimResolutionInFlight`, `rowBorrowConflictId/Preset/Until`), memos `recursiveFolderClaims` / `recursiveClaimIds` / `manualClaimsDisabledReason` / `manualClaimsDisabled` / `filteredFolderOptions` (L677–730), `selectedFolderId` / `folderQuery` state if only exceptions used them, the claim-conflict effect (L1126–1132), `closeClaimConflictDialog`, `buildClaimConflicts` (L1227–1284), the re-evaluation effect (L1286–1331), `applyFolderClaims` / `queueClaimFlow` / `resolveClaimConflicts` / `resolveSingleClaimConflict` / `applyPendingClaimAfterResolution` / `handleRowBorrowPreset` / `borrowSingleClaimConflict` (L1333–1491), `handleAddManualFolderClaim` / `handleRemoveFolderClaim` (L1750–1785), the **View Exceptions** block in the view tab (L2856–2974), the **"Resolve workspace claim conflicts"** dialog (L3308–~3605), the `Lock` icon renders (L1850, L2127), and the `assignContentToWorkspace` / `unassignContentFromWorkspace` store selectors. **Edit copy:** "Enable as View" description (L2761–2765) → "Scopes the file tree to a folder. Workbenches open its subfolders as their own workplaces."; "Disassemble workspace?" (L3099) and "Duplicate workspace?" (L3173, L3179) lose "Claims will be released / claims will be shared"; expiration note (L2749–2751) loses "when a tab … expires". **Rename:** `BorrowPreset` → `ExpiryPreset`, `borrowUntilForPreset` → `expiryForPreset` (L88, L113; used by the kept expiration-warning dialog L3202–3300 and `handleExpirationWarningPreset` L1620). Afterwards `folderOptions` / `nodesById` / the tree fetch are still needed by the view-root picker (L2804–2852) — keep. |
| `settings/WorkplacesSettingsDialog.tsx` | GUT | Delete `ClaimedContentItem`, `claimedItems`, `availableWorkspacesByClaim`, `handleReleaseClaim`, `handleReassignClaim`, the "Claimed Content" stat card + panel (L206–330), `lockedCount`, `Lock` import; rewrite intro copy (L165–168: "manages your saved layouts, content claims, and overlap reminders"), the disable warning (L340–342: "claim dialogs"), and the reset copy (L356–357: "its content assignments, and claims"). The dialog keeps: active-workspace card, saved-workplaces card, disable notice, reset. |
| `manifest.ts` | EDIT | L9 description: drop "ownership flows, and overlap protection"; L19 settings description: drop "and claimed content". |
| `client.tsx`, `module.ts` | VERIFY | Registration only. |

`components/content/headers/MainPanelHeader.tsx` — EDIT: remove the `BorrowedTabBadge`
import (L34) and render (L869–870).

### 1.6 Editor — the daily / weekly summary block

| File | Action | Detail |
|---|---|---|
| `lib/domain/editor/extensions/blocks/periodic-summary.ts` | EDIT | Remove the `autoBorrowDurationMinutes` Zod field (L83–89), the parameter + call-site (L444, L496), the attr read (L543), and the `addAttributes` entry (L611). Server variants share the file → both change. |
| `lib/domain/editor/extensions/blocks/periodic-summary-open.ts` | EDIT | Delete the post-open borrow (L32–41) and the option; body becomes "if Workplaces is on, `requestOpenContent`, else `setSelectedContentId`". |
| `lib/domain/editor/commands/slash-commands.tsx` | EDIT | Two insert payloads carry `autoBorrowDurationMinutes` — drop. |
| `lib/domain/blocks/properties-renderer.ts` | EDIT | L110 key list and L241 label "Auto-borrow Duration" — drop. |
| `components/content/blocks/PropertiesPanel.tsx` | EDIT | L51 filter hiding the field — drop (nothing to hide). |
| `lib/domain/editor/schema-version.ts` | EDIT | Bump `TIPTAP_SCHEMA_VERSION`. ProseMirror's `computeAttrs` silently drops attrs the spec no longer declares, so stored documents and Y.Docs that carry the old attr load unchanged — no `lib/domain/export/migrations.ts` entry is needed. **Recommend MINOR** with a changelog line; the strict reading ("attr removed = breaking") would be MAJOR + a no-op migration. Owner's call (§4). |
| `pnpm markdown:blocks:check` fixtures | VERIFY | Grep found no fixture carrying the attr; run the gate anyway. |
| Hocuspocus | POST-MERGE | Node spec changed → redeploy via `cloudbuild.hocuspocus.yaml` from a tree matching `origin/main`, verify `/readyz` ×5 (CLAUDE.md rules). Without it the live server keeps declaring the attr — harmless, but drift. |

### 1.7 Shortcut reach — `lib/domain/content/shortcut-targets.ts`

`viewReachRoots` (L91+) and its doc-comment (L5, L89) exist for one caller: the open
guard's "a shortcut in the view brings its target into scope" rule (owner rule 2026-10-05).
With no guard there is no scope to compute. **DELETE** the function and the comment
paragraph. The shortcut *mirror* in the tree (the rest of the file) is unrelated — keep.

### 1.8 CI gate scripts — three in `build`, all assert on the gate

| Script (`package.json` L58, L81–82) | Action | Detail |
|---|---|---|
| `scripts/validate-shortcut-mirror.ts` L548–612 | GUT section | The `viewReachRoots` fixture checks and the three source-scan checks against `service.ts` (`conflictType: "viewScope"`, `reachedThroughViewShortcuts(`, the pre-check regex). Delete that block; keep every other section (mirror, sort, drops). Mutation-test the survivor: the script must still go red on a mirror regression. |
| `scripts/workspace-pane-placement-smoke.ts` L1284–1630 | GUT section | The fake server's `open-intent` + `assignments` handlers (L1298–1301, L1348–1360), the "provisional open" scenarios (held / allowed-slow / refused→cancel / refused→borrow / failing, L1528–1630), `server.assignments`, `intentAnswer`. **Replace with one assertion:** in a non-Main workspace an open creates the tab synchronously and persists (no intent POST ever fires — assert the fetch log contains no `/open-intent`). Everything else in the harness (pane placement, 409-adopt, tab move, undo) stays; the count drops from 132 — record the new count in STATUS. |
| `scripts/workspace-cold-load-smoke.ts` L81–84, L234–235 | EDIT | Drop the `open-intent` stub and the two checks "the claim check ran" / "not left provisional behind a conflict dialog"; replace with "no intent call was made". Note the STATUS lesson about the stub that read as *refused* — it no longer applies; remove that trap from the script's comments too. |
| `scripts/workspace-tab-move-smoke.ts` | VERIFY | DB-backed; grep for `contentWorkspaceItem` / `claim` and remove any seeded claim rows or claim-follows assertions. |
| `scripts/_workspace-window-shim.ts` | VERIFY | Likely untouched. |

### 1.9 Docs

| File | Action |
|---|---|
| `docs/notes-feature/work-tracking/WORKPLACE-RESTRICTIONS-REMOVAL-PLAN.md` | this file; flip `status: shipped` on merge. |
| `docs/notes-feature/STATUS.md` | New top entry (date, PR, gates, migration = DESTRUCTIVE owner-run post-deploy, Hocuspocus redeploy REQUIRED). Historical entries (Aug 6 "folder-scope borrow/share decisions now stick", Oct 3 provisional opens, L553 chores) stay as history — add one line at the top pointing here. |
| `docs/notes-feature/work-tracking/BACKLOG.md` | Delete L354 ("Claims: inherit vs independent"), L1101 goal line and L1110 ("Temporary borrowing with auto-release…") under the Epoch 14 block, or mark them "removed 2026-10 — see plan". |
| `docs/notes-feature/work-tracking/CURRENT-SPRINT.md` | L229, L249: the smoke path mentions "Share permanently" and "the claim follows" — strike those steps. |
| `docs/notes-feature/work-tracking/epochs/epoch-14-saved-content-workspaces.md` | Add a status banner under L12: claims / borrow / share / open-intent **removed 2026-10**, link here. Do not rewrite the historical plan. |
| `docs/notes-feature/work-tracking/WORKBENCHES-PLAN.md` | L26, L39, L191: strike the open-intent/claims mentions and the "inherit claims?" open question (answered: there are none). |
| `docs/notes-feature/work-tracking/AI-V3-CORE-PLAN.md` L72 | Route list names `open-intent` — remove from the list. |
| `docs/notes-feature/core/CONTENT-LOAD-CASCADE.md` | VERIFY — grep for open-intent / provisional; the Oct 3 provisional-open rule may be recorded there. |
| `CLAUDE.md` | VERIFY — no claim/borrow text today; nothing to change unless the extension list description is updated. |
| Docs that say "borrow" in another sense | NO CHANGE: `EREADER-PLAN.md` (Open Library lending), `EXTRACTION-TO-DATABASE-PLAN.md` ("ledgers borrow the data type"), `AI-V3.1-PLAN.md`, `AGENTIC-BROWSING-PLAN.md`, `previews/database-surfaces.html`. |

### 1.10 Not touched (checked)

`mobile/` (only an iOS comment about "reclaims"), `public/blog-engine/` (CSS comment),
`extensions/reader/` ("Purchase or borrow required" is library lending), `lib/domain/ai/`
(no tool reads the claim table), `tests/e2e/` (no claim specs), `prisma/seed.ts`.

---

## R. Regression guards — logic with a second job

Every row is a removal that would break something unrelated to restrictions if done
naively. Baseline before any edit (2026-10-08, origin/main `3f966a0c`): typecheck green ·
lint 0 errors / 151 warnings · `workspace:pane-placement:smoke` 145 ✓ · `workspace:cold-load:smoke`
PASS · `shortcut-mirror:check` OK. Every gate must be green again at the end; the
pane-placement count may only drop by the provisional/claim scenarios it loses (§1.8).

| # | Removed | Its second job | Replacement | Proof |
|---|---|---|---|---|
| R1 | `requestOpenContent`'s gate branches | It is ALSO the open router: `window.__dgWorkspaceOpenGuard` (installed by `installWorkspaceOpenGuard`) diverts every content-store open into it, and it does the immediate `persistActiveWorkspace()` after the open. | **Keep the hook and `isBypassingWorkspaceGuard`.** Every workplace takes today's Main path verbatim: `directOpenContent` then persist. Keep the `page-template` short-circuit (direct open, no persist) and the no-active-workspace short-circuit exactly. Main's path is the most-exercised path in the app, so non-Main converges onto proven code rather than new code. | pane-placement smoke: a non-Main open lands synchronously and the persist fires; no `/open-intent` call is ever made. |
| R2 | Provisional-open machinery (`provisionalOpens`, `settleProvisionalOpen`, `rollbackProvisionalOpen`, the deferral in `persistNow`) | The deferral is the only thing that ever *skipped* a persist. | Delete all of it together. With no provisional opens, `persistNow` simply runs. Leaving the deferral check behind with an always-empty map is dead code, not safety. | Same smoke; the write-coalescing tests (`persistInFlight` / `persistDirty`) are untouched and must still pass. |
| R3 | `workspace.items` in `restoreContentWorkspace` (`urlContentBelongsToWorkspace`) | Cold-load tiebreaker: a `?content=` that "belongs to this workspace" wins as the active tab. | Test against the **open-tab set** (`openTabIds`, which already unions R1 membership). Intended behaviour change: (a) the tiebreaker now also works in Main, where it was silently dead because Main mints no claims; (b) a URL id that is only *claimed* but not open can no longer be elected active — that path re-added a tab "that belongs to no pane", the resurrection the surrounding comments warn about. Move the `openTabIds` declaration above its new use. | cold-load smoke stays green; reconcile mode still passes `allowUrlActiveFallback=false`, so no resurrection on poll. |
| R4 | `items` → `contentMeta` titles in `formatWorkspace` / `buildContentLookup` | Claim rows carried titles inline, so `buildContentLookup` skipped looking those ids up. | `buildContentLookup` looks up **every** open id (pane blob ∪ membership). One query either way; it only returns early when nothing is open. | A tab opened in a non-Main workplace still paints named after reload (manual smoke §2). |
| R5 | `warmContentSummaryCache` (store `loadWorkspaces`, `workspace-sync.ts`) | None in practice: `lib/domain/content/content-summary-cache.ts` is **write-only** — `getContentSummary` / `purgeContentSummaryCache` have zero callers (grepped 2026-10-08). Its only input was claim rows. | Delete the two warm calls and the module. Behaviour-neutral. A stale `dg-content-summary-cache-v1` localStorage key may linger in browsers; it is never read. | typecheck + repo grep for `content-summary-cache` returns nothing. |
| R6 | `claimToCarry` + claim halves of `moveTabToWorkspace` and its Undo | Undo also reverses membership and re-opens the tab in its pane, adopting `lastAppliedUpdatedAt` so the reopen cannot 409 against the undo's own bump. | Remove only the claim lines (`claim`, `claimCarried`, both `assignContentToWorkspace` calls, the "claim stayed behind" toast). Membership move, Undo membership move, the `lastAppliedUpdatedAt` adoption, and the follow/close branches stay byte-for-byte. | pane-placement smoke's move/undo scenarios; `workspace:tab-move:smoke` (DB-backed). |
| R7 | `cleanupExpiredWorkspaces` | Archives **expired workplaces** — the kept expiration feature (D1). | Delete only the two `contentWorkspaceItem.deleteMany` calls; the archive becomes a single `updateMany`. | Manual smoke §2.7. |
| R8 | `removeContentFromWorkspaces` | Called from the content DELETE route: scrubs the deleted id from every stored pane state and archives workbenches under it. | Delete only the item `deleteMany`. Keep the function, its name and the route call. | Delete a note open in a workplace → its tab does not resurrect on reload. |
| R9 | `getAncestorIds`, `workspaceStateHasContent` (server), `viewReachRoots` | Checked: every caller is inside the gate (`resolveOpenIntent`, `findOverlappingPrimaryRecursiveClaims`) or the gate's CI assertion. The selector has its OWN `workspaceStateHasContent` used only by `buildClaimConflicts`. | Delete all four. | typecheck. |
| R10 | Expiry presets in `WorkspaceSelector` (`BorrowPreset`, `borrowUntilForPreset`) | Shared with the KEPT "workspace expiration is approaching" dialog. | Rename to `ExpiryPreset` / `expiryForPreset`; do not delete. Delete the claim-only state that used them (`claimBorrow*`, `rowBorrow*`). | Expiry dialog presets still set the time. |
| R11 | `folderOptions` / `nodesById` / tree fetch in the selector | Also feed the **view-root picker**. | Keep. Delete only `folderQuery`, `selectedFolderId`, `filteredFolderOptions` if nothing but View Exceptions reads them (verify with grep after the block is gone). | View-root picker still lists folders. |
| R12 | `markLocalOpenIntents` / `getPendingOpenIntents` / `clearPendingWorkspaceIntents` (content store) | **Not the gate.** They protect a locally opened tab from being erased by a reconcile write (cold-load fix 2026-10-04). Shares the word "intent" only. | Untouched (D4). | cold-load smoke. |
| R13 | `periodic-summary` `autoBorrowDurationMinutes` attr | Stored in existing documents and Y.Docs. | ProseMirror's `computeAttrs` builds attrs from the spec only, so an undeclared stored attr is dropped on load, never an error; the unsupported-content sanitizer acts on unknown *node types*, not attrs. Bump `TIPTAP_SCHEMA_VERSION` MINOR (D2). Redeploy Hocuspocus after merge so server and client schemas agree. | `collab:schema:check`, `markdown:blocks:check`; open an existing note containing a daily summary. |
| R14 | Workspace `isLocked` | `ensure-main.ts` compares it to decide whether Main needs a repair write. | Remove it from `REQUIRED` and the comparison in the same edit — leaving one side would make every list request "repair" Main forever, bumping `updatedAt` and restarting the 15 s poll loop the file's comment warns about. Until the owner applies the schema change the column still exists with default false; no code reads or writes it. | Two consecutive workspace LISTs leave Main's `updatedAt` unchanged. |
| R15 | Gate scripts that assert on gate source text | `validate-shortcut-mirror.ts` also guards the tree mirror; the two workspace smokes also guard pane placement, 409-adopt, cold-load ownership, move/undo. | Delete only the claim/intent/provisional sections; replace each with a negative assertion (no `/open-intent` fetch). Mutation-test: put a fake intent POST back into `requestOpenContent` → both smokes red; break a mirror rule → shortcut-mirror red. | §3 step 5. |

### Schema handoff (owner-run; `prisma/` is agent-gated by design)

This branch removes every **reader and writer** of the claim table and `isLocked`; the
generated client still knows them, nothing calls them. The owner applies the schema edit +
migration in this PR before merge (the `migration-drift` gate needs both together) and runs
`prisma migrate deploy` on prod **after** the Vercel deploy is live. The exact script is in
the PR body.

## 2. Behaviour contract after removal (what the smoke must show)

1. In a **non-Main** workplace, clicking any file in the tree opens it instantly with no
   network round trip before the tab exists, and no dialog ever appears.
2. In a **view** workplace, the tree shows the root folder only; a wiki-link / search hit /
   daily-summary link to content *outside* the root opens as a tab. (The tree does not
   reveal it — that is the view doing its job, not a restriction.)
3. "Move tab to" still moves membership; no "claim stayed behind" toast exists.
4. Duplicate / Disassemble / Reset copy mentions tabs and layouts only.
5. Settings → Workplaces shows two stat cards and no "Claimed Content".
6. The daily summary block's property panel has no "Auto-borrow Duration".
7. Temporary (expiring) workplaces still warn before and archive at expiry (kept feature).
8. A second window on the same workplace receives tabs via poll / 409-adopt unchanged.

---

## 3. Execution order

1. **Branch** `refactor/remove-workplace-claims` in `.claude/worktrees/claims-removal`
   (copy `.env.local`, real `pnpm install`, never a node_modules symlink).
2. **Schema first, locally:** edit `schema.prisma`; `SHADOW_DATABASE_URL=… npx prisma migrate dev --name drop_workspace_claims`; review SQL; `npx prisma generate`. Typecheck now lights up every consumer — that list must match §1 exactly (anything extra = a stone this plan missed; add it here).
3. **Server** (1.2, 1.3) → **store** (1.4) → **UI** (1.5) → **editor block** (1.6, schema-version bump) → **shortcut reach** (1.7) → **gate scripts** (1.8).
4. **Gates, in order, with `set -o pipefail`:** `pnpm typecheck` → `pnpm lint` (ratchet 175; this PR should *lower* the count — note the new number) → `pnpm shortcut-mirror:check` → `pnpm workspace:pane-placement:smoke` → `pnpm workspace:cold-load:smoke` → `pnpm workspace:tab-move:smoke` (needs local Postgres) → `pnpm markdown:blocks:check` → `pnpm collab:schema:check` → `pnpm extensions:check` → `NODE_OPTIONS='--max-old-space-size=8192' pnpm build`.
5. **Mutation-test the three edited gates** (commit first; `git checkout -- .` between mutants): re-introduce a fake `/open-intent` fetch in `requestOpenContent` → both workspace smokes must go red; break a mirror rule → shortcut-mirror must go red.
6. **Repo-wide final sweep** — must return nothing outside this plan file and historical docs:
   `grep -rIn -iE 'borrow|assignmentType|open-intent|OpenIntent|WorkspaceOpenConflict|contentWorkspaceItem|ContentWorkspaceItem|isLocked|claimToCarry|provisionalOpen|BorrowedTabBadge|WorkspaceConflictDialog|autoBorrow|viewReachRoots|View Exceptions|Share permanently|Claimed Content' --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=generated --exclude-dir=.claude --exclude-dir=archive .`
   (then subtract the known non-workplace "borrow" hits listed in 1.9 / 1.10).
7. **Docs** (1.9) in the same PR — no docs-only PRs.
8. **PR** titled `refactor(workplaces): remove content claims, borrow/share prompts and view exceptions`, framed as an improvement (opens are instant everywhere; one fewer table; one fewer dialog). Pre-merge checklist + **post-deploy checklist**:
   - [ ] Vercel deploy live
   - [ ] Owner runs the migration (script handed over: `npx prisma migrate deploy` — destructive, AFTER deploy)
   - [ ] Hocuspocus redeploy from a tree matching `origin/main`; `/readyz` ×5
   - [ ] Browser smoke of §2 on production
9. **STATUS / BACKLOG / CURRENT-SPRINT** updated; this plan flipped to `shipped`.

---

## 4. Owner decisions (resolved 2026-10-08)

| # | Question | Recommendation |
|---|---|---|
| D1 | Keep workplace **expiration** (temporary workplaces + the approaching-expiry dialog)? | **Kept — owner, 2026-10-08.** It is a workplace-lifetime feature, not a content restriction. |
| D2 | `TIPTAP_SCHEMA_VERSION` bump for the removed block attr: MINOR or MAJOR? | **MINOR.** Old documents load unchanged because ProseMirror drops undeclared attrs; no export migration is needed. |
| D3 | Drop `ContentWorkspace.isLocked` in the same migration? | **Yes.** It has no meaning without claims; leaving it is a trace. |
| D4 | Rename `state/content-store.ts`'s `markLocalOpenIntents` family (not the gate, but shares the word "intent")? | **No.** Keep the diff about the removal; rename later if the name misleads. |

---

## 5. Lessons this removal should record (for STATUS)

- The provisional-open machinery (PR #279) was the cost of keeping a gate *and* instant
  opens. Removing the gate removes the machinery: the fastest check is the one you don't run.
- Three CI scripts had hard-coded assertions on the gate's *source text*. That style of gate
  (scan `service.ts` for a string) protects a rule well but must be found and retired with
  the rule — this plan lists them so the next removal knows to look.

---

## 6. Execution record (2026-10-08)

Branch `refactor/remove-workplace-claims`, five commits on `origin/main 3f966a0c`. Every
§1 item done; deviations and finds below.

**Found during execution (not in the §1 inventory):**
- `lib/domain/content/content-summary-cache.ts` — write-only, its only input was claim rows → deleted with `WorkspaceContentSummary` (R5).
- The **server** `dailySummary`/`weeklySummary` node declares its own attrs; the client edit alone left `autoBorrowDurationMinutes` on the Hocuspocus schema. Caught by the §3 step-6 sweep.
- Mutation and 409-adopt responses (`updateWorkspace`, `duplicateWorkspace`, `saveWorkspaceState`) now resolve tab titles via `formatWorkspaceWithTitles` — the claim join used to supply them (R4).
- `manifest.surfaces` loses `"global-dialog"` (the conflict dialog was the extension's only dialog; nothing reads `surfaces`). `useTabMoveTargets` stops returning `topLevelWorkspaces` (share-only). The selector's `collectFolderOptions` returns folders only; `foldersLoading`, `nodesById`, folder search scoring and the Popover import went with View Exceptions.
- The cold-load `?content=` tiebreaker was **never pinned** — under claim gating it never fired in the smoke. Pinned now (3 checks), see R3.

**Gates (all green):** typecheck · lint 151 (baseline 151, 0 errors) · `workspace:pane-placement:smoke` 135 (145 − 13 gate-only + 3 contract) · `workspace:cold-load:smoke` (+3) · `workspace:tab-move:smoke` · `workspace:ensure-main:smoke` · `shortcut-mirror:check` · `collab:schema:check` · `markdown:blocks:check` · `extensions:check` · `private:content:check` · `note-edit:check` · `polling:check` · full `pnpm build` (BUILD EXIT 0; route table has no `open-intent` / `assignments`).

**Mutation run** (committed tree, `git checkout -- .` + `git diff --quiet` per mutant):

| Mutant | Result |
|---|---|
| M1 an intent POST returns to `requestOpenContent` | pane-placement RED · cold-load RED |
| M2 an open stops persisting at once | cold-load RED (pane-placement persists explicitly — expected survivor) |
| M3 URL tiebreaker disabled | cold-load RED (after the new checks; survived before them) |
| M4 shortcut-mirror carry broken | shortcut-mirror RED |

First run was void: macOS has no `timeout`, every gate exited 127 and printed as "caught". The harness now reports 127 separately.

**Schema handoff (owner-run).** Canonical SQL from `prisma migrate diff --from-schema prisma/schema.prisma --to-schema <target>` (Prisma 7.2.0); target schema validated:

```sql
-- DropForeignKey
ALTER TABLE "ContentWorkspaceItem" DROP CONSTRAINT "ContentWorkspaceItem_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "ContentWorkspaceItem" DROP CONSTRAINT "ContentWorkspaceItem_contentId_fkey";

-- AlterTable
ALTER TABLE "ContentWorkspace" DROP COLUMN "isLocked";

-- DropTable
DROP TABLE "ContentWorkspaceItem";

-- DropEnum
DROP TYPE "ContentWorkspaceItemAssignmentType";

-- DropEnum
DROP TYPE "ContentWorkspaceItemScope";
```

Not verified locally: the history-replay drift check (`--from-migrations` into the shadow DB). Local Docker stopped answering mid-session (P1001; `docker ps` hung), and restarting it was left to the owner. CI's `migration-drift` job runs the same check on the PR.

**Deploy order:** merge → Vercel deploy live (code no longer reads the table) → `prisma migrate deploy` on prod (direct, non-pooling URL) → Hocuspocus redeploy (TipTap 1.21.0) → owner smoke (CURRENT-SPRINT Oct 8).

**Shipped (2026-10-09):** PR #289 merged `7c940cd7`; Vercel production live; Hocuspocus rev `00014-smp`, then `00015-qgc` from `1a538ac5` so #287's collaboration fix (merged in between) was included, not masked. Schema drop PR #290 merged `1a538ac5`; `prisma migrate deploy` on prod applied `20261008000000_drop_workspace_claims` at 07:05 UTC. Read-only verification: the table, the `isLocked` column and both enums are gone; 63 workplaces and 98 open tabs intact. Trap hit on the way: the first run came from a main checkout parked at `c48218d3`, whose `prisma/migrations` lacked the drop, so `migrate deploy` reported nothing pending and looked like success — run migrations from a tree at `origin/main` and verify the `_prisma_migrations` row afterwards.

