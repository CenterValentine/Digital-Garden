---
sprint: 55
epoch: 12 (Main Panel Tabs + Split Workspace)
duration: multi-session
branch: epoch-12/sprint-55-wire-blocks
status: complete
last_updated: 2026-05-13
---

# Current Sprint Addendum

## October 8, 2026 — A collaborator joining no longer duplicates a note; nested shortcuts show in workbenches

**Tree**: worktree `.claude/worktrees/join-dup`, branch `fix/join-dup-nested-shortcuts` (off `origin/main` at `3f966a0c`)
**Status**: typecheck / lint 151 (0 errors, none new) / `collab:lineage:check` (new; in `build`, preflight and the collaboration-hardening workflow; mutation-tested 15 ways) / `shortcut-mirror:check` (nested-in-a-view cases; mutation-tested 3 ways) / `pnpm build` green; no schema, TipTap or extension change; **Hocuspocus redeploy required after merge** (`documents.ts` load path).

### Shipped
- **Loads catch up on the stored lineage** (`lineage.ts` `catchUpStoredCopy`): a payload newer than the mirror stamp is applied onto the stored Y.Doc as a diff — never a fresh seed — under a per-document advisory lock, and the stamp is written as of the payload's `updatedAt` (left unchanged: opening is not editing). Two loads a moment apart (canonical fetch + Hocuspocus) used to mint two rival copies.
- **Solo saves carry their Y copy** (`SaveMeta.collaborationUpdate`, `noteSaveBody`): merged into the stored copy before the payload is written (`mergeSoloCollaborationCopy`), payload stamped only when merged; a rival copy is refused; over-size copies are left out (never fail the save).
- **Rival copies in a browser align before the first connect** (`alignLineageBeforeFirstConnect`): adopt when the server's copy already shows everything, adopt-and-re-apply when the browser's only adds, otherwise connect as before and log `collab:lineage_rival`.
- **Nested shortcuts in a workbench**: `outOfScopeShortcutTargets` follows shortcuts inside carried folders (cycle-safe); carried targets inside other carried folders travel inside them.

### Smoke checklist (owner)
- [ ] **Join after solo editing:** account A opens a note alone and types two new lines, waits ~3 s; account B (or a second browser profile) opens the same note → both see the note once, the two new lines once.
- [ ] **Join, then edit live:** with A and B both on the note, each types a line → each line appears once on both sides; reload both → still once.
- [ ] **Metadata bump:** mark a note as a charter (or run an AI quest on it), then open it in a second browser → content once.
- [ ] **Window editing:** edit a note through a Note Window alone, then open the target note in a second browser → content once.
- [ ] **Already-doubled notes stay doubled:** the fix prevents new duplication; a note that was doubled before needs its extra copy deleted by hand (once).
- [ ] **Nested shortcut in a workbench:** in a workbench rooted at folder V, a shortcut to out-of-view folder A whose contents include a shortcut to out-of-view folder B → expand the outer shortcut, then the nested one → B's items show.
- [ ] **Nested back to a parent:** a shortcut to B, and inside B a shortcut to B's parent A → expanding either shows its folder's items, none missing or repeated.
- [ ] **Tab menu, closed:** right-click a tab → the tab's title with a copy icon (tooltip "Copy link"), then "Move tab to ›" and "Duplicate tab to ›" — no list of workplaces until asked.
- [ ] **Half-second rest:** rest on "Move tab to" → nothing for a moment, then the workplace picker opens beside the menu (flipped left near the right edge); a click opens it at once; resting on another row closes it.
- [ ] **Folding:** a workplace with workbenches folds out on click; the current workplace shows "current" and only its workbenches can be picked.
- [ ] **Move:** pick another workplace → the tab leaves this one; switching there shows it.
- [ ] **Duplicate:** "Duplicate tab to" → another workplace → the tab stays here and also appears there.
- [ ] **Picker Recent / Open:** open the pane "+" → Recent, then Open → each row shows files on the first line (most recently viewed first, long names capped, extras running off the edge) and the folder on the second; clicking a file reveals it in the tree; the "+" still creates in the folder.
- [ ] **Close without activating:** split panes, focus the right one, then press the x on an inactive tab in the LEFT pane → the tab closes, the right pane stays focused and the right sidebar doesn't change.
- [ ] **After merge:** redeploy Hocuspocus from a tree matching `origin/main`; `/readyz` five times with `uptimeMs` climbing.

## October 8, 2026 — Open anything from any workplace (claims, borrow/share, view exceptions removed)

Branch `refactor/remove-workplace-claims` · plan [WORKPLACE-RESTRICTIONS-REMOVAL-PLAN.md](WORKPLACE-RESTRICTIONS-REMOVAL-PLAN.md) (§R = regression guards). Owner decision: views and shortcuts govern what a workplace shows; nothing gates what it opens, and the user is never asked to borrow or share.

**Owner smoke (plan §2) — passed 2026-10-08:**
1. In a non-Main workplace, click any file in the tree → the tab appears at once, no dialog.
2. In a view workplace, open a wiki-link / search hit / daily-summary row pointing OUTSIDE the view root → it opens as a tab; the tree still shows only the view root.
3. Workspace settings → View tab → no "View Exceptions"; "Enable as View" describes tree scoping only.
4. Right-click a tab → "Move tab to" works; no "Share permanently" section.
5. Settings → Extensions → Workplaces → two cards, no "Claimed Content".
6. Select a daily summary block → Properties shows no "Auto-borrow Duration"; clicking a row opens the file.
7. Set a workplace to expire within 15 minutes → the approaching-expiry dialog still appears; at expiry the workplace archives.
8. Duplicate / Disassemble dialogs mention layouts and tabs only.
9. Reload with `?workspace=<id>&content=<an open tab>` → that tab is the active one (works in Main too).

**Post-merge (owner):** Vercel deploy live → run the drop migration (handoff script in the PR) → Hocuspocus redeploy from a tree matching `origin/main`, `/readyz` ×5.

## October 5, 2026 — The file tree stops flashing; deleting is instant; rows keep their order; view shortcuts show their folder and act on it safely (PR #284, merged `c48218d3`)

**Tree**: worktree `.claude/worktrees/smooth-delete`, branch `fix/smooth-delete` (off `origin/main` at `49b94490`)
**Status**: typecheck / lint 151 (0 errors, none new) / `tree:smooth:check` 231 (new, in the quality workflow) / `shortcut-mirror:check` (out-of-view cases, row actions, view reach) / tree + workspace gates / `pnpm build` green; no schema or TipTap change; **browser-extension change** (bookmark dedupe removed — `pnpm extension:build`, reload at chrome://extensions); **Hocuspocus redeploy required** (collaborative saves now refresh media links); run `scripts/backfill-media-links.ts --apply` once per environment. Owner browser smoke pending.

### Shipped
- **Skeleton = a scope's first load only** (`tree-refresh.ts`): every refresh of a tree already on screen is quiet — covers create, duplicate, links, uploads, folder view, the header refresh and all `dg:tree-refresh` dispatchers. Stale-scope responses are dropped.
- **Optimistic delete** (`tree-remove.ts`): rows go at once, tabs close, selection pruned, quiet reconcile; failures restored in place.
- **Delete dialog opens at once**: the Google Drive check runs behind it, file rows only; a Drive copy is deleted only if the dialog showed the choice.
- **Rows keep the order the user set** (`sibling-order.ts`): drops are anchors placed by one function on server and client; the move route is owner-scoped; one total comparator (id tiebreak) everywhere; refreshes that predate a local edit are dropped; new rows are shown where the server puts them (inline create asks for the top).
- **Shortcuts in a view show their folder**: the tree API returns out-of-view shortcut targets beside the tree (`shortcut-targets.ts`); the mirror indexes them; a drop onto such a shortcut appears in its contents at once.
- **A shortcut's rows are draggable**: dragging one moves the real item it stands for — reorder a shortcut's contents, drag them out, or drop new ones in among them. Window-reference rows stay undraggable.
- **Inside a shortcut, Delete removes the shortcut; reference actions reach the original** (owner rule): open, open in pane, copy, download, AI context and table→deck act on the original (`contentIdOfRowId`); Delete — menu or ⌥D — removes the shortcut the row is seen through, never the original (`deleteTargetsOfRowIds`, applied in `handleDelete`), labelled `Remove Shortcut “<name>”` and announced with Undo; a window row deletes nothing. Other edits stay off projection rows (⌥R included).
- **What a view's shortcuts show is in the view** (owner rule): the open guard's view-scope check counts the view root's subtree AND whatever shortcuts inside the view reach — their targets' subtrees, along chains of shortcuts (`viewReachRoots`). Locked-workspace overlap checks are unchanged.
- **Drags stick** (owner report: "sometimes dragging doesn't stick"): the drop rules finally run (`disableDrop`/`disableDrag` — react-arborist never read the old `canDrop`); a drop over the middle of a note or file lands beside it, above/below by the pointer's half, with a line preview; placement is one locked transaction and drags are sent in order, so quick successive moves can't undo each other; renumbering touches only changed rows and never `updatedAt`; paste and Move to folder place by anchor; folder views use the tree's order; window rows can't be dragged.
- **Every arriving row lands deliberately** (`slotForArrival` + `sibling-slot.ts`, under the same per-list lock): uploads at the top in the order picked, referenced content appended; the Folder assistant at the top in order, with Undo restoring the old place; Studio outputs newest-first.
- **Sort menu** (beside + in the tree header): **Float folders**, **Float nested**, **Name** (A–Z ↔ Z–A), **Stop sorting** — for the ONE folder the tree targets (the same one + adds to); nothing nested touched. **A folder remembers its sort and stays sorted** (arrivals and renames take their place; a drag inside it turns the sort off, with a toast); the header icon shows the kept sort's glyph in light gold. The vault's top level sorts once. Undo on every sort. Both header buttons' tooltips name the target.
- **Referenced-items chip**: its above/below arrow shows only while the referenced items are on screen (and, as before, only on a row that also has sub-items to place them against).
- **A shortcut can keep its own sort, view-only**: selecting a shortcut (or a row in one) makes the sort menu sort that shortcut's view — kept in user settings, never written to its folder; without one, a shortcut follows its folder's order. Rows inside a shortcut now target the shortcut for "+" and sort (they fell to the top level).
- **Referenced content in a note's text**: shown with a ¶ badge (filed items keep the link badge), kept with its note — dropping it onto another note is refused with "still embedded in …"; filed content (chats, AI documents) still moves between notes. Collaborative saves now keep the text links current (links only, never trashing); `scripts/backfill-media-links.ts` catches up existing notes.
- **Opened through a shortcut, the tree keeps pointing at the shortcut**: selection, reveal and the gold tones follow the row that stands for the open content — the shortcut (or row inside one) you opened it from, else its own row, else a shortcut leading to it (`tree-stand-in.ts`).
- **An image pasted into a note joins its referenced content at once** (`in-text-media.ts`): the note editor reports what its text gains and loses (paste, drop, /image, AI images, delete, cut, undo) and the tree shows it immediately, by the tree API's own placement rules; each edit holds until the tree's data agrees, so nothing flashes back; a fresh upload's row is fetched at once and the tree reconciles after the save window. Media filed with a note (`filedWithNote`) is never moved by text.
- **Folders spring open as you drag over them** (`spring-open.ts`): rest a drag on a collapsed row's middle for half a second and it opens; nested rows open in turn and stay open while you drag inside them. A row the drag opened closes when the pointer moves above it, leaves the tree, or the drag ends — not when the pointer passes below it, which would pull the rows under the pointer up. A drop in the tree keeps open what holds it (the rest close after the drop); a cancelled drag closes them all. Works for tree rows, other surfaces' drags and OS files.
- **The referenced-content chip's placement control** is now a list with its start or end marked, not an up-down arrow (it reads as placement, not sorting); **a folder's sort covers its referenced content** on the client too.
- **Creates and renames from the main panel and Note Windows reach the tree at once**: the "+" picker's creates show a placeholder row exactly where they land, resolved to the real row (no full refetch); a window rename updates the tree before the save and reverts if it fails; renames reach rows shown through shortcuts.
- **Drops into folders and shortcuts seen inside a shortcut land in the real folder**: a folder inside a shortcut used to take the drop and then fail (the mirror id was sent); a shortcut inside a shortcut refused drops and opened onto nothing. Both now forward to the real folder, and a nested shortcut opens onto its folder's contents.
- **Note Windows show in the tree at once** (window rows follow the editor, like images), and **renaming a windowed note renames its window row**.
- **Drag content between notes in different panes, and into a tab by hovering it**: an image (or text, or a block) dragged from one note lands in the other and leaves the source; Option/Alt copies. Resting a drag on a tab shows the tab's hover look, then opens it; releasing switches the source pane back. Moves no longer swap an image's `src` for its public link.
- **Press and hold refresh for a hard reload**: a click on the tree's refresh button stays quiet; holding it (600 ms, any pointer) reloads the tree from scratch — the skeleton flashes, the tree remounts, the in-text overlay is dropped.
- **Bookmark dedupe removed**: no Dedupe control in the capture popup or options, no rule action; every saved bookmark is its own new row. Quick-save still updates an existing Chrome bookmark for the same page.
- **Moves wait out a slow database** (locked transactions get 15 s to start, 30 s to run, not Prisma's 5 s), and **a shortcut can't trick a folder into itself**: drops are checked by real ids, so dragging a folder a shortcut shows into its own sub-folder is refused before release.

### Smoke checklist (owner)
1. Scroll the tree well down, delete a file (⌥D → confirm) → it vanishes instantly, no flash, scroll stays.
2. Duplicate a file, create a note, add an external link → no flash; the tree stays where it was.
3. Switch workspace → the skeleton shows once while that workspace's tree loads (expected — it's a different tree); then duplicate something there → no flash.
4. With Google connected, ⌥D a Drive-linked file → the dialog opens immediately; the Drive checkbox appears a moment later.
5. In a note that has attached images (its reference chip shows a count), drag one of its sub-notes below another → reload → it stays exactly where you dropped it.
6. Open a reference block that's set to show at the start, then drag a sub-note to the very top → it moves (before, this was silently ignored).
7. Create a new note inline in a folder of alphabetically-named notes → after naming it, it stays at the top instead of jumping to its alphabetical spot.
8. Drag a row, then immediately delete another → neither the dragged row nor the rest of the folder reshuffles when the tree settles.
9. In the Career Hunt view, expand "Career Development & Resources" → its ten items appear (they live under Career Pathways, outside the view).
10. Drag a note from the view onto that shortcut (or between two of its mirrored items) → it appears inside the shortcut at once, at the spot you dropped it, and stays there after a reload; it no longer vanishes.
11. Inside that expanded shortcut, drag its last item to the top → it moves there at once and is still there after a reload; open Career Pathways → the same order there.
12. Drag one of the shortcut's items out into a folder of the view → it leaves the shortcut and appears in that folder at once.
13. Try to drag a window-reference row (a note's windowed item in its drawer) → refused, as before.
14. Right-click a row inside the expanded shortcut → Open, Open In Pane, Copy and Download work on the real item (Copy, then paste into a note → a link to the original); Rename, Add, Move and Set View are not offered or greyed.
15. Same menu → the delete entry reads `Remove Shortcut “Career Development & Resources”` → click it → the shortcut disappears, a toast says the original is untouched → open Career Pathways → its ten items are all still there.
16. Click Undo on that toast → the shortcut is back where it was.
17. Select a row inside the shortcut and press ⌥D → the shortcut is removed (same toast), never the item; press ⌥R on such a row → nothing happens.
18. In a view workspace, for a shortcut whose target lies outside the view (e.g. a new view rooted at a folder with a shortcut to a folder outside it), open an item inside that shortcut → it opens; no "outside this view" dialog.
19. In that view, open an item from a folder that no shortcut in the view points to → the "outside this view" dialog still appears.
20. In a folder of notes, drag a note over the MIDDLE of another note → a line appears on that note's top or bottom edge (following the pointer); release → the dragged note lands there. No bounce, no "Cannot move content into a non-folder item".
21. Drag a note over the middle of a folder → the folder highlights; release → the note goes inside it.
22. Drag a referenced CHAT (filed under a note — link badge) over the middle of another note → that note highlights; release → it becomes one of that note's referenced items.
23. In one folder, make two drags within a second of each other → reload → both stayed where you put them.
24. Copy a note, right-click another note → Paste → it lands directly below the clicked note (try it in a folder where you've deleted or uploaded things).
25. Select three items, Move → pick a folder → they land at the top of that folder in the order they were in.
26. Hover a file to see its "modified" time, drag a different file within the same folder, hover the first again → its modified time hasn't changed.
27. Try to drag a note's window row (in its reference drawer) → it doesn't lift.
28. Drop three files onto a folder (or upload them with + → File) → they appear at the top of the folder in the order you picked them.
29. Paste an image into a note → it appears at the END of the note's referenced items as soon as the upload finishes — no reload.
30. File two items with the Folder assistant → they land at the top of the target folder in order; click Undo → each goes back to its old folder AND its old position there.
31. Open the browser extension's capture popup and options (after `pnpm extension:build` + reload) → no Dedupe control; save a page you already bookmarked into a different folder → a NEW bookmark appears at the bottom of that folder and the old one stays where it was.
32. Run a Studio tool (infographic or slide deck) → the new output is first in "Studio outputs".
33. Select a folder, hover the sort icon and the + → their tooltips name that folder; select a file → they name its folder; select nothing → the top level (or the view's name).
34. Open the sort menu → "Sort “…”" with Float folders, Float nested, Name (A–Z); hover each → a tooltip says what it does and that only this level changes.
35. Choose Float folders → the folder's folders move to the top; the header icon becomes a light-gold folder glyph while that folder is selected; select another folder → the plain icon returns; no ring is left on the button.
36. With Float folders on, choose Name → folders on top, each part A–Z, the glyph shows A→Z; choose Name again → Z–A. Reload → still sorted.
37. Upload a file into that folder (and rename an item) → it lands in its sorted place, not at the top.
38. Drag an item to a new spot inside that sorted folder → it stays where you dropped it, a toast says sorting is off for that folder, the header icon is plain again, nothing else moved.
39. Sort it again, choose Stop sorting → nothing moves; the glyph goes away. Sort once more and click Undo on the toast → the previous order and sort come back.
40. Select nothing (vault top level), sort by Name → it sorts once (toast says so); no glyph appears; Name again → Z–A.
41. Collapse a note (one with sub-items too) whose referenced items were open → its chip turns grey and the ⇅ arrow disappears; open the note → the gold chip and arrow return.
42. Check the sort menu, glyph and tooltips in light and dark mode → readable, matching the app's other menus.
43. Drag an item OUT of an expanded shortcut into a folder of your tree → it moves there (and is gone from the shortcut's folder).
44. Put a shortcut inside one of the sub-folders of the folder it points at (A/B/C with a shortcut in C → A); expand it, drag the mirrored B onto the real C → no drop line, nothing is sent (C is inside B).
45. Select a shortcut to a folder → the sort icon's tooltip says "Sort shortcut “…”"; choose Name → the shortcut's contents sort A–Z and the icon shows the A→Z glyph; open the real folder → its order is unchanged.
46. Sort the real folder (e.g. Float folders) with the shortcut NOT sorted → the shortcut shows the new order at once; give the shortcut its own sort → it keeps its own order regardless.
47. Select a row inside the shortcut → "+" and the sort both name the shortcut's targets (no longer "the top level"); press + → the new item lands beside the shortcut, not at the top level.
48. With the shortcut sorted, drag one of its rows to a new spot inside it → a toast says sorting is off for that shortcut; the row lands there and the shortcut shows the folder's own order.
49. Expand a note with an image in its text → that image's badge is ¶, tooltip "In this note's text — it stays with this note"; a chat under the same note has the link badge ("Filed under this note …").
50. Drag that ¶ image onto a different note → nothing moves; a warning says it's still embedded in the first note.
51. In a live-edited note, delete an image from the text, wait a few seconds, reload → its row shows the link badge (no longer in the text) and it is NOT in the trash; paste a new image → after a few seconds and a reload it shows ¶.
52. With the original visible in the tree, click a shortcut to it → the content opens; the SHORTCUT row stays selected and gold; the original's row doesn't light up. Press ⌥D → the shortcut is removed, not the original.
53. Click a row inside an expanded shortcut → it opens; that row stays selected and gold.
54. In a view where the original lives outside: open the content from a tab or search → the shortcut that leads to it is selected and gold (expanding the shortcut if the content sits inside its folder).
55. Open the same content from its OWN row → the original's row takes the selection and gold again.
56. Expand a note's referenced content and paste an image into the note → as the upload finishes, the image appears there with the ¶ badge and the chip count goes up — no refresh; wait 15 s → nothing flickers or moves.
57. Add an image with /image → same as 56.
58. Delete that image from the note (its toolbar's Delete, or Backspace) → it leaves the note's referenced content at once; ⌘Z → it's back at once.
59. Cut an image from one note and paste it into another (both visible in the tree) → it moves to the second note's referenced content at once.
60. Delete an image from a live note and wait 15 s → it shows in its folder's referenced content (kept, not trashed); nothing reappears under the note.
61. Drag a note and rest it on the middle of a collapsed folder for about half a second → the folder opens; rest on a collapsed sub-folder inside it → that opens too.
62. Keep dragging down through the first folder's items, slowly, row by row → it stays open the whole way (and the sub-folder stays open while you're inside it); drag on below the folder → it stays open (nothing jumps under the pointer); drag back up ABOVE the folder → it closes, along with the sub-folder it opened.
63. Spring a folder open, then drag out of the file tree (over the editor) → every folder the drag opened closes; folders you had open before the drag stay open.
64. Spring two folders open and drop inside the inner one → the item lands there and both stay open. Spring one open and press Esc → it closes.
65. Drag slowly along the top or bottom edge of a collapsed folder (the "beside" line shows) → it does NOT open; a drop there lands beside it.
66. Drag a file from Finder over a collapsed folder → it opens after the pause; drag a row over a collapsed shortcut to a folder → it opens and shows the folder's items.
67. Spring a folder open, drag on below it and drop there → the item lands where you dropped it, then the folder closes.
68. Open a folder's referenced content on a row that also has sub-items → the placement control shows a list with its start or end marked (not an up-down arrow); click it → the block moves and the icon swaps.
69. Give a folder with referenced items a kept sort (Name) → its referenced items show in that order too; rename one → it moves to its sorted place at once.
70. Click the tree's refresh button (hover the file count) → it refreshes quietly, no flash. Press and hold it for about half a second → the tree flashes its skeleton and reloads; on release nothing else happens. Open folders and the scroll position come back.
71. Main panel "+" → New note (in a folder, or after an item) → the row appears in the tree at once, in that spot, and stays after the tree settles.
72. In a note, add a Note Window → Choose a note → New note → the new note's row appears in the tree at once.
73. Rename the windowed note from the window's header → the tree shows the new name at once; rename a note shown inside an expanded shortcut → its row there updates too.
74. Expand a shortcut whose folder holds a sub-folder; drag a note onto that sub-folder (inside the shortcut) → it highlights, lands there, no error; open the real folder → the note is in the sub-folder.
75. Expand a shortcut whose folder holds ANOTHER shortcut to a folder; click the nested shortcut → it opens onto its folder's items; drag a note onto it → it lands in that folder and shows inside the nested shortcut at once.
76. Add a Note Window to a note and aim it at another note → the window row appears in the note's referenced content at once (no refresh); remove the window → the row leaves at once.
77. Rename the windowed note from the window's header → its window row in the tree shows the new name at once.
78. Vertical Split with a note in each pane: drag an image from the left note into the right note's text → it lands where dropped and leaves the left note; the tree shows it under the right note. Hold Option/Alt while dragging → it is copied instead.
79. Single pane with two note tabs: drag an image from the open note and rest it on the other tab → after half a second that tab opens; drop into its text → the pane switches back to the note you started in, and the image is gone from it.
80. Drag a line of text from one note onto another note's tab, rest, drop into its text → same: it moves, and the view returns.
81. While dragging, hold over another tab → it takes the hover look at once (tint, darker title, close button) until it opens; drag off it before it opens → the look clears.

## October 4, 2026 — Coming back lands you where you were (workspace cold-load restore)

**Tree**: worktree `.claude/worktrees/workspace-restore`, branch `fix/workspace-cold-load-restore` (off `origin/main` at `80502511`)
**Status**: typecheck / lint 151 (0 errors, none new) / `workspace:pane-placement:smoke` 132 / `workspace:cold-load:smoke` 23 (new, in `build`) / `workspace:tab-move:smoke` / `polling:check` green; no schema, TipTap or extension change → no Hocuspocus redeploy. Owner browser smoke pending.

### Shipped
- **Return to the last workspace**: `loadWorkspaces` resolved candidates with `getWorkspace` (falls back to Main), so the persisted last-workspace was dead code. Strict lookups; Main is the last resort.
- **No cross-workspace tab bleed**: open tabs are kept on load only if they belong to the opening workspace (`contentStoreOwnerWorkspaceId`; the URL's `?workspace=` stands in on a cold start). Every pane is rebuilt from the snapshot otherwise. An external `?content=` deep link with no `?workspace=` survives as one tab.
- **Re-run guard** for the write coalescing from #278: a deferred persist re-run no longer writes a different workspace's tabs under the old id.
- **Not done, on purpose**: pruning the `tabs` record (it is the pane-memory and title-cache store).

### Smoke checklist (owner)
1. In a non-Main workspace with tabs open, open a bare `/content` in a new browser tab (or close the app and reopen it from its start URL) → it opens THAT workspace with its own tabs, not Main.
2. Main with tabs open → switch to another workspace from the workspace menu → only that workspace's tabs, in every pane (try a split); wait 5s, reload → unchanged; switch back → Main's tabs are untouched.
3. Paste `/content?content=<a note id>` (no `?workspace=`) → opens in the last workspace as one extra tab beside its own.

## October 4, 2026 — The pane "+" picker follows the user's perspective (PR #277, merged `e49fa0cd`)

**Tree**: branch `feat/pane-picker-tree-perspective` (merged; local branch deleted, remote branch left for the owner)
**Status**: typecheck / eslint (0 errors, no new warnings) green; no migration, no TipTap schema change, no extension change → no Hocuspocus redeploy. Owner smoked it on a dev server through the build and signed it off.

### Shipped
- **`ContentTreePicker` opens where the user is**: expansion seeded from the file tree, focus on the tree's selection else the active content, centred on open.
- **Jump-to pills, pinned under the search box**: **Active** (creates a note right next to the active content), **Recent** (folders last created in), **Open** (folders holding this workspace's open content). New `state/create-destination-store.ts`; destinations also derived from `createdAt`.
- **The tree follows the active content** and a toolbar **"Show in file tree"** tool for every content type — new `state/tree-reveal-store.ts` is the one reveal channel (toolbar, breadcrumb, follow-active). A single click on a folder now selects it (grey) as well as toggling, so "+" and drops target it.
- **Row tones**: deep gold = active in the pane, light gold = open in another tab, grey = selected in the tree.
- **Reader pages no longer 500 the workspace save** (`lib/domain/content/uuid.ts`).
- Backlogged: unify the other tree-browse menus; the single-tab workplace routes' UUID guard (`BACKLOG.md`).

### Decisions worth keeping
- Flyouts beside the picker, gradients, left rails on menu items, and a pinned gold header above the search box were all tried and REJECTED by the owner this round; the picker's Jump-to is an inline pill row.

## October 3, 2026 — Wiki-link views + move to note

**Tree**: worktree `.claude/worktrees/wikilink-views`, branch `feat/wikilink-views` (off `origin/main` at `2d3797f3`)
**Status**: typecheck / lint 151 (0 errors, none new) / markdown:blocks (+15 fixtures, +13 shape assertions) / collab:schema / private:content green; **owner browser smoke pending**. **⚠ Hocuspocus redeploy required post-merge** (schema 1.20.0: `wikiLink.view` attr — an un-redeployed collab server drops it from live documents). Plan: `WIKILINK-VIEWS-PLAN.md`.

### Shipped
- **One link, four displays.** `wikiLink.view` ∈ link (default) / chip / card; the window stays the `noteWindow` block and `applyLinkView` (`lib/domain/editor/link-views.ts`) converts both ways (paragraph split on the way out, paragraph-with-link on the way back). Chip/card are a vanilla-DOM NodeView over renderHTML's own span (`wiki-link-node-view.ts`); card text from `link-preview.ts` (one cache per target, `content-updated` invalidates, private content stripped).
- **Chosen in place.** Hover chooser (`wiki-link-hover.tsx`, tippy + `LinkViewChooser`), the same chooser in the window header ("Display as…"), and a "Display as" submenu in the context menu on links and window headers. Window needs a ContentNode id: title-only links resolve + heal first; heading/anchored/virtual targets say why they can't.
- **Shared underneath.** `wiki-link-attrs.ts` is the one attr spec for both nodes; a `![[Title]]` with no id resolves by title via `resolveWikiLinkTarget` (the click rule). Autosuggest and the window picker untouched.
- **Markdown.** `wiki-link-markdown.ts` grammar + `dgWikiLink`/`dgNoteWindow` turndown rules + `wikiLinkCodec`/`noteWindowCodec` reTags: `[[Title|alias]]{#id .card .no-context label="…" slug=…}`, `![[Title]]{#id block=… height=… .no-border view=… row=…}`. `ServerNoteWindow.renderHTML` symmetric; public safety moved to `publicSafeNoteWindows` in `TipTapContent`.
- ~~Send to New Note~~ — folded into Move to Note (owner, round 7): the picker's "+ New Note" is the one way to make a new note for the selection.
- **Context menu** acts on the clicked editor (`editorForContext`), not the first in the store.
- **Move highlight to note** (`move-selection.ts`, `selection-blocks.ts`, `MoveSelectionPicker.tsx`, `POST /api/content/content/[id]/append`): one item, no submenu, always leaves a link (round 9 — "No link" removed; the point is building content out into other notes). The shared tree picker targets an existing note or creates one in place via "+ New Note" (named from the selection's first heading/line); blocks append to the end of the target (buffer paragraph when non-empty) followed by a `From [[Host]]` provenance stamp, through the live editor or the collab-safe server writer; the selection here becomes a link in the last-used display (`lastUsedLinkView`, localStorage) — whole blocks replaced by one paragraph, no empty block left. **Disabled offline**, and refused at pick time if the connection dropped meanwhile.
- **Chooser polish** (owner rounds 2–5): skeleton tiles instead of icons, slimmer, editable label (same box, scroll inside), window header opens on hover beside its button, window Open is a workspace tab (#278's destination rule).

### Smoke checklist (owner)
1. Type `[[` → pick a note → hover the link → chooser appears; pick Card → excerpt shows; pick Window → block appears, paragraph split around it; in the window header "Display as…" → Link → back to a paragraph.
2. Source view: a paragraph with a link reads `see [[Title]]{#…}`; a window reads `![[Title]]{#… block=…}`; toggle back → identical.
3. Type `![[Some existing note]]` in source view → apply → the window resolves by title and shows the note.
4. Select two paragraphs → right-click → Move highlight to note → "+ New Note" on this note's folder → a note named from the selection's first line is created there with the blocks followed by `From [[This note]]`; the two paragraphs here become one line holding a link; toast Open works.
5. Move highlight to note → pick an OPEN note → the paragraphs appear at its end after a blank line, then the stamp. Repeat on a note that is NOT open → the target shows the blocks and the stamp when opened; the link here uses the display you last chose.
6. Publish a note with a window → published HTML shows "Windowed note: Title" with no ids.
7. Turn the network off (DevTools → Network → Offline) → right-click a selection → "Move highlight to note" is greyed out with "you're offline" on hover.

## September 25, 2026 — Private content (comment out prose)

**Tree**: worktree `.claude/worktrees/private-text`, branch `feat/private-text` (off `origin/main` at `e171048f`)
**Status**: typecheck / lint 151 (0 errors) / collab:schema / markdown:blocks (+6 fixtures, +2 pretty assertions) / private:content:check (new, mutation-tested) / full build green; **owner browser smoke pending**. **⚠ Hocuspocus redeploy required post-merge** (schema 1.18.0: new mark `privateText` + node `privateBlock` — an un-redeployed collab server rewrites them to `unsupportedInline` / `unsupportedBlock`).

### Shipped
- **`privateText` mark + `privateBlock` node** (`lib/domain/editor/extensions/private-content.ts`, Server twins registered in `extensions-server.ts` + `collaboration/extensions.ts`). Cmd+/ `togglePrivate`: in-paragraph selection → mark; bare cursor / cross-block selection → block wrap; inside either → reverse (whole run via `extendEmptyMarkRange`, whole block via `liftTarget`). `%%text%%` markInputRule; `%%` + Enter opens / closes a block; `/private`; EyeOff toolbelt button (`private` tool, order 45).
- **One predicate, explicit at each seam** — `stripPrivateContent` (pure JSON, `lib/domain/content/private-content.ts`): `extractSearchTextFromTipTap` (covers the `searchText` column on every write path + `read_content`), `chunkDocument`, `resolveNote`, `renderCharterSection` / `Plain`, `TipTapContent`. Live-ProseMirror twins `visibleTextOf` / `visibleTextBetween` (`lib/domain/editor/ai/visible-text.ts`) for `buildOutline` previews and ChatPanel's ambiguity context + "document currently reads" dump. NOT in `tiptapToMarkdown` (source view must show it).
- **Lossless markdown**: `privateBlock` codec (`%%` fence, blank-line padded, unanchored reTag) + reTag-only `privateText` codec; `dgPrivateText` / `dgPrivateBlock` turndown rules; code segments excluded from the inline reTag. Export markdown converter emits `%%…%%` / `%%` fences.
- **Gate**: `pnpm private:content:check` — two halves, wired into `build`: `scripts/validate-private-content.ts` (predicate + seam scan, mutation-tested) and `scripts/validate-private-content-editor.ts` (a REAL TipTap editor under jsdom: Cmd+/ both shapes and their reversal, the `%%text%%` input rule via `handleTextInput`, `%%` + Enter open/close incl. the trailing-node reuse, strip ≡ visible text).
- **CSS**: `.ProseMirror .private-text` / `.private-block` (muted, dotted underline / dashed left rule, `%%` chrome via pseudo-elements, dark companions); `.public-prose [data-private] { display: none }` as the belt-and-braces net.

### Also in this release train (same branch, 2026-09-25)
- **Paste into a code block always lands** (owner report: long pastes into a ``` block landed nothing or one line). Root cause: the editor's own `handlePaste` in `MarkdownEditor.tsx` runs before TipTap's code-block-aware handler and, when the text looked like markdown (`#` comments, `-` lines, backticks…), either replaced the literal paste with block nodes a `codeBlock` (`content: text*`) cannot hold ("Always format" on) or offered a toast whose "convert" undid the good paste. Fix: bail out of that handler whenever `$from.parent.type.spec.code` — ProseMirror's default then inserts one text node with every line kept. The context-menu "Paste as Markdown" inserts literal text inside a code block for the same reason.
- **Slash menu uses Lucide icons** instead of 60 mixed emoji/glyphs: `SlashCommand.icon` is now `LucideIcon | string` (string kept for extension authors), all 72 built-in commands + the calendar extension's two mapped to icons, rendered at 18px in the menu's existing gold accent.

### First owner smoke (2026-09-26) — findings + fixes
- **Leak found:** a side chat asked "does this document have the phrase …" and the model quoted a `%%…%%` run. Path: the side chat attaches its bound note as an implicit first mention (`app/api/ai/chat/route.ts`), rendered from the materialized `searchText` column, which predated the strip. **Fix:** derive live via `extractSearchTextFromTipTap` (same rule `read_content` already followed). **Also closed** from the same sweep: `findTextInDoc` (apply_diff could match/edit private text and its match COUNT confirmed existence), charter phase titles (`headingText`), inject-media `blockPreview`, `list_document_blocks`, the browser-extension note read's markdown flavour. Six seams added to `private:content:check`. Left as documented edges: `read_current_page` DOM capture of the app's own page (extension content script), stale AI-derived metadata.
- **Search "toggling" observation:** consistent with the `searchText` column lagging the editor by one collaborative save — the column is written stripped on every save path, so a result that shows right after un-marking disappears on the next save after re-marking. Not a second code path.
- **Side-chat copy-link first click** (separate regression, owner report): the clipboard write ran after an `await`ed ensure-node POST; on the first click that POST creates the node and the click's user activation expires, so the browser refuses the write; the second click's POST is a no-op and squeaks in. Fixed by handing `ClipboardItem` a pending value (write stays inside the gesture) + caching the node id per conversation.
- **Local sign-in outage** during the smoke: the dev server's inherited shell env forced TLS on the localhost Postgres (`Error opening a TLS connection: The server does not support SSL connections`); a restart from a clean shell fixed it. Both dev and collab servers now run detached from this worktree.

### Smoke checklist (owner)
- [ ] Side chat on a note with a `%%…%%` run: ask "does this document contain <the private phrase>" → the model says no / cannot find it.
- [ ] Caret at the end of a `%%…%%` run, type → text stays inside; press → once (caret does not move), type → text is outside.
- [ ] After stepping out, Backspace → the run is uncommented (text kept). Caret just before a run, Delete → same.
- [ ] Caret at the start of the paragraph right after a private block, Backspace → the block is uncommented and the paragraph is NOT pulled into it.
- [ ] Side chat header → copy-link button on the FIRST click → "Chat link copied" toast and the link is on the clipboard.
- [ ] Inside a ``` code block, paste a multi-line snippet containing `#` comment lines and `-` bullets → every line lands verbatim, no toast. Also via right-click → Paste as Markdown.
- [ ] Type `/` → every row shows a line icon (no emoji); `/calendar` rows too.
- [ ] Select words inside a paragraph → Cmd+/ → muted `%%…%%` run; Cmd+/ again with the caret inside → plain text.
- [ ] Caret on a paragraph → Cmd+/ → dashed private block with the "%% private — hidden…" label; Cmd+/ inside → unwrapped.
- [ ] Type `%%secret%%` → converts on the closing `%%`. Type `%%` + Enter → block opens; `%%` + Enter inside → block closes with the caret in a fresh paragraph after it.
- [ ] `/private` and the EyeOff toolbelt button behave like Cmd+/.
- [ ] Source view (markdown toggle) shows `%%secret%%` and the `%%` fence lines; toggling back restores both shapes.
- [ ] AI chat bound to the note: `read_content` / "read the document" never quotes private text; `list_document_outline` shows "(no text)" for a private block.
- [ ] Publish the note → private text and block absent from the public page.
- [ ] Global search for a private-only word finds nothing after the note saves.
=======
## September 21, 2026 — Move tab to workplace / workbench

**Tree**: worktree `.claude/worktrees/move-tab-to-workspace`, branch `feat/move-tab-to-workspace` (PR pending)
**Status**: typecheck / lint / full build green; `pnpm workspace:tab-move:smoke` (new, DB-backed) green; owner browser smoke pending. No migration, no TipTap schema change → no Hocuspocus redeploy.

### Shipped
- **Real tab move** (`POST /api/content/workspaces/[id]/tabs/move`, `moveWorkspaceTab` in `membership.ts`): R1 membership upserted in the target and deleted from the source in one transaction; only the target's `updatedAt` bumps (the source is the mover's active workplace — bumping it would 409 their own next save).
- **Menu** (`WorkplacesTabMenuSection`): "Move tab to" lists top-level workplaces with their workbenches indented, the current workplace's own benches included; unmaterialized root-layer folders are fetched from the workbenches route on open and materialized on click via the new `ensureWorkbench` store action. *(The "Share permanently" section was removed 2026-10-08 with workplace claims.)*
- **Store** (`moveTabToWorkspace`): posts the move with the leaving pane's affinity hint, closes the local tab, replaces the target's list entry from the response, toasts with "Go there". *(Claim carrying removed 2026-10-08.)*
- **Read path**: `getWorkspace` includes membership; `contentMeta` names membership-only ids so the moved tab arrives titled.

### Addendum (2026-09-25) — drag a tab onto the workplaces affordance
- **`WorkspaceTabDropTarget`** wraps `WorkspaceSelector` in the shell nav: a tab dragged over the trigger opens (after 150 ms) a drop-only panel with the same grouped destinations as the context menu (`useTabMoveTargets`, shared). Drop = move, stay put. Hold one row 2 s → bar fills, "Opens here" pill → drop also switches there. Moving rows restarts the hold. Panel closes 300 ms after `dragover` stops reaching trigger or panel.
- **`state/tab-drag-store.ts`** bridges the strip's drag (set/cleared in `MainPanelHeader`, plus `application/x-dg-tab` mime) to targets outside the pane subtree.
- **`moveTabToWorkspace(…, { openTarget })`** activates the target after the move and omits the "Go there" toast action.
- **Files (same panel, `WorkspaceDropTarget`)**: a tree node or multi-selection dragged onto the affordance → "Send … to" panel; drop = `sendContentToWorkspace` → `POST /tabs` per item (now bumps target `updatedAt`, returns the workspace read); the current workplace / active bench are droppable for content (guarded open when active); hold 2 s follows. Tree drags are react-dnd → hover native, drop via `useDrop` (the HTML5 backend forces `dropEffect="none"` elsewhere).

- **Round-1 fix + Undo (2026-09-26)**: bench folder lists prefetch at drag start and seed from a 60 s cache (`usePrefetchTabMoveTargets`) so the panel no longer shifts under the pointer. Every move/send toast carries **Undo** for 10 s: tab move → membership back + reopen in the original pane (or close where followed and switch back); send → `DELETE /tabs` per item (now bumps the revision) or local close. "Go there" is the toast's secondary button.

### Drag-and-drop smoke (owner)
**Undo:** drop a tab on another workplace → toast shows **Undo** and **Go there** → Undo → the tab is back in the same pane, no conflict dialog, and the target no longer lists it → hold-drop (followed) → Undo → tab closes there, you are back in the source with the tab open → send a file → Undo → the target no longer has it → drop a file on the current workplace → Undo → it closes here.
**Shift:** drag a tab over the selector after a page load → the panel opens with every view workplace's folders already listed; nothing moves under the pointer while hovering.
**Files:** drag a file from the tree over the selector → panel opens with "Send … to", the current workplace listed as a droppable row → drop on another workplace → opens there as a tab, you stay, toast "Sent … to X" with "Go there" → hold 2 s → "Opens here" → drop → file opens there AND you land there → drop on the current workplace's row → it just opens here → drag a multi-selection → "Send N items to" → all open in the target → second window on the target → tab appears within the refresh cadence, no conflict dialog.
**Tabs:**
Drag a tab over the workplaces selector → the panel opens beneath it listing other workplaces with benches indented, the current one labelled "current" with only its benches → drag away from both → closes within ~300 ms → release the drag elsewhere → closes → drop on a workplace row quickly → tab closes here, toast with "Go there", you stay → hover a row → thin bar fills across it over 2 s → "Opens here" pill → drop → tab moves AND you land in that workplace, toast without "Go there" → hover a row ~1.5 s then move to another → bar restarts from zero, no pill until 2 s there → drop on a never-opened bench folder → bench materializes and holds the tab → reorder a workplace inside the real dropdown → unaffected → drag a file-tree node over the selector → panel does NOT open → after any drop the pane reshape overlays are gone.

### Smoke script (owner)
Right-click a tab → "Move tab to" lists the other workplaces, each with its workbenches indented; the current workplace shows as "current" with only its benches clickable → pick a sibling workplace → the tab closes here and a toast says "Moved … to X" with "Go there" → Go there → the tab is open in X, titled, in the top-left pane → from a view workplace, move a tab into a subfolder that has NEVER been opened as a bench → the bench materializes (it now appears in the selector's dwell submenu) and holds the tab → from that bench, move the tab back to the parent workplace → with a second browser window sitting on the target workplace, move a tab into it → the tab appears there within the background refresh cadence and neither window shows a conflict dialog → move a tab from a two-pane layout's right pane → it lands per the target's own layout (top-left when the target has no right ordinal) → right-click on a workplace with no other workplaces and no benches → "Create another workplace first."


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
