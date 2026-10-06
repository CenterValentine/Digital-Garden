/**
 * Smooth file-tree gate. Runs with `pnpm tree:smooth:check` (tsx, no
 * database, no network, no React).
 *
 * The regression it exists for (2026-10-05): the tree refreshed with its
 * skeleton up after every mutation — delete, create, duplicate, link, upload,
 * folder view, and every `dg:tree-refresh`. The skeleton unmounted
 * react-arborist, so each one flashed the whole tree and dropped the user back
 * at the top. Pinned here:
 *
 *  1. The skeleton is a scope's FIRST load only (lib/domain/content/tree-refresh.ts),
 *     and the sidebar's one refresh entry point follows that rule.
 *  2. Delete is optimistic (lib/domain/content/tree-remove.ts): rows go at
 *     once — untouched branches keep their identity, a partial failure
 *     restores rows in place — and the handler reconciles quietly.
 *  3. The delete dialog opens without waiting on the Google Drive check, and
 *     a Drive copy is only deleted if the dialog showed the choice.
 *  4. Rows keep the order the user set (lib/domain/content/sibling-order.ts):
 *     one total sibling order everywhere; a drop is an anchor ("after this
 *     row") placed by ONE function on both the server and the optimistic
 *     tree; a refresh that predates a local edit is dropped; new rows are
 *     shown where the server will put them.
 *
 * (2) and (3) are partly source pins on LeftSidebarContent.tsx: each failure
 * is a one-line revert nobody would notice in review.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  collectRemovedIds,
  removeNodesFromTree,
  withoutIds,
} from "../lib/domain/content/tree-remove";
import {
  refreshIsQuiet,
  responseStillApplies,
  treeResponseApplies,
  treeScopeKey,
} from "../lib/domain/content/tree-refresh";
import {
  compareSiblings,
  displayOrderForTop,
  dropRowFor,
  insertUnderParent,
  moveAcrossForests,
  moveTouchesCarried,
  placeAmongSiblings,
  applyKeptSort,
  compareNames,
  isFolderLike,
  nextKeptSort,
  nextNameDirection,
  parseKeptSort,
  renumbering,
  resolveDropAnchor,
  slotForArrival,
  sortedInsertIndex,
  sortLevel,
  type LevelSortRow,
  type DropRow,
  type OrderedSibling,
} from "../lib/domain/content/sibling-order";
import {
  acceptsDropInto,
  besideRowIndex,
  dropEdgeAt,
  dropRefused,
  inTextElsewhere,
  isUndraggableRow,
  realIdOfRow,
  wouldNestInItself,
  type DropRuleRow,
} from "../lib/features/content/drop-rules";
import { clearKeptSort, orderKeptLevel, showKeptSorts } from "../lib/features/content/kept-sort-display";
import {
  IN_TEXT_EDIT_MAX_AGE_MS,
  IN_TEXT_FETCH_MS,
  IN_TEXT_RECONCILE_MS,
  NO_IN_TEXT_EDITS,
  isArrivingChange,
  trackMediaStep,
  mediaChanges,
  mediaInDoc,
  missingInTextMedia,
  recordInTextEdits,
  settleInTextEdits,
  showInTextEdits,
} from "../lib/features/content/in-text-media";
import {
  SPRING_IDLE,
  SPRING_OPEN_DELAY_MS,
  inMiddleBand,
  springStep,
  type RowPlace,
  type SpringEffects,
  type SpringEvent,
  type SpringState,
} from "../lib/features/content/spring-open";
import type { TreeNode } from "../lib/domain/content/types";

interface Node {
  id: string;
  children?: Node[];
  references?: Node[];
}

let checks = 0;
function check(name: string, fn: () => void) {
  fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const n = (id: string, children?: Node[], references?: Node[]): Node => ({
  id,
  ...(children ? { children } : {}),
  ...(references ? { references } : {}),
});

//   a
//   ├─ a1
//   └─ a2 (references: r1)
//   b
//   └─ b1
//       └─ b1x
//   c
function fixture(): Node[] {
  return [
    n("a", [n("a1"), n("a2", [], [n("r1")])]),
    n("b", [n("b1", [n("b1x")])]),
    n("c"),
  ];
}
const ids = (list: Node[]) => list.map((x) => x.id);

console.log("\nwhen a refresh may keep the tree on screen (tree-refresh.ts)");
{
  const main = treeScopeKey("ws-main", null);
  check("the first load of a scope shows the skeleton", () => {
    assert.equal(refreshIsQuiet(null, main), false);
  });
  check("a refresh of the scope already on screen is quiet", () => {
    assert.equal(refreshIsQuiet(main, treeScopeKey("ws-main", null)), true);
  });
  check("another workspace is a new scope (skeleton — the old tree is the wrong files)", () => {
    assert.equal(refreshIsQuiet(main, treeScopeKey("ws-other", null)), false);
  });
  check("another view root in the same workspace is a new scope too", () => {
    assert.equal(refreshIsQuiet(treeScopeKey("ws-main", "folder-a"), treeScopeKey("ws-main", "folder-b")), false);
    assert.equal(refreshIsQuiet(treeScopeKey("ws-main", "folder-a"), main), false);
  });
  check("a response for a scope the user has left is dropped", () => {
    assert.equal(responseStillApplies(main, treeScopeKey("ws-other", null)), false);
    assert.equal(responseStillApplies(main, main), true);
  });
}

console.log("\nresponses that predate a local edit (treeResponseApplies)");
{
  const base = {
    requestScope: "s",
    currentScope: "s",
    firstLoad: false,
    startedEditGen: 3,
    currentEditGen: 3,
    pendingEdits: 0,
  };
  check("a quiet refresh with no edit since it started applies", () => {
    assert.equal(treeResponseApplies(base), true);
  });
  check("one that started BEFORE a move/delete is dropped (it carries the old order)", () => {
    assert.equal(treeResponseApplies({ ...base, currentEditGen: 4 }), false);
  });
  check("one that finishes while an edit is still writing is dropped", () => {
    assert.equal(treeResponseApplies({ ...base, pendingEdits: 1 }), false);
  });
  check("a scope's first load always applies — no tree of that scope is on screen", () => {
    assert.equal(treeResponseApplies({ ...base, firstLoad: true, currentEditGen: 9, pendingEdits: 2 }), true);
  });
  check("…unless the user has left that scope", () => {
    assert.equal(treeResponseApplies({ ...base, firstLoad: true, currentScope: "t" }), false);
  });
}

console.log("\none sibling order (compareSiblings)");
{
  const sib = (id: string, title: string, displayOrder: number): OrderedSibling => ({ id, title, displayOrder });
  check("displayOrder first, then title", () => {
    const sorted = [sib("1", "b", 1), sib("2", "a", 1), sib("3", "z", 0)].sort(compareSiblings);
    assert.deepEqual(sorted.map((x) => x.id), ["3", "2", "1"]);
  });
  check("equal displayOrder AND title are ordered by id — never by arrival order", () => {
    const a = sib("aaaa", "Untitled", 0);
    const b = sib("bbbb", "Untitled", 0);
    assert.deepEqual([b, a].sort(compareSiblings).map((x) => x.id), ["aaaa", "bbbb"]);
    assert.deepEqual([a, b].sort(compareSiblings).map((x) => x.id), ["aaaa", "bbbb"]);
  });
  check("total: any input order of the same rows sorts identically", () => {
    const rows = [sib("c", "x", 0), sib("a", "x", 0), sib("b", "x", 0), sib("d", "a", 2)];
    const one = [...rows].sort(compareSiblings).map((x) => x.id).join();
    const two = [...rows].reverse().sort(compareSiblings).map((x) => x.id).join();
    assert.equal(one, two);
  });
  check("sortedInsertIndex shows a pending row where the server will sort it", () => {
    const sorted = [sib("1", "Alpha", 0), sib("2", "Gamma", 0), sib("3", "Zed", 5)];
    assert.equal(sortedInsertIndex(sorted, sib("t", "Beta", 0)), 1);
    assert.equal(sortedInsertIndex(sorted, sib("t", "Omega", 0)), 2);
    assert.equal(sortedInsertIndex([], sib("t", "x", 0)), 0);
  });
  check("displayOrderForTop puts a new row above the current first", () => {
    assert.equal(displayOrderForTop(null), 0);
    assert.equal(displayOrderForTop(0), -1);
    assert.equal(displayOrderForTop(-3), -4);
  });
}

console.log("\nplacing a dropped row (placeAmongSiblings — server AND optimistic tree)");
{
  const r = (id: string) => ({ id });
  const ids = (list: { id: string }[]) => list.map((x) => x.id);
  check("after an anchor", () => {
    assert.deepEqual(ids(placeAmongSiblings([r("a"), r("b"), r("c")], r("c"), { afterId: "a", index: 99 })), ["a", "c", "b"]);
  });
  check("afterId null = first", () => {
    assert.deepEqual(ids(placeAmongSiblings([r("a"), r("b"), r("c")], r("c"), { afterId: null, index: 99 })), ["c", "a", "b"]);
  });
  check("an anchor that isn't a sibling falls back to the index, clamped", () => {
    assert.deepEqual(ids(placeAmongSiblings([r("a"), r("b")], r("x"), { afterId: "nope", index: 1 })), ["a", "x", "b"]);
    assert.deepEqual(ids(placeAmongSiblings([r("a"), r("b")], r("x"), { afterId: "nope", index: 50 })), ["a", "b", "x"]);
  });
  check("the moved row is taken out of its old place first", () => {
    assert.deepEqual(ids(placeAmongSiblings([r("a"), r("b"), r("c")], r("a"), { afterId: "c", index: 0 })), ["b", "c", "a"]);
  });
  check("untouched rows keep their identity", () => {
    const a = r("a"), b = r("b"), c = r("c");
    const out = placeAmongSiblings([a, b, c], c, { afterId: null, index: 0 });
    assert.equal(out[1], a);
    assert.equal(out[2], b);
  });
  check("THE BUG: server [A, img, B, C], screen [A, B, C], drag A below B — the anchor lands it there", () => {
    // img is referenced media: in the server's sibling list, but shown in a
    // separate block, so the screen's primary rows are A, B, C.
    const server = [r("A"), r("img"), r("B"), r("C")];
    const primary = (list: { id: string }[]) => ids(list).filter((id) => id !== "img");
    // The old index contract: the drop index among A,B,C (2, minus 1 for a
    // downward move) applied to the server's list put A back FIRST.
    const oldWay = [...server.filter((x) => x.id !== "A")];
    oldWay.splice(1, 0, r("A"));
    assert.deepEqual(primary(oldWay), ["A", "B", "C"], "the old way silently undoes the drop");
    // The anchor means the same thing in both lists.
    assert.deepEqual(primary(placeAmongSiblings(server, r("A"), { afterId: "B", index: 1 })), ["B", "A", "C"]);
  });
}

console.log("\nplacing a row under a parent (insertUnderParent — the carried shortcut targets)");
{
  type N = { id: string; parentId?: string | null; role?: string | null; children?: N[]; references?: N[] };
  const tree = (): N[] => [
    { id: "out", children: [{ id: "a" }, { id: "b" }], references: [{ id: "img" }] },
    { id: "other", children: [{ id: "x" }] },
  ];
  check("lands under the parent, after its anchor", () => {
    const next = insertUnderParent(tree(), "out", { id: "new" }, { afterId: "a", index: 0 });
    assert.deepEqual(next[0].children!.map((c) => c.id), ["a", "new", "b"]);
    assert.equal(next[0].children![1].parentId, "out");
  });
  check("a referenced row lands in the parent's references", () => {
    const next = insertUnderParent(tree(), "out", { id: "r", role: "referenced" }, { afterId: null, index: 0 });
    assert.deepEqual(next[0].references!.map((c) => c.id), ["r", "img"]);
  });
  check("deeper parents are found, and other branches keep their identity", () => {
    const t = tree();
    const next = insertUnderParent(t, "x", { id: "deep" }, { afterId: null, index: 0 });
    assert.equal(next[0], t[0]);
    assert.deepEqual(next[1].children![0].children!.map((c) => c.id), ["deep"]);
  });
  check("no such parent → the same array back", () => {
    const t = tree();
    assert.equal(insertUnderParent(t, "missing", { id: "n" }, { afterId: null, index: 0 }), t);
  });
  check("a parent held in references is found too", () => {
    const t: N[] = [{ id: "host", children: [], references: [{ id: "ref-note", children: [] }] }];
    const next = insertUnderParent(t, "ref-note", { id: "n" }, { afterId: null, index: 0 });
    assert.deepEqual(next[0].references![0].children!.map((c) => c.id), ["n"]);
  });
}

console.log("\ndragging a shortcut's rows (moveAcrossForests — view tree + carried targets)");
{
  type N = { id: string; parentId?: string | null; role?: string | null; children?: N[]; references?: N[] };
  // The view shows `inbox`; the shortcut's folder `out` (outside the view)
  // travels beside it, holding a, b, c.
  const forests = () => ({
    main: [{ id: "inbox", children: [{ id: "v1" }] }] as N[],
    carried: [{ id: "out", children: [{ id: "a" }, { id: "b" }, { id: "c" }] }] as N[],
  });
  const ids = (list?: N[]) => (list ?? []).map((n) => n.id);
  check("reorder inside the shortcut: c dragged above a", () => {
    const f = forests();
    const out = moveAcrossForests(f, [{ node: { id: "c" }, placement: { afterId: null, index: 0 } }], "out");
    assert.deepEqual(ids(out.carried[0].children), ["c", "a", "b"]);
    assert.equal(out.main, f.main, "the view's tree is untouched");
  });
  check("drag out of the shortcut into a view folder", () => {
    const out = moveAcrossForests(forests(), [{ node: { id: "b" }, placement: { afterId: "v1", index: 1 } }], "inbox");
    assert.deepEqual(ids(out.carried[0].children), ["a", "c"]);
    assert.deepEqual(ids(out.main[0].children), ["v1", "b"]);
  });
  check("drag from the view into the shortcut, at an anchor", () => {
    const out = moveAcrossForests(forests(), [{ node: { id: "v1" }, placement: { afterId: "a", index: 1 } }], "out");
    assert.deepEqual(ids(out.main[0].children), []);
    assert.deepEqual(ids(out.carried[0].children), ["a", "v1", "b", "c"]);
  });
  check("drag out of the shortcut to the view's top level", () => {
    const out = moveAcrossForests(forests(), [{ node: { id: "a" }, placement: { afterId: null, index: 0 } }], null);
    assert.deepEqual(ids(out.main), ["a", "inbox"]);
    assert.deepEqual(ids(out.carried[0].children), ["b", "c"]);
  });
  check("moveTouchesCarried: a shortcut row's item, or a destination only in carried", () => {
    const f = forests();
    assert.equal(moveTouchesCarried(f, ["a"], "inbox"), true, "dragging an item that lives only in carried");
    assert.equal(moveTouchesCarried(f, ["v1"], "out"), true, "dropping onto an out-of-view shortcut's folder");
    assert.equal(moveTouchesCarried(f, ["v1"], "inbox"), false, "a move within the view");
    assert.equal(moveTouchesCarried(f, ["v1"], null), false, "to the view's top level");
  });
  check("several rows keep their drag order", () => {
    const out = moveAcrossForests(
      forests(),
      [
        { node: { id: "a" }, placement: { afterId: "c", index: 3 } },
        { node: { id: "b" }, placement: { afterId: "a", index: 4 } },
      ],
      "out",
    );
    assert.deepEqual(ids(out.carried[0].children), ["c", "a", "b"]);
  });
}

console.log("\nthe drop's anchor (resolveDropAnchor + dropRowFor)");
{
  const row = (id: string, kind: DropRow["kind"] = "primary", anchorId: string | null = id): DropRow => ({ id, anchorId, kind });
  check("the nearest same-kind row before the drop point", () => {
    assert.equal(resolveDropAnchor([row("a"), row("b"), row("c")], 2, new Set(), "primary"), "b");
  });
  check("dropped at the top → null (first)", () => {
    assert.equal(resolveDropAnchor([row("a"), row("b")], 0, new Set(), "primary"), null);
  });
  check("the rows being dragged are never their own anchor", () => {
    assert.equal(resolveDropAnchor([row("a"), row("b"), row("c")], 2, new Set(["b"]), "primary"), "a");
  });
  check("an open reference block at the start doesn't anchor a primary row", () => {
    const rows = [row("r1", "reference"), row("r2", "reference"), row("a"), row("b")];
    assert.equal(resolveDropAnchor(rows, 2, new Set(), "primary"), null, "dropped above the first primary = first");
    assert.equal(resolveDropAnchor(rows, 3, new Set(), "primary"), "a");
  });
  check("…and a reference is anchored among references", () => {
    const rows = [row("r1", "reference"), row("r2", "reference"), row("a")];
    assert.equal(resolveDropAnchor(rows, 2, new Set(["r1"]), "reference"), "r2");
  });
  check("rows with no content id are skipped (people mounts, pending rows)", () => {
    assert.equal(resolveDropAnchor([row("a"), row("person:x", "primary", null)], 2, new Set(), "primary"), "a");
  });
  const uuid = "123e4567-e89b-42d3-a456-426614174000";
  const target = "223e4567-e89b-42d3-a456-426614174000";
  check("dropRowFor: real content anchors as itself", () => {
    assert.deepEqual(dropRowFor({ id: uuid }), { id: uuid, anchorId: uuid, kind: "primary" });
  });
  check("dropRowFor: a shortcut mirror anchors as the child it mirrors", () => {
    assert.equal(dropRowFor({ id: "mirror:x/y", isShortcutMirror: true, mirrorOf: target }).anchorId, target);
  });
  check("dropRowFor: a window-reference row never anchors (derived, not a sibling)", () => {
    assert.equal(dropRowFor({ id: `wref:${uuid}/${target}`, isShortcutMirror: true, mirrorOf: target, windowRef: { targetId: target }, isNestedReference: true }).anchorId, null);
  });
  check("dropRowFor: people mounts and pending rows don't anchor", () => {
    assert.equal(dropRowFor({ id: "person:abc" }).anchorId, null);
    assert.equal(dropRowFor({ id: "temp-123" }).anchorId, null);
  });
  check("dropRowFor: a spliced-in reference row is reference kind", () => {
    assert.equal(dropRowFor({ id: uuid, isNestedReference: true }).kind, "reference");
  });
}

console.log("\nremoveNodesFromTree");
{
  check("removes a top-level row; its neighbours keep their identity", () => {
    const tree = fixture();
    const next = removeNodesFromTree(tree, new Set(["b"]));
    assert.deepEqual(ids(next), ["a", "c"]);
    assert.equal(next[0], tree[0]);
    assert.equal(next[1], tree[2]);
  });

  check("removes a nested row; only the path to it is rebuilt", () => {
    const tree = fixture();
    const next = removeNodesFromTree(tree, new Set(["a1"]));
    assert.deepEqual(ids(next[0].children!), ["a2"]);
    assert.notEqual(next[0], tree[0], "the parent of a removed row is new");
    assert.equal(next[0].children![0], tree[0].children![1], "its untouched sibling is not");
    assert.equal(next[1], tree[1], "an untouched branch keeps its identity");
  });

  check("removes a row held in a parent's references", () => {
    const tree = fixture();
    const next = removeNodesFromTree(tree, new Set(["r1"]));
    assert.deepEqual(next[0].children![1].references, []);
  });

  check("a removed folder takes its whole subtree", () => {
    const next = removeNodesFromTree(fixture(), new Set(["b"]));
    assert.equal(JSON.stringify(next).includes("b1x"), false);
  });

  check("nothing matched → the SAME array back (no re-render)", () => {
    const tree = fixture();
    assert.equal(removeNodesFromTree(tree, new Set(["nope"])), tree);
    assert.equal(removeNodesFromTree(tree, new Set()), tree);
  });

  check("partial failure: the snapshot minus only what succeeded restores failures IN PLACE", () => {
    const snapshot = fixture();
    // The user deleted a1 and c; only c succeeded on the server.
    const shown = removeNodesFromTree(snapshot, new Set(["a1", "c"]));
    assert.deepEqual(ids(shown), ["a", "b"]);
    const restored = removeNodesFromTree(snapshot, new Set(["c"]));
    assert.deepEqual(ids(restored[0].children!), ["a1", "a2"], "a1 is back at index 0, not appended");
    assert.deepEqual(ids(restored), ["a", "b"]);
  });
}

console.log("\ncollectRemovedIds");
{
  check("a root and everything under it, children and references", () => {
    const removed = collectRemovedIds(fixture(), new Set(["a", "b1"]));
    assert.deepEqual([...removed].sort(), ["a", "a1", "a2", "b1", "b1x", "r1"]);
  });

  check("nothing outside the removed subtrees", () => {
    const removed = collectRemovedIds(fixture(), new Set(["b1"]));
    assert.equal(removed.has("b"), false);
    assert.equal(removed.has("c"), false);
  });
}

console.log("\nwithoutIds");
{
  check("drops removed ids", () => {
    assert.deepEqual(withoutIds(["a", "b", "c"], new Set(["b"])), ["a", "c"]);
  });
  check("nothing dropped → the SAME array back (lets the caller skip a store write)", () => {
    const input = ["a", "c"];
    assert.equal(withoutIds(input, new Set(["b"])), input);
  });
}

const source = readFileSync(
  join(__dirname, "../components/content/content/LeftSidebarContent.tsx"),
  "utf8",
);
/** The text of a `const name = …` declaration, up to the next marker. */
function sliceBetween(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, `markers moved (${startMarker} → ${endMarker}) — update this gate`);
  return source.slice(start, end);
}

console.log("\nthe sidebar's refresh entry point (source pin)");
{
  check("fetchTree asks refreshIsQuiet — no refresh path forces the skeleton", () => {
    const fetchTree = sliceBetween("const fetchTree = useCallback(", "// Initial load and refresh");
    assert.ok(fetchTree.includes("refreshIsQuiet(loadedScopeRef.current, treeScope)"));
  });
  check("nothing calls loadTree(false) directly", () => {
    assert.equal(source.includes("loadTree(false)"), false);
  });
  check("a load applies (and marks its scope on-screen) only after treeResponseApplies", () => {
    const loadTree = sliceBetween("const loadTree = useCallback(", "const fetchTree = useCallback(");
    const guard = loadTree.indexOf("treeResponseApplies(");
    assert.ok(guard > 0 && loadTree.indexOf("setTreeData(result.data.tree)") > guard);
    const mark = loadTree.indexOf("loadedScopeRef.current = requestScope");
    assert.ok(guard > 0 && mark > guard);
  });
}

console.log("\nthe delete dialog (source pin)");
{
  const handleDelete = sliceBetween("const handleDelete = async", "const handleDeleteConfirmed = async");
  check("the dialog opens before any Google Drive request", () => {
    const open = handleDelete.indexOf("setDeleteConfirm({");
    const firstFetch = handleDelete.indexOf("fetch(");
    assert.ok(open > 0 && firstFetch > open);
  });
  check("only file rows are probed (Drive copies live in a FilePayload)", () => {
    assert.ok(handleDelete.includes(".filter((node) => node.file)"));
  });
  check("a late probe answer lands only in the dialog it was started for", () => {
    assert.ok(handleDelete.includes("current.driveProbeToken === driveProbeToken"));
  });
  check("confirming never re-fetches Drive metadata", () => {
    const confirmed = sliceBetween("const handleDeleteConfirmed = async", "const handleDownload = async");
    assert.equal(confirmed.includes("storageMetadata"), false);
  });
  check("Drive copies are passed only when the box is ticked", () => {
    assert.ok(source.includes("hasGoogleAuth && deleteFromGoogleDrive ? deleteConfirm.googleDriveFiles : []"));
  });
}

console.log("\nthe delete handler (source pin)");
{
  const start = source.indexOf("const handleDeleteConfirmed = async");
  const end = source.indexOf("const handleDownload = async", start);
  assert.ok(start > 0 && end > start, "handleDeleteConfirmed / handleDownload markers moved — update this gate");
  const body = source.slice(start, end);

  check("removes the rows before any request is made", () => {
    const remove = body.indexOf("removeNodesFromTree(");
    const firstFetch = body.indexOf("fetch(");
    assert.ok(remove > 0, "no optimistic removal");
    assert.ok(remove < firstFetch, "the removal must come before the first request");
  });
  check("reconciles quietly through endTreeEdit() in its finally", () => {
    assert.ok(/finally \{[\s\S]*endTreeEdit\(\)/.test(body));
    assert.ok(body.indexOf("beginTreeEdit()") > 0 && body.indexOf("beginTreeEdit()") < body.indexOf("try {", body.indexOf("beginTreeEdit()")));
  });
  check("never calls fetchTree() — the skeleton path that unmounts the tree", () => {
    assert.equal(/\bfetchTree\(/.test(body), false);
  });
  check("prunes selection (FileTree only does it on first mount)", () => {
    assert.ok(body.includes("collectRemovedIds(") && body.includes("setSelectedIds("));
  });
}

console.log("\none order, one placement (source pins)");
{
  const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");
  const treeRoute = read("app/api/content/content/tree/route.ts");
  const moveRoute = read("app/api/content/content/move/route.ts");
  const extension = read("lib/domain/browser-extension/service.ts");
  const fileTree = read("components/content/FileTree.tsx");
  const createRoute = read("app/api/content/content/route.ts");
  const adHocSort = /\.sort\(\(a, b\) => \{\s*if \(a\.displayOrder !== b\.displayOrder\)/;

  check("the tree API, move API and extension tree all sort with compareSiblings", () => {
    for (const [name, text] of [["tree route", treeRoute], ["move route", moveRoute], ["extension", extension]] as const) {
      assert.ok(text.includes("compareSiblings"), `${name} doesn't use compareSiblings`);
      assert.equal(adHocSort.test(text), false, `${name} still has its own displayOrder sort`);
    }
  });
  check("the move route places with placeAmongSiblings and reads afterId", () => {
    assert.ok(moveRoute.includes("placeAmongSiblings(base, movedItem, placement)"));
    assert.ok(moveRoute.includes("body.afterId"));
  });
  check("the move route's siblings are the OWNER's (root moves renumbered every user's roots)", () => {
    const fn = moveRoute.slice(moveRoute.indexOf("async function moveContentToPosition"));
    const where = fn.slice(fn.indexOf("findMany"), fn.indexOf("deletedAt: null"));
    assert.ok(where.includes("ownerId"));
  });
  check("FileTree resolves the anchor from the rows on screen and passes it up", () => {
    assert.ok(fileTree.includes("resolveDropAnchor(") && fileTree.includes("dropRowFor(row.data)"));
    assert.ok(/onMove\(\{[\s\S]*afterId,/.test(fileTree));
  });
  check("the sidebar sends the anchor and places optimistically with it", () => {
    const move = sliceBetween("const handleMove = async", "const handleRename");
    assert.ok(move.includes("afterId: anchorFor(i)"));
    assert.ok(/index \+ i,\s*anchorFor\(i\),\s*\);/.test(move), "applyMoveToTree must receive the anchor");
    assert.ok(/finally \{[\s\S]*endTreeEdit\(\)/.test(move), "the move must end its edit in a finally");
  });
  check("the inline create asks for the top — where its placeholder already is", () => {
    assert.ok(source.includes('position: "top"'));
    assert.ok(createRoute.includes('position === "top"') && createRoute.includes("displayOrderForTop("));
  });
  check("optimistic rows from outside the tree are inserted sorted, not on top", () => {
    assert.ok(source.includes("sortedInsertIndex(list, node)"));
    assert.equal(source.includes("if (!treeParentId) return [node, ...current];"), false);
  });
}

console.log("\nout-of-view shortcut targets are wired end to end (source pins)");
{
  const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");
  const treeRoute = read("app/api/content/content/tree/route.ts");
  const fileTree = read("components/content/FileTree.tsx");
  check("the tree route carries them and returns them beside the tree", () => {
    assert.ok(treeRoute.includes("outOfScopeShortcutTargets(lite, included)"));
    assert.ok(/data: \{[\s\S]*shortcutTargets,[\s\S]*\}/.test(treeRoute));
  });
  check("the sidebar applies them in the SAME guarded load as the tree", () => {
    const loadTree = sliceBetween("const loadTree = useCallback(", "const fetchTree = useCallback(");
    const apply = loadTree.indexOf("setTreeData(result.data.tree);");
    const targets = loadTree.indexOf("setShortcutTargetTrees(result.data.shortcutTargets ?? []);");
    assert.ok(apply > 0 && targets > apply && loadTree.indexOf("treeResponseApplies(") < apply);
    assert.ok(source.includes("shortcutTargets={shortcutTargetTrees}"));
  });
  check("FileTree indexes them for the mirror", () => {
    assert.ok(fileTree.includes("buildTreeIndex(withReferences, shownTargets)"));
    // shortcutTargets → in-text edits (editedTargets) → kept sorts (shownTargets)
    assert.ok(fileTree.includes("showInTextEdits([data, shortcutTargets ?? NO_CARRIED_TARGETS], inTextEdits)"));
    assert.ok(fileTree.includes("showKeptSorts(editedTargets, null)"));
  });
  check("a drop onto an out-of-view shortcut shows in its mirror at once, and rolls back with the tree", () => {
    const move = sliceBetween("const handleMove = async", "const handleRename");
    assert.ok(move.includes("moveAcrossForests("));
    assert.ok(move.includes("setShortcutTargetTrees(moved.carried);"), "the cross-collection result must be applied");
    assert.equal((move.match(/setShortcutTargetTrees\(targetTreesBefore\)/g) ?? []).length, 2);
  });
}

console.log("\nshortcut rows are draggable (source pins)");
{
  const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");
  const fileTree = read("components/content/FileTree.tsx");
  check("only window rows (and pending rows) can't be picked up — through disableDrag, which react-arborist reads", () => {
    assert.ok(fileTree.includes("disableDrag={onMove ? (row: TreeNode) => isUndraggableRow(row) : true}"));
  });
  check("FileTree moves the real item a shortcut row stands for (mirrorOf)", () => {
    assert.ok(fileTree.includes("node.data.isShortcutMirror && node.data.mirrorOf ? node.data.mirrorOf : node.id"));
    assert.ok(/onMove\(\{\s*dragIds: realDragIds,/.test(fileTree));
  });
  check("the sidebar finds dragged items in the carried targets and moves across both", () => {
    const move = sliceBetween("const handleMove = async", "const handleRename");
    assert.ok(move.includes("findTreeNodeById(targetTreesBefore, id)"));
    assert.ok(move.includes("findPositions(targetTreesBefore)"));
    assert.ok(move.includes("moveAcrossForests("));
    assert.ok(/if \(\s*moveTouchesCarried\(/.test(move), "the move must branch on moveTouchesCarried itself");
  });
}

console.log("\nrows inside a shortcut: references reach the original, delete removes the shortcut (source pins)");
{
  const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");
  const menu = read("components/content/context-menu/file-tree-actions.tsx");
  const fileNode = read("components/content/FileNode.tsx");
  const fileTree = read("components/content/FileTree.tsx");
  const handleDelete = sliceBetween("const handleDelete = async", "const handleDeleteConfirmed = async");

  check("handleDelete maps row ids to delete targets before reading anything (⌥D and the menu both land here)", () => {
    const mapped = handleDelete.indexOf("const ids = deleteTargetsOfRowIds(rowIds)");
    assert.ok(mapped > 0, "handleDelete must map rows through deleteTargetsOfRowIds");
    assert.ok(mapped < handleDelete.indexOf("nodesToDelete"));
    assert.equal(/handleDeleteConfirmed\(rowIds|ids: rowIds/.test(handleDelete), false);
  });
  check("a removal from inside a shortcut says which shortcut went and offers it back", () => {
    assert.ok(/if \(viaShortcut && removed\.length > 0\) announceShortcutRemoval\(/.test(handleDelete));
    const announce = sliceBetween("const announceShortcutRemoval = ", "const handleDelete = async");
    assert.ok(announce.includes('"/api/trash/restore"') && announce.includes('kind: "content"'));
  });
  check("the menu labels Delete by the same rule and still hands over row ids", () => {
    assert.ok(menu.includes("const deleteTargets = deleteTargetsOfRowIds(selectedIds);"));
    assert.ok(/if \(deleteTargets\.length > 0\) \{/.test(menu));
    assert.ok(menu.includes("Remove Shortcut “${enclosingTitle}”"));
    assert.ok(menu.includes("onClick: async () => await onDelete?.(selectedIds)"));
  });
  check("Open and Open In Pane go to the original, never the projection id", () => {
    assert.equal(/setSelectedContentId\(clickedId|openContentInPane\(clickedId/.test(menu), false);
    assert.equal((menu.match(/setSelectedContentId\(contentId,/g) ?? []).length, 2);
    assert.ok(menu.includes("openContentInPane(contentId, target,"));
  });
  check("Download and Star act on the originals", () => {
    assert.ok(menu.includes("onDownload?.(contentIds)"));
    assert.ok(menu.includes("onToggleStar?.(contentIds)"));
  });
  check("edits stay off a mirror row: add, import, charter, view, move, transcribe", () => {
    assert.equal((menu.match(/\(isSingleSelection \|\| !clickedId\) && !isMirrorRow/g) ?? []).length, 2);
    assert.ok(/clickedNode &&\s*!isMirrorRow &&\s*\(clickedNode\.contentType === "note"/.test(menu));
    assert.ok(menu.includes("isFolder && onSetFolderView && !isMirrorRow"));
    assert.ok(menu.includes("!isPeopleMount && !isMirrorRow"));
    assert.ok(/clickedId &&\s*!isMirrorRow &&\s*clickedNode\?\.contentType === "file"/.test(menu));
  });
  check("Copy puts the original on the clipboard (link and paste)", () => {
    assert.ok(fileNode.includes("const contentId = contentIdOfRowId(id);"));
    assert.ok(/id: contentId,\s*title:/.test(fileNode));
  });
  check("⌥R does nothing on a projection row (the menu greys Rename out)", () => {
    assert.ok(fileTree.includes("if (node.data.isShortcutMirror) return;"));
  });
}

console.log("\nwhat a row takes inside it, and drops beside it (drop-rules.ts)");
{
  const row = (id: string, contentType: string, extra: Partial<DropRuleRow> = {}): DropRuleRow =>
    ({ id, contentType, ...extra }) as DropRuleRow;
  const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const folder = row(U(1), "folder");
  const note = row(U(2), "note");
  const file = row(U(3), "file");
  const table = row(U(4), "data");
  const brokenShortcut = row(U(5), "shortcut", { shortcut: { targetId: null, targetDeleted: false, targetContentType: null } as DropRuleRow["shortcut"] });
  const folderShortcut = row(U(6), "shortcut", { shortcut: { targetId: U(60), targetDeleted: false, targetContentType: "folder" } as DropRuleRow["shortcut"] });
  const mirrorNote = row(`smirror:${U(6)}/${U(61)}`, "note", { isShortcutMirror: true, mirrorOf: U(61) });
  const mirrorFolder = row(`smirror:${U(6)}/${U(62)}`, "folder", { isShortcutMirror: true, mirrorOf: U(62) });
  const windowRow = row(`wref:${U(2)}/${U(7)}`, "note", { isShortcutMirror: true, mirrorOf: U(7), windowRef: { targetId: U(7) } });
  const pending = row("temp-123", "note");
  const person = row("person:abc", "folder", { treeNodeKind: "person" });
  const primaryNote = row(U(8), "note");
  const reference = row(U(9), "file", { role: "referenced" });
  const shortcutDrag = row(U(10), "shortcut");
  const promotedRow = row(U(11), "note", { promotedFromTableId: U(4) });

  check("a note or file takes no primary content inside it (the middle-of-row bounce)", () => {
    assert.equal(acceptsDropInto(note, [primaryNote]), false);
    assert.equal(acceptsDropInto(file, [primaryNote]), false);
  });
  check("a folder takes anything", () => assert.equal(acceptsDropInto(folder, [primaryNote, reference]), true));
  check("a note takes referenced items; a table its own rows and other tables; any content a shortcut", () => {
    assert.equal(acceptsDropInto(note, [reference]), true);
    assert.equal(acceptsDropInto(table, [promotedRow]), true);
    assert.equal(acceptsDropInto(table, [row(U(12), "data")]), true);
    assert.equal(acceptsDropInto(table, [primaryNote]), false);
    assert.equal(acceptsDropInto(file, [shortcutDrag]), true);
  });
  check("a folder-shortcut and a folder seen inside one forward; other projections take nothing", () => {
    assert.equal(acceptsDropInto(folderShortcut, [primaryNote]), true);
    assert.equal(acceptsDropInto(mirrorFolder, [primaryNote]), true);
    assert.equal(acceptsDropInto(mirrorNote, [reference]), false);
    assert.equal(acceptsDropInto(windowRow, [reference]), false);
    assert.equal(acceptsDropInto(brokenShortcut, [primaryNote]), false);
    assert.equal(acceptsDropInto(brokenShortcut, [shortcutDrag]), false);
  });
  check("pending and virtual rows take nothing", () => {
    assert.equal(acceptsDropInto(pending, [reference]), false);
    assert.equal(acceptsDropInto(person, [shortcutDrag]), false);
  });
  check("window rows and pending rows can't be dragged; everything else can", () => {
    assert.equal(isUndraggableRow(windowRow), true);
    assert.equal(isUndraggableRow(pending), true);
    assert.equal(isUndraggableRow(mirrorNote), false);
    assert.equal(isUndraggableRow(primaryNote), false);
    assert.equal(acceptsDropInto(folder, [windowRow]), false);
  });
  check("a drop between the rows of a list that can't take it is refused", () => {
    assert.equal(dropRefused({ target: note, holder: folder, drags: [primaryNote], insideRow: false, holderWithinDrags: false }), true);
  });
  check("over the middle of a row that can't take it: allowed beside it, if the row's list can", () => {
    assert.equal(dropRefused({ target: note, holder: folder, drags: [primaryNote], insideRow: true, holderWithinDrags: false }), false);
    assert.equal(dropRefused({ target: note, holder: null, drags: [primaryNote], insideRow: true, holderWithinDrags: false }), false);
    assert.equal(dropRefused({ target: reference, holder: note, drags: [primaryNote], insideRow: true, holderWithinDrags: false }), true);
    assert.equal(dropRefused({ target: note, holder: folder, drags: [primaryNote], insideRow: true, holderWithinDrags: true }), true);
  });
  check("a row that takes the drag inside it, and the top level, always allow it", () => {
    assert.equal(dropRefused({ target: folder, holder: null, drags: [primaryNote], insideRow: true, holderWithinDrags: false }), false);
    assert.equal(dropRefused({ target: null, holder: null, drags: [primaryNote], insideRow: false, holderWithinDrags: false }), false);
  });
  check("an undraggable row is refused everywhere", () => {
    assert.equal(dropRefused({ target: null, holder: null, drags: [windowRow], insideRow: false, holderWithinDrags: false }), true);
  });
  check("the pointer's half of a row decides above/below", () => {
    assert.equal(dropEdgeAt(109, 100, 32), "above");
    assert.equal(dropEdgeAt(117, 100, 32), "below");
  });
  check("beside a row lands at its position (above) or just after it (below)", () => {
    const rows = ["a", "b", "c"].map((id) => ({ id, anchorId: id, kind: "primary" as const }));
    assert.equal(resolveDropAnchor(rows, besideRowIndex(1, "above"), new Set(), "primary"), "a");
    assert.equal(resolveDropAnchor(rows, besideRowIndex(1, "below"), new Set(), "primary"), "b");
    assert.equal(resolveDropAnchor(rows, besideRowIndex(0, "above"), new Set(), "primary"), null);
    // Dropping a row beside its own neighbour skips itself.
    assert.equal(resolveDropAnchor(rows, besideRowIndex(2, "above"), new Set(["b"]), "primary"), "a");
  });
}

console.log("\nrenumbering touches only what changed (renumbering)");
{
  check("only rows whose number differs from their position, never the moved row", () => {
    const ordered = [
      { id: "a", displayOrder: 0 },
      { id: "m", displayOrder: 7 },
      { id: "b", displayOrder: 1 },
      { id: "c", displayOrder: 3 },
    ];
    // a stays 0; m is written on its own; b moves 1 → 2; c is already 3.
    assert.deepEqual(renumbering(ordered, "m"), [{ id: "b", displayOrder: 2 }]);
    assert.deepEqual(renumbering([{ id: "a", displayOrder: 0 }, { id: "b", displayOrder: 1 }], "a"), []);
  });
  check("a list already numbered 0..n changes nothing", () => {
    const ordered = [0, 1, 2, 3].map((n) => ({ id: `r${n}`, displayOrder: n }));
    assert.deepEqual(renumbering(ordered, "r0"), []);
  });
}

console.log("\ndrags that stick (source pins)");
{
  const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");
  const fileTree = read("components/content/FileTree.tsx");
  const fileNode = read("components/content/FileNode.tsx");
  const route = read("app/api/content/content/move/route.ts");
  const paste = read("lib/features/content/tree-clipboard.ts");
  const moveToFolder = read("lib/features/content/move.ts");

  check("the drop rules reach react-arborist through disableDrop; no dead canDrop prop", () => {
    assert.ok(fileTree.includes("disableDrop={onMove ? disableDrop : true}"));
    assert.equal(/canDrop\s*\}\s*as any|\{\.\.\.\(\{\s*canDrop/.test(fileTree), false);
    assert.equal(/const canDrop = /.test(fileTree), false);
  });
  check("disableDrop asks dropRefused with the row, its list, and whether the pointer is mid-row", () => {
    const fn = fileTree.slice(fileTree.indexOf("const disableDrop = ("), fileTree.indexOf("// Keyboard shortcuts (scoped to file tree)"));
    assert.ok(fn.includes("const refused = dropRefused({") && fn.includes("if (refused) return true;"));
    assert.ok(fn.includes("target: parentNode.isRoot ? null : parentNode.data,"));
    assert.ok(fn.includes("insideRow: treeRef.current?.state.dnd.index === null,"));
    assert.ok(fn.includes("holderWithinDrags: holder !== null && dragNodes.some((dragNode) => isWithin(holder, dragNode)),"));
  });
  check("handleMove places that drop beside the row, on the half the pointer was in", () => {
    assert.ok(/!acceptsDropInto\(parentNode\.data, drags\)\)\s*\{/.test(fileTree));
    assert.ok(fileTree.includes("index = besideRowIndex(rowIndex, dropEdgeFor(row.id));"));
    assert.ok(/onMove\(\{\s*dragIds: realDragIds,\s*parentId,\s*index,\s*afterId,/.test(fileTree));
  });
  check("the row records the same half it draws its line on, and highlights only when it takes the drop", () => {
    assert.ok(fileNode.includes("const edge = dropEdgeAt(event.clientY, rect.top, rect.height);"));
    assert.ok(fileNode.includes("noteDropEdge(data.id, edge);"));
    assert.ok(fileNode.includes("if (takesDropInside) {"));
  });
  check("a row inside a shortcut prefetches and drags out as the original", () => {
    assert.ok(fileNode.includes("prefetchContent(contentIdOfRowId(node.id));"));
    assert.ok(fileNode.includes("id: contentIdOfRowId(node.id),"));
  });
  check("the move route reads and writes the order in ONE transaction, under both lists' locks", () => {
    const fn = route.slice(route.indexOf("async function moveContentToPosition("));
    const lock = fn.indexOf("await lockSiblingOrder(tx, ownerId, [parentId, current.parentId]);");
    const read = fn.indexOf("tx.contentNode.findMany(");
    assert.ok(fn.includes("prisma.$transaction(async (tx) =>"));
    assert.ok(lock > 0 && read > lock, "the sibling read must come after the lock, inside the transaction");
    assert.equal(/prisma\.contentNode\.findMany\(/.test(fn), false);
  });
  check("renumbering writes only changed rows, in one statement, without updatedAt", () => {
    const slot = read("lib/domain/content/sibling-slot.ts");
    assert.ok(route.includes("await applyRenumbering(tx, renumbering(ordered, contentId));"));
    assert.ok(/UPDATE "ContentNode" AS node\s+SET "displayOrder" = renumbered\.position/.test(slot));
    assert.equal(/ordered\.map\(\(sibling, index\) =>/.test(route), false);
  });
  check("the lock is one advisory lock per list, taken in sorted order", () => {
    const slot = read("lib/domain/content/sibling-slot.ts");
    assert.ok(/\.map\(\(id\) => siblingOrderLockKey\(ownerId, id\)\)\.sort\(\)/.test(slot));
    assert.ok(slot.includes("pg_advisory_xact_lock(hashtextextended(${key}, 0))"));
  });
  check("a quick second drag's moves wait for the first's", () => {
    const move = sliceBetween("const handleMove = async", "const handleRename");
    assert.ok(move.includes("const queued = moveRequestChainRef.current.then(sendMoves);"));
    assert.ok(move.includes("await queued;"));
  });
  check("paste places by anchor after the clicked row, keeping its order", () => {
    assert.equal(paste.includes("newDisplayOrder"), false);
    assert.ok(paste.includes("let afterId = target.id;") && paste.includes("afterId = ids[i];"));
  });
  check("Move to folder keeps the group's order (top, then each after the last)", () => {
    assert.ok(moveToFolder.includes("let afterId: string | null = null;"));
    assert.ok(moveToFolder.includes("body: JSON.stringify({ contentId: id, targetParentId, afterId }),"));
    assert.ok(moveToFolder.includes("afterId = id;"));
  });
  check("the folder views sort manual order exactly like the tree", () => {
    for (const view of ["ListView", "GalleryView"]) {
      const text = read(`components/content/folder-views/${view}.tsx`);
      assert.ok(text.includes("items = items.sort(compareSiblings);"), view);
      assert.equal(text.includes("a.displayOrder - b.displayOrder"), false, view);
    }
  });
}

console.log("\nwhere an arriving row goes (slotForArrival)");
{
  const sorted = [
    { id: "a", title: "a", displayOrder: -1 },
    { id: "b", title: "b", displayOrder: 0 },
    { id: "c", title: "c", displayOrder: 4 },
  ];
  check("top: one before the first — no tie with it, nothing renumbered", () => {
    assert.deepEqual(slotForArrival(sorted, "top", "new"), { displayOrder: -2, changes: [] });
    assert.deepEqual(slotForArrival([], "top", "new"), { displayOrder: 0, changes: [] });
  });
  check("bottom: one after the last", () => {
    assert.deepEqual(slotForArrival(sorted, "bottom", "new"), { displayOrder: 5, changes: [] });
    assert.deepEqual(slotForArrival([], "bottom", "new"), { displayOrder: 0, changes: [] });
  });
  check("after a sibling: takes its position and shifts the rest (a batch keeps its order)", () => {
    const slot = slotForArrival(sorted, { afterId: "a" }, "new");
    assert.equal(slot.displayOrder, 1);
    assert.deepEqual(slot.changes, [
      { id: "a", displayOrder: 0 },
      { id: "b", displayOrder: 2 },
      { id: "c", displayOrder: 3 },
    ]);
  });
  check("an afterId that isn't a sibling (or null) falls back to the top", () => {
    assert.deepEqual(slotForArrival(sorted, { afterId: "gone" }, "new"), { displayOrder: -2, changes: [] });
    assert.deepEqual(slotForArrival(sorted, { afterId: null }, "new"), { displayOrder: -2, changes: [] });
  });
}

console.log("\nrows arriving by other routes land deliberately (source pins)");
{
  const read2 = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");
  const upload = read2("app/api/content/content/upload/simple/route.ts");
  const initiate = read2("app/api/content/content/upload/initiate/route.ts");
  const dialog = read2("components/content/dialogs/FileUploadDialog.tsx");
  const assist = read2("lib/domain/ai/folder-assist/service.ts");
  const bookmarks = read2("lib/domain/browser-bookmarks/service.ts");
  const studio = read2("extensions/studio/server/runs.ts");
  const slot = read2("lib/domain/content/sibling-slot.ts");

  check("claiming a slot locks the list before reading it", () => {
    const fn = slot.slice(slot.indexOf("export async function claimSiblingSlot("));
    const lock = fn.indexOf("await lockSiblingOrder(tx, ownerId, [parentId]);");
    assert.ok(lock > 0 && fn.indexOf("tx.contentNode.findMany(") > lock);
  });
  check("uploads: top of the folder, a batch in order, referenced content appended — slot and row in one transaction", () => {
    assert.ok(/role === "referenced"\s*\?\s*"bottom"\s*:\s*typeof afterUploadId === "string" && afterUploadId\s*\?\s*\{ afterId: afterUploadId \}\s*:\s*"top"/.test(upload));
    assert.ok(/created = await prisma\.\$transaction\(async \(tx\) => \{\s*const displayOrder = await claimSiblingSlot\(tx,/.test(upload));
    assert.ok(/return tx\.contentNode\.create\(\{\s*data: \{[\s\S]*?\n\s*displayOrder,\n\s*\},\s*\}\);\s*\}(?:, ORDER_TRANSACTION)?\);/.test(upload), "the claimed slot must be what the upload stores");
    assert.ok(/return tx\.contentNode\.create\(\{\s*data: \{[\s\S]*?\n\s*displayOrder,\n/.test(initiate), "the claimed slot must be what the presigned upload stores");
    assert.equal(upload.includes("displayOrder: 0,"), false);
    assert.ok(/placement: role === "referenced" \? "bottom" : "top",/.test(initiate));
    assert.ok(dialog.includes("uploadSingleFile(files[i], i, customName, previousUploadId)"));
    assert.ok(dialog.includes("if (uploaded.contentId) previousUploadId = uploaded.contentId;"));
    assert.ok(dialog.includes('if (afterId) formData.append("afterId", afterId);'));
  });
  check("Folder assistant: top of the folder in order, Undo restores the old place", () => {
    assert.ok(assist.includes('const placement: ArrivalPlacement = afterId ? { afterId } : "top";'));
    assert.ok(assist.includes("data: { parentId: targetFolderId, displayOrder },"));
    assert.ok(assist.includes("prevOrders[id] = node.displayOrder;"));
    assert.ok(assist.includes("? { displayOrder: Math.trunc(prevOrder) }"));
    assert.equal((assist.match(/undo: \{ prevParents, prevOrders,/g) ?? []).length, 3);
  });
  check("bookmarks: each saved bookmark is its own new row, appended — no dedupe pulling an existing link out of its folder", () => {
    assert.equal(/dedupe/i.test(bookmarks), false, "bookmark dedupe was removed (owner, 2026-10-06)");
    assert.ok(bookmarks.includes("const displayOrder = await nextDisplayOrder(parentId);"));
  });
  check("Studio outputs land newest-first at the top of the outputs folder", () => {
    assert.equal((studio.match(/await placeExistingRow\(\{ ownerId: ctx\.userId, rowId: (node\.id|speech\.contentId), parentId: outputsFolderId, placement: "top" \}\);/g) ?? []).length, 3);
  });
}

console.log("\nsorting one level (sortLevel — the header's sort menu)");
{
  const row = (id: string, title: string, extra: Partial<LevelSortRow> = {}): LevelSortRow => ({
    id,
    title,
    displayOrder: 0,
    folderLike: false,
    nested: false,
    ...extra,
  });
  const ids = (rows: LevelSortRow[]) => rows.map((r) => r.id).join(",");
  const level = [
    row("1", "zeta"),
    row("2", "Beta", { folderLike: true, nested: true }),
    row("3", "note 10", { nested: true }),
    row("4", "alpha", { folderLike: true }),
    row("5", "note 2"),
  ];

  check("Float folders: folders to the top, each part keeping its order", () => {
    assert.equal(ids(sortLevel(level, "float-folders").ordered), "2,4,1,3,5");
  });
  check("Float nested: items holding others to the top, each part keeping its order", () => {
    assert.equal(ids(sortLevel(level, "float-nested").ordered), "2,3,1,4,5");
  });
  check("Name: 0–9, A–Z, case-insensitive, numbers by value", () => {
    const sorted = sortLevel(level, "name");
    assert.equal(sorted.direction, "asc");
    assert.equal(ids(sorted.ordered), "4,2,5,3,1");
    assert.ok(compareNames({ title: "note 2" }, { title: "note 10" }) < 0);
    assert.ok(compareNames({ title: "2024 plan" }, { title: "apple" }) < 0);
  });
  check("Name toggles: a level already A–Z goes Z–A, and back", () => {
    const ascending = sortLevel(level, "name").ordered;
    assert.equal(nextNameDirection(ascending), "desc");
    const descending = sortLevel(ascending, "name");
    assert.equal(descending.direction, "desc");
    // A–Z happened to put both folders (alpha, Beta) above everything else,
    // so they read as a floated block and stay on top: Z–A within each part.
    assert.equal(ids(descending.ordered), "2,4,1,3,5");
    // With no block on top, Z–A is the whole list reversed by name.
    const flat = [row("a", "b"), row("b", "c"), row("c", "a")];
    const flatAscending = sortLevel(flat, "name").ordered;
    assert.equal(ids(sortLevel(flatAscending, "name").ordered), "b,a,c");
    assert.equal(sortLevel(descending.ordered, "name").direction, "asc");
  });
  check("Name keeps floated folders on top, sorting each part (the combination)", () => {
    const floated = sortLevel(level, "float-folders").ordered;
    assert.equal(ids(sortLevel(floated, "name").ordered), "4,2,5,3,1");
    const floatedNested = sortLevel(level, "float-nested").ordered;
    assert.equal(ids(sortLevel(floatedNested, "name").ordered), "2,3,4,5,1");
  });
  check("identical names never read as already sorted (Name sorts A–Z first)", () => {
    assert.equal(nextNameDirection([row("a", "x"), row("b", "x")]), "asc");
    assert.equal(nextNameDirection([row("a", "x")]), "asc");
  });
  check("a shortcut to a live folder counts as a folder; to a note, or a trashed folder, not", () => {
    assert.equal(isFolderLike({ contentType: "folder" }), true);
    assert.equal(isFolderLike({ contentType: "shortcut", shortcut: { targetId: "t", targetDeleted: false, targetContentType: "folder" } }), true);
    assert.equal(isFolderLike({ contentType: "shortcut", shortcut: { targetId: "t", targetDeleted: false, targetContentType: "note" } }), false);
    assert.equal(isFolderLike({ contentType: "shortcut", shortcut: { targetId: "t", targetDeleted: true, targetContentType: "folder" } }), false);
  });
}

console.log("\nwhat a folder remembers (KeptSort)");
{
  const row = (id: string, title: string, extra: Partial<LevelSortRow> = {}): LevelSortRow => ({
    id, title, displayOrder: 0, folderLike: false, nested: false, ...extra,
  });
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id).join(",");
  const level = [
    row("1", "zeta"),
    row("2", "Beta", { folderLike: true, nested: true }),
    row("3", "note 10", { nested: true }),
    row("4", "alpha", { folderLike: true }),
    row("5", "note 2"),
  ];
  check("a float toggles, the other float replaces it, Name cycles A–Z / Z–A, stop forgets", () => {
    assert.deepEqual(nextKeptSort(null, "float-folders"), { float: "folders" });
    assert.equal(nextKeptSort({ float: "folders" }, "float-folders"), null);
    assert.deepEqual(nextKeptSort({ float: "folders" }, "float-nested"), { float: "nested" });
    assert.deepEqual(nextKeptSort({ float: "folders" }, "name"), { float: "folders", name: "asc" });
    assert.deepEqual(nextKeptSort({ name: "asc" }, "name"), { name: "desc" });
    assert.deepEqual(nextKeptSort({ name: "desc" }, "name"), { name: "asc" });
    assert.equal(nextKeptSort({ float: "nested", name: "asc" }, "stop"), null);
  });
  check("stored memory is read defensively", () => {
    assert.equal(parseKeptSort(undefined), null);
    assert.equal(parseKeptSort({ float: "sideways", name: 3 }), null);
    assert.deepEqual(parseKeptSort({ float: "nested", name: "desc", extra: 1 }), { float: "nested", name: "desc" });
  });
  check("a kept sort orders the level: float on top, then by name within each part", () => {
    assert.equal(ids(applyKeptSort(level, { float: "folders" })), "2,4,1,3,5");
    assert.equal(ids(applyKeptSort(level, { float: "nested" })), "2,3,1,4,5");
    assert.equal(ids(applyKeptSort(level, { name: "asc" })), "4,2,5,3,1");
    assert.equal(ids(applyKeptSort(level, { float: "folders", name: "asc" })), "4,2,5,3,1");
    assert.equal(ids(applyKeptSort(level, { float: "folders", name: "desc" })), "2,4,1,3,5");
  });
}

console.log("\nkept sorts on the client (kept-sort-display.ts)");
{
  type N = Pick<TreeNode, "id" | "title" | "displayOrder" | "contentType" | "folder"> & { children?: N[] };
  const n = (id: string, title: string, contentType: TreeNode["contentType"] = "note", extra: Partial<N> = {}): N =>
    ({ id, title, displayOrder: 0, contentType, ...extra });
  const folderWith = (kept: TreeNode["folder"] extends infer F ? F : never) => kept;
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id).join(",");
  const sortedFolder = n("f", "f", "folder", {
    folder: folderWith({ viewMode: "list", sortMode: null, includeReferencedContent: false, treeSort: { name: "asc" } }),
    children: [n("b", "b"), n("a", "a")],
  });
  const manualFolder = n("m", "m", "folder", { children: [n("y", "y"), n("x", "x")] });
  check("a folder that keeps a sort shows its children in it; a manual folder keeps its order", () => {
    const shown = showKeptSorts([sortedFolder, manualFolder], null);
    assert.equal(ids(shown[0].children ?? []), "a,b");
    assert.equal(shown[1], manualFolder);
  });
  check("the top level follows the view root's sort", () => {
    assert.equal(ids(showKeptSorts([n("z", "z"), n("k", "k")], { name: "asc" })), "k,z");
  });
  check("same input, same output object (no needless re-renders)", () => {
    const tree = [sortedFolder, manualFolder];
    assert.equal(showKeptSorts(tree, null), showKeptSorts(tree, null));
  });
  check("clearing a folder's sort fixes its rows in the shown order, then forgets the sort", () => {
    const cleared = clearKeptSort([sortedFolder], "f");
    assert.equal(ids(cleared[0].children ?? []), "a,b");
    assert.equal(cleared[0].folder?.treeSort, null);
    assert.equal(ids(orderKeptLevel([n("z", "z"), n("k", "k")], { name: "asc" })), "k,z");
  });
}

console.log("\nthe sort menu: one level, a folder keeps it (source pins)");
{
  const read3 = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");
  const route = read3("app/api/content/content/reorder/route.ts");
  const move = read3("app/api/content/content/move/route.ts");
  const treeRoute = read3("app/api/content/content/tree/route.ts");
  const menu = read3("components/content/headers/FileTreeSortMenu.tsx");
  const header = read3("components/content/headers/LeftSidebarHeader.tsx");
  const add = read3("components/content/headers/LeftSidebarHeaderActions.tsx");
  const sidebar = read3("components/content/content/LeftSidebarContent.tsx");
  const fileTree = read3("components/content/FileTree.tsx");
  const validation = read3("lib/features/settings/validation.ts");

  check("the reorder route sorts ONE level under its lock, writes changed rows, and remembers on folders", () => {
    const sort = route.slice(route.indexOf("// ── Sort ──"));
    const lock = sort.indexOf("await lockSiblingOrder(tx, ownerId, [parentId]);");
    assert.ok(lock > 0 && sort.indexOf("await loadLevelRows(tx, ownerId, parentId)") > lock);
    assert.ok(sort.includes("const kept = nextKeptSort(previousKept, mode);"));
    assert.ok(sort.includes("const shown = previousKept ? applyKeptSort(rows, previousKept) : rows;"));
    assert.ok(sort.includes("await writeKeptSort(tx, parentId, kept);"));
    assert.ok(/if \(parentId === null\) \{\s*const \{ ordered, direction \} = sortLevel\(rows,/.test(sort), "the top level sorts once");
  });
  check("Undo restores only live items directly inside that level, and the folder's previous sort", () => {
    const undo = route.slice(route.indexOf("// ── Undo"), route.indexOf("// ── Sort ──"));
    assert.ok(undo.includes("where: { id: { in: restore.map((entry) => entry.id) }, parentId, ownerId, deletedAt: null },"));
    assert.ok(undo.includes("const changes = restore.filter((entry) => allowed.has(entry.id));"));
    assert.ok(undo.includes("await writeKeptSort(tx, parentId, parseKeptSort(body.kept));"));
  });
  check("a drag within a sorted folder starts from its shown order and turns the sort off", () => {
    assert.ok(move.includes("current.parentId === parentId ? await readKeptSort(tx, ownerId, parentId) : null;"));
    assert.ok(move.includes("? applyKeptSort(await loadLevelRows(tx, ownerId, parentId), kept)"));
    assert.ok(move.includes("if (kept && parentId) await writeKeptSort(tx, parentId, null);"));
    assert.ok(move.includes("sortCleared: updated.sortCleared,"));
    assert.ok(sidebar.includes("optimisticTree = clearKeptSort(optimisticTree, parentId);"));
    assert.ok(sidebar.includes("if (moved?.sortCleared) sortCleared = true;"));
  });
  check("the tree shows a sorted folder in its sort (server and client), the top level by the view root's", () => {
    assert.ok(treeRoute.includes("sortChildren(node.children, node.folder?.treeSort ?? null);"));
    assert.ok(treeRoute.includes("sortChildren(rootNodes, rootTreeSort);"));
    assert.ok(treeRoute.includes("viewPrefs: true,"));
    // data → in-text edits (editedData) → kept sorts (shownData)
    assert.ok(/const shownData = useMemo\(\s*\(\) => showKeptSorts\(editedData, rootTreeSort \?\? null\),\s*\[editedData, rootTreeSort\],\s*\);/.test(fileTree));
    assert.ok(/expandReferences\(\s*shownData,/.test(fileTree));
  });
  check("a folder's sort lives on the folder (never in user settings); no checkmarks, no focus ring", () => {
    assert.equal(validation.includes("fileTreeSort"), false);
    assert.equal(/DropdownMenuCheckboxItem/.test(menu), false);
    assert.ok(menu.includes("onCloseAutoFocus={(event) => event.preventDefault()}"));
    assert.ok(sidebar.includes("remembers: !virtual && serverParentId !== null,"));
  });
  check("a shortcut's own sort is a view-only setting: it never posts a reorder to the folder", () => {
    const runShortcut = menu.slice(menu.indexOf("const runShortcut = async"), menu.indexOf("const run = async"));
    assert.ok(runShortcut.includes("await settings.setUISettings({ shortcutSorts: after });"));
    assert.equal(runShortcut.includes("postReorder("), false);
    assert.ok(menu.includes("if (isShortcut) return runShortcut(mode);"));
    assert.ok(/shortcutSorts: z\s*\.record\(/.test(validation));
  });
  check("the mirror applies a shortcut's own sort; selecting a shortcut sorts THAT shortcut", () => {
    assert.ok(/hiddenNestedShortcutIds,\s*0,\s*shortcutSorts,\s*\);/.test(fileTree));
    assert.ok(sidebar.includes('selectedRow && selectedRow.contentType === "shortcut" && isFolderLike(selectedRow)'));
    assert.ok(sidebar.includes("kept: shortcutSorts?.[selectedRow.id] ?? null,"));
    assert.ok(menu.includes("const target = useTreeTargetStore((state) => state.sortTarget);"));
  });
  check("a row inside a shortcut targets the shortcut for '+' and sort, not the top level", () => {
    assert.ok(sidebar.includes("selectedIds: useTreeStateStore.getState().selectedIds.map(targetRowOfSelection),"));
  });
  check("reordering inside a sorted shortcut turns its sort off (restored if the move fails)", () => {
    const move = sliceBetween("const handleMove = async", "const handleRename");
    assert.ok(move.includes("dropRowId && dropRowId !== parentId && shortcutSorts?.[dropRowId] &&"));
    assert.ok(move.includes("void useSettingsStore.getState().setUISettings({ shortcutSorts: without });"));
    assert.equal((move.match(/restoreShortcutSort\(\);/g) ?? []).length, 2);
  });
  check("a kept sort shows as its glyph in light gold in the header; Stop sorting forgets it", () => {
    assert.ok(menu.includes("<SortGlyph kept={kept} className=\"h-4 w-4\" />"));
    assert.ok(menu.includes("if (kept?.name === \"asc\") return <ArrowDownAZ className={className} />;"));
    assert.ok(menu.includes("className={`rounded p-0.5 transition-colors ${kept ? KEPT_TONE : className}`}"));
    assert.ok(menu.includes('onSelect={() => void run("stop")}'));
    assert.ok(header.includes("<FileTreeSortMenu className={subInactive} />"));
  });
  check("three sorts, each with an icon, a short name and a tooltip naming the target", () => {
    for (const name of ["Float folders", "Float nested", "Name"]) assert.ok(menu.includes(`          ${name}\n`), name);
    assert.ok(menu.includes('onSelect={() => void run("float-folders")}'));
    assert.ok(menu.includes('onSelect={() => void run("float-nested")}'));
    assert.ok(menu.includes('onSelect={() => void run("name")}'));
    assert.ok((menu.match(/\$\{label\}/g) ?? []).length >= 6);
  });
  check("both header buttons name their target, published by the tree as the selection changes", () => {
    assert.ok(add.includes("? `Add a file or folder to ${addTarget.label}`"));
    assert.ok(sidebar.includes("const treeParentId = resolveTreeParent(null, treeData, scopedRootParentId);"));
    assert.ok(sidebar.includes("useTreeTargetStore.getState().setTargets({ addTarget, sortTarget });"));
    assert.ok(sidebar.includes("}, [treeData, treeSelectedIds, scopedRootParentId, scopedRootTitle, rootTreeSort, shortcutSorts]);"));
  });
  check("a sort offers Undo, which posts the previous numbers (and sort) back", () => {
    assert.ok(menu.includes("restore: previous,"));
    assert.ok(menu.includes("{ kept: result.previousKept ?? null }"));
  });
}

console.log("\nno folder inside itself, judged by real ids (wouldNestInItself)");
{
  // A/B/C, with a shortcut in C pointing at A: its contents show B again.
  const parents = new Map<string, string | null>([
    ["A", null],
    ["B", "A"],
    ["C", "B"],
    ["S", "C"], // the shortcut row itself
    ["D", "A"],
  ]);
  const parentOf = (id: string) => parents.get(id);
  check("dragging the mirrored B onto C is refused — C is inside B", () => {
    const mirroredB = { id: "smirror:S/B", isShortcutMirror: true, mirrorOf: "B" };
    assert.equal(realIdOfRow(mirroredB), "B");
    assert.equal(wouldNestInItself("C", [realIdOfRow(mirroredB)], parentOf), true);
  });
  check("dragging B into itself is refused; into a sibling or the top level isn't", () => {
    assert.equal(wouldNestInItself("B", ["B"], parentOf), true);
    assert.equal(wouldNestInItself("D", ["B"], parentOf), false);
    assert.equal(wouldNestInItself(null, ["B"], parentOf), false);
  });
  check("a shortcut pointing ABOVE the view: the view root's ancestry is walked too", () => {
    // View rooted at C; a shortcut in it shows A. Dragging A into the view's top level = into C.
    const viewParents = new Map<string, string | null>([["S", "C"], ["C", "B"], ["B", "A"], ["A", null]]);
    assert.equal(wouldNestInItself("C", ["A"], (id) => viewParents.get(id)), true);
  });
  check("a corrupt parent loop can't hang the check", () => {
    const loop = new Map<string, string | null>([["x", "y"], ["y", "x"]]);
    assert.equal(wouldNestInItself("x", ["z"], (id) => loop.get(id)), false);
  });
}

console.log("\nthe real-id check and the lock timeouts are wired (source pins)");
{
  const read4 = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");
  const fileTree = read4("components/content/FileTree.tsx");
  const treeRoute = read4("app/api/content/content/tree/route.ts");
  check("FileTree refuses a drop that would nest a dragged item inside itself", () => {
    assert.ok(fileTree.includes("return wouldNestInItself(destinationRealId, drags.map(realIdOfRow), (id) => realParentOf.get(id));"));
    assert.ok(fileTree.includes("if (!node.isShortcutMirror) parents.set(node.id, node.parentId ?? null);"));
    assert.ok(fileTree.includes(": (rootAncestry?.[0] ?? null);"));
    assert.ok(treeRoute.includes("rootAncestry.push(at);"));
  });
  check("every transaction holding the order lock gets the generous timeout", () => {
    const files = [
      "app/api/content/content/move/route.ts",
      "app/api/content/content/reorder/route.ts",
      "app/api/content/content/upload/simple/route.ts",
      "app/api/content/content/upload/initiate/route.ts",
      "lib/domain/ai/folder-assist/service.ts",
      "lib/domain/content/sibling-slot.ts",
    ];
    for (const file of files) {
      const text = read4(file);
      // Code only: a doc comment quoting the call (in backticks) isn't one.
      const transactions = (text.match(/(?<!`)prisma\.\$transaction\(async \(tx\)/g) ?? []).length;
      const withTimeout = (text.match(/\}, ORDER_TRANSACTION\);/g) ?? []).length;
      assert.equal(withTimeout, transactions, `${file}: ${withTimeout}/${transactions} transactions carry ORDER_TRANSACTION`);
    }
    assert.ok(read4("lib/domain/content/sibling-slot.ts").includes("export const ORDER_TRANSACTION = { maxWait: 15_000, timeout: 30_000 } as const;"));
  });
}

console.log("\nreferenced content in a note's text stays with that note");
{
  const inA = { reference: { via: "text" as const, inTextOf: { id: "A", title: "Note A" } } };
  const filed = { reference: { via: "filed" as const, inTextOf: null } };
  check("an item in note A's text can't be filed under note B; under A itself it can", () => {
    assert.deepEqual(inTextElsewhere(inA, "B"), { id: "A", title: "Note A" });
    assert.equal(inTextElsewhere(inA, "A"), null);
  });
  check("an item merely filed under a note (a chat, an AI document) can move to another note", () => {
    assert.equal(inTextElsewhere(filed, "B"), null);
    assert.equal(inTextElsewhere({}, "B"), null);
  });
}

console.log("\nthe in-text signal: kept fresh, sent to the tree, shown, enforced (source pins)");
{
  const read5 = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");
  const imageRefs = read5("lib/domain/content/image-refs.ts");
  const collab = read5("lib/domain/collaboration/documents.ts");
  const treeRoute = read5("app/api/content/content/tree/route.ts");
  const fileNode = read5("components/content/FileNode.tsx");
  const move = read5("app/api/content/content/move/route.ts");
  const sidebar = read5("components/content/content/LeftSidebarContent.tsx");
  const backfill = read5("scripts/backfill-media-links.ts");
  check("live collaborative saves refresh media links — links only, never trashing", () => {
    assert.ok(collab.includes("await syncImageReferences(contentId, snapshot, ownerId, { trashOrphans: false });"));
    assert.ok(collab.indexOf("await syncImageReferences(") > collab.indexOf("await syncWindowReferences(prisma, contentId, snapshot);"));
    assert.ok(/if \(trashOrphans\) \{\s*for \(const targetId of orphanedLinks/.test(imageRefs), "trashing must sit behind the flag");
    assert.ok(imageRefs.includes("const trashOrphans = options.trashOrphans ?? true;"), "the REST path keeps cleaning up");
  });
  check("the tree tells each referenced row why it is there (from live notes' text links)", () => {
    assert.ok(/\.filter\(\(item\) => item\.role === "referenced"\)\s*\.map\(\(item\) => item\.id\);/.test(treeRoute), "every referenced row, owned or not");
    assert.ok(treeRoute.includes("source: { deletedAt: null },"));
    assert.ok(treeRoute.includes('? { via: "text" as const, inTextOf: { id: embedder, title }, filedWithNote }'));
    assert.ok(treeRoute.includes("const filedWithNote = !!item.ownedByNoteId;"), "filed = ownedByNoteId, which places it whether or not its note is loaded");
  });
  check("the badge says which: ¶ in the note's text, link when filed", () => {
    assert.ok(/\{data\.reference\?\.via === "text" \? \(\s*<LucideIcons\.Pilcrow className="h-2 w-2" \/>/.test(fileNode), "the ¶ mark shows for in-text items only");
    assert.ok(fileNode.includes('"In this note\'s text — it stays with this note"'));
    assert.ok(fileNode.includes('"Filed under this note, not in its text — it can be moved to another note"'));
  });
  check("filing in-text content under another note is refused — before the move, and by the route", () => {
    assert.ok(sidebar.includes("const holder = inTextElsewhere(node, parentId);"));
    assert.ok(sidebar.includes('toast.warning("Unable to move referenced content", {'));
    assert.ok(move.includes('code: "STILL_EMBEDDED",'));
    assert.ok(move.includes("sourceId: { not: ownerNoteUpdate },"));
  });
  check("the backfill reports by default and never trashes", () => {
    assert.ok(backfill.includes('const APPLY = process.argv.includes("--apply");'));
    assert.ok(backfill.includes("await syncImageReferences(note.id, json, note.ownerId, { trashOrphans: false });"));
    assert.ok(/if \(APPLY\) \{\s*await syncImageReferences/.test(backfill));
  });
}

console.log("\nmedia a note's text gains or loses shows at once (in-text-media.ts)");
{
  const at0 = new Date(0);
  const row = (id: string, over: Partial<TreeNode> = {}): TreeNode => ({
    id,
    title: id,
    slug: id,
    parentId: null,
    displayOrder: 0,
    customIcon: null,
    iconColor: null,
    isPublished: false,
    contentType: "file",
    children: [],
    createdAt: at0,
    updatedAt: at0,
    deletedAt: null,
    ...over,
  });
  const orphan = (id: string, parentId: string, displayOrder = 0) =>
    row(id, { parentId, role: "referenced", displayOrder, reference: { via: "filed", inTextOf: null, filedWithNote: false } });
  const inTextOf = (id: string, noteId: string, over: Partial<TreeNode> = {}) =>
    row(id, { parentId: noteId, role: "referenced", reference: { via: "text", inTextOf: { id: noteId, title: noteId }, filedWithNote: false }, ...over });
  const note = (id: string, references: TreeNode[] = [], parentId = "F") =>
    row(id, { contentType: "note", parentId, references });
  const edit = (inText: boolean, at = 1000) => ({ inText, at });
  const refIds = (node: TreeNode | undefined) => (node?.references ?? []).map((r) => r.id);
  const find = (nodes: TreeNode[], id: string): TreeNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const hit = find(node.children ?? [], id) ?? find(node.references ?? [], id);
      if (hit) return hit;
    }
    return undefined;
  };
  // F (folder): children W (note), N (note: S in its text); references X (an orphan image)
  const fixture = () => {
    const W = note("W");
    const N = note("N", [inTextOf("S", "N")]);
    const X = orphan("X", "F");
    return [row("F", { contentType: "folder", children: [W, N], references: [X] }), row("G", { contentType: "folder" })];
  };

  check("the media in a document: images and audio clips that carry a content id (placeholders don't count)", () => {
    const nodes = [
      { type: { name: "paragraph" }, attrs: {} },
      { type: { name: "image" }, attrs: { contentId: "i1", src: "/x" } },
      { type: { name: "image" }, attrs: { contentId: null, src: "blob:…" } },
      { type: { name: "audioEmbed" }, attrs: { contentId: "a1" } },
      { type: { name: "image" }, attrs: { contentId: "i1" } },
    ];
    const ids = mediaInDoc({ descendants: (visit) => nodes.forEach((node) => visit(node)) });
    assert.deepEqual([...ids].sort(), ["a1", "i1"]);
    assert.deepEqual(mediaChanges(new Set(["a", "b"]), new Set(["b", "c"])), { added: ["c"], removed: ["a"] });
  });
  check("only changes made here count: an arriving change (another session, the document loading) doesn't; an undo does", () => {
    assert.equal(isArrivingChange(undefined), false);
    assert.equal(isArrivingChange({ isChangeOrigin: true }), true);
    assert.equal(isArrivingChange({ isChangeOrigin: true, binding: {} }), true);
    assert.equal(isArrivingChange({ isChangeOrigin: true, isUndoRedoOperation: true }), false);
    assert.equal(isArrivingChange({ isChangeOrigin: false, isUndoRedoOperation: false }), false);
  });
  check("an arriving change moves the baseline unrecorded, so a later local change reports only itself", () => {
    const loaded = trackMediaStep(new Set(), new Set(["a"]), true);
    assert.deepEqual([loaded.added, loaded.removed], [[], []], "the document loading isn't an edit");
    const pasted = trackMediaStep(loaded.known, new Set(["a", "b"]), false);
    assert.deepEqual([pasted.added, pasted.removed], [["b"], []], "only the paste — not the image that arrived");
    const deleted = trackMediaStep(pasted.known, new Set(["b"]), false);
    assert.deepEqual([deleted.added, deleted.removed], [[], ["a"]]);
  });
  check("recording keeps the latest edit per note and media", () => {
    const one = recordInTextEdits(NO_IN_TEXT_EDITS, "W", ["X"], [], 1);
    const two = recordInTextEdits(one, "W", [], ["X"], 2);
    assert.deepEqual(two, { W: { X: { inText: false, at: 2 } } });
    assert.equal(recordInTextEdits(two, "W", [], [], 3), two, "nothing gained or lost: the same edits");
  });
  check("no edits: the very same arrays (react-arborist keys rows off identity)", () => {
    const forests = [fixture(), []];
    assert.equal(showInTextEdits(forests, NO_IN_TEXT_EDITS), forests);
  });
  check("an image pasted into a note joins that note's referenced content at once, out of its folder's", () => {
    const tree = fixture();
    const carried = [row("T", { contentType: "folder", children: [row("t1")] })];
    const [shown, shownCarried] = showInTextEdits([tree, carried], { W: { X: edit(true) } });
    assert.deepEqual(refIds(find(shown, "W")), ["X"]);
    assert.equal(shownCarried, carried, "an untouched forest is the same array");
    assert.deepEqual(refIds(find(shown, "F")), [], "it leaves the folder's referenced content");
    const x = find(shown, "W")!.references![0];
    assert.equal(x.parentId, "W");
    assert.deepEqual(x.reference, { via: "text", inTextOf: { id: "W", title: "W" } });
    assert.equal(find(shown, "N"), find(tree, "N"), "untouched rows keep their identity");
    assert.equal(shown[1], tree[1], "an untouched branch keeps its identity");
  });
  check("an upload the tree hasn't loaded: nothing to show yet, and it is fetched", () => {
    const tree = fixture();
    const edits = { W: { NEW: edit(true) } };
    const forests = [tree, []];
    assert.deepEqual(showInTextEdits(forests, edits), forests);
    assert.deepEqual(missingInTextMedia(forests, edits), ["NEW"]);
    assert.deepEqual(missingInTextMedia(forests, { W: { X: edit(true), GONE: edit(false) } }), [], "only rows still to come");
    assert.equal(settleInTextEdits(forests, edits, 2000), edits, "kept until its row arrives");
  });
  check("an image deleted from a note's text leaves its referenced content at once", () => {
    const [shown] = showInTextEdits([fixture(), []], { N: { S: edit(false) } });
    assert.deepEqual(refIds(find(shown, "N")), []);
    assert.equal(find(shown, "S"), undefined, "the server re-homes it on save; until then it isn't shown twice");
  });
  check("media filed with a note is placed by that, never by text: it stays, only its label changes", () => {
    const filedIn = inTextOf("S", "N", { reference: { via: "text", inTextOf: { id: "N", title: "N" }, filedWithNote: true } });
    const tree = [row("F", { contentType: "folder", children: [note("W"), note("N", [filedIn])] })];
    const [out] = showInTextEdits([tree, []], { N: { S: edit(false) } });
    assert.deepEqual(refIds(find(out, "N")), ["S"]);
    assert.deepEqual(find(out, "S")!.reference, { via: "filed", inTextOf: null, filedWithNote: true });
    const filedOnly = row("P", { parentId: "N", role: "referenced", reference: { via: "filed", inTextOf: null, filedWithNote: true } });
    const tree2 = [row("F", { contentType: "folder", children: [note("W"), note("N", [filedOnly])] })];
    const [into] = showInTextEdits([tree2, []], { W: { P: edit(true) } });
    assert.deepEqual(refIds(find(into, "N")), ["P"], "it stays with the note it is filed with");
    assert.deepEqual(find(into, "P")!.reference, { via: "text", inTextOf: { id: "W", title: "W" }, filedWithNote: true });
  });
  check("cut from one note and pasted into another: it moves between them", () => {
    const [shown] = showInTextEdits([fixture(), []], { N: { S: edit(false, 1000) }, W: { S: edit(true, 1001) } });
    assert.deepEqual(refIds(find(shown, "N")), []);
    assert.deepEqual(refIds(find(shown, "W")), ["S"]);
    assert.equal(find(shown, "S")!.reference?.inTextOf?.id, "W");
  });
  check("already in an older note's text: it stays there (the oldest note holds it)", () => {
    const forests = [fixture(), []];
    assert.deepEqual(showInTextEdits(forests, { W: { S: edit(true) } }), forests);
  });
  check("pasted into two notes: the first keeps it", () => {
    const [shown] = showInTextEdits([fixture(), []], { N: { X: edit(true, 5) }, W: { X: edit(true, 4) } });
    assert.deepEqual(refIds(find(shown, "W")), ["X"]);
    assert.deepEqual(refIds(find(shown, "N")), ["S"]);
  });
  check("it takes its sorted place among the note's referenced content; window rows stay last", () => {
    const W = note("W", [inTextOf("A", "W", { displayOrder: 1 }), inTextOf("C", "W", { displayOrder: 3 }), row("wref:W/T", { role: "referenced", displayOrder: -9 })]);
    const tree = [row("F", { contentType: "folder", children: [W], references: [orphan("B", "F", 2), orphan("E", "F", 5)] })];
    const [shown] = showInTextEdits([tree, []], { W: { B: edit(true), E: edit(true) } });
    assert.deepEqual(refIds(find(shown, "W")), ["A", "B", "C", "E", "wref:W/T"]);
  });
  check("only a note takes media into its text; primary content is never moved", () => {
    const forests = [fixture(), []];
    assert.deepEqual(showInTextEdits(forests, { G: { X: edit(true) } }), forests, "G is a folder");
    const primary = [row("F", { contentType: "folder", children: [note("W"), row("IMG", { parentId: "F", role: "primary" })] })];
    assert.deepEqual(showInTextEdits([primary, []], { W: { IMG: edit(true) } }), [primary, []]);
  });
  check("between the tree and a carried shortcut target", () => {
    const tree = [row("F", { contentType: "folder", children: [note("W")] })];
    const carried = [row("T", { contentType: "folder", references: [orphan("X", "T")] })];
    const [shown, shownCarried] = showInTextEdits([tree, carried], { W: { X: edit(true) } });
    assert.deepEqual(refIds(find(shown, "W")), ["X"]);
    assert.deepEqual(refIds(find(shownCarried, "T")), []);
  });
  check("an edit is dropped once the data shows it — kept while it doesn't, and expired only when the data changes", () => {
    const tree = fixture();
    const edits = { W: { X: edit(true, 1000) }, N: { S: edit(false, 1000) } };
    assert.equal(settleInTextEdits([tree, []], edits, 2000), edits, "the save hasn't landed: both kept, same object");
    const saved = [row("F", { contentType: "folder", children: [note("W", [inTextOf("X", "W")]), note("N")] })];
    assert.deepEqual(settleInTextEdits([saved, []], edits, 2000), {}, "both landed: both dropped");
    assert.deepEqual(settleInTextEdits([tree, []], edits, 1000 + IN_TEXT_EDIT_MAX_AGE_MS + 1), {}, "never confirmed: expired");
    const primary = [row("F", { contentType: "folder", children: [note("W"), row("IMG", { role: "primary" })] })];
    assert.deepEqual(settleInTextEdits([primary, []], { W: { IMG: edit(true) } }, 2000), {}, "primary content: nothing will ever show");
  });
  check("the reconcile waits out Hocuspocus's store window", () => {
    const server = readFileSync(join(__dirname, "../server/hocuspocus/server.ts"), "utf8");
    const max = Number(/HOCUSPOCUS_STORE_MAX_DEBOUNCE_MS \|\| (\d+)\)/.exec(server)?.[1]);
    assert.ok(max > 0 && IN_TEXT_RECONCILE_MS > max, `reconcile (${IN_TEXT_RECONCILE_MS} ms) must come after the store's max debounce (${max} ms)`);
    assert.ok(IN_TEXT_FETCH_MS < 1000);
  });
}

console.log("\nthe in-text edits are recorded, shown and reconciled (source pins)");
{
  const read7 = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");
  const editor = read7("components/content/editor/MarkdownEditor.tsx");
  const tracker = read7("lib/domain/editor/hooks/use-in-text-media-tracker.ts");
  const fileTree = read7("components/content/FileTree.tsx");
  check("every note editor reports its text's media", () => {
    assert.ok(editor.includes("useInTextMediaTracker(editor, contentId);"));
  });
  check("the tracker steps every document change through trackMediaStep and keeps its baseline", () => {
    assert.ok(tracker.includes('isArrivingChange(transaction.getMeta("y-sync$")),'));
    assert.ok(tracker.includes("useInTextMediaStore.getState().record(noteId, step.added, step.removed);"));
    assert.ok(tracker.includes("known = step.known;"));
  });
  check("the tree shows the edits before its kept sorts, across both forests", () => {
    assert.ok(fileTree.includes("showInTextEdits([data, shortcutTargets ?? NO_CARRIED_TARGETS], inTextEdits)"));
    assert.ok(fileTree.includes("() => showKeptSorts(editedData, rootTreeSort ?? null),"));
    assert.ok(fileTree.includes("() => (editedTargets ? showKeptSorts(editedTargets, null) : editedTargets),"));
  });
  check("the sidebar drops edits the data shows, fetches missing rows, and reconciles after the save", () => {
    assert.ok(source.includes("const settled = settleInTextEdits([treeData, shortcutTargetTrees], inTextEdits, Date.now());"));
    assert.ok(source.includes("}, [treeData, shortcutTargetTrees, inTextEdits]);"));
    assert.ok(/if \(missing\.length > 0\) \{\s*timers\.push\(setTimeout\(\(\) => void loadTreeRef\.current\?\.\(true\), IN_TEXT_FETCH_MS\)\);/.test(source));
    assert.ok(source.includes("timers.push(setTimeout(() => void loadTreeRef.current?.(true), IN_TEXT_RECONCILE_MS));"));
    assert.ok(source.includes("}, [inTextRecordedAt]);"));
  });
}

console.log("\nthe tree points at the row that stands for the open content (source pins)");
{
  const read6 = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");
  const fileNode = read6("components/content/FileNode.tsx");
  check("a tree open remembers the row clicked (a shortcut or a row inside one)", () => {
    assert.ok(source.includes("if (viaRowId !== id) standIns.remember(id, viaRowId);"));
    assert.ok(source.includes("else standIns.forget(id);"));
    assert.ok(source.includes("standIns.setActiveRow(viaRowId);"));
    assert.equal((source.match(/\n\s*firstNode\.id,\n\s*\);/g) ?? []).length, 2, "the mirror-row and shortcut opens pass the row clicked");
  });
  check("the follow effect points at the stand-in, revealing only what the tree didn't open itself", () => {
    assert.ok(source.includes("pointTreeAt(selectedContentId, !openedHere);"));
    assert.ok(source.includes("setSelectedIds([rowId]);"));
    assert.ok(source.includes("for (const id of standIn?.expand ?? []) useTreeStateStore.getState().setExpanded(id, true);"));
  });
  check("a retry when the tree arrives never moves a selection it can't place", () => {
    assert.ok(source.includes("pointTreeAt(selectedContentId, true, true);"));
    assert.ok(source.includes("if (!standIn && onlyIfFound) return;"));
  });
  check("a reveal of a row inside a shortcut is held when its shortcut is", () => {
    assert.ok(source.includes("const heldId = shortcutIdOfMirrorRowId(revealRequest.id) ?? revealRequest.id;"));
  });
  check("the gold tones follow the stand-in row", () => {
    assert.ok(fileNode.includes("const isActive = (activeRowId ?? selectedContentId) === data.id;"));
    assert.ok(fileNode.includes("(state.standIns[contentId] ?? contentId) === data.id"));
  });
}

console.log("\nrows open as you drag over them (spring-open.ts)");
{
  //   Z
  //   A          (collapsed until sprung)
  //   ├─ B
  //   │  └─ C
  //   └─ D
  //   E
  const parentOf: Record<string, string | null> = { Z: null, A: null, B: "A", C: "B", D: "A", E: null };
  const order = ["Z", "A", "B", "C", "D", "E"];
  const placeOf = (rowId: string, openedId: string): RowPlace => {
    for (let id: string | null = rowId; id; id = parentOf[id] ?? null) if (id === openedId) return "inside";
    return order.indexOf(rowId) < order.indexOf(openedId) ? "above" : "below";
  };
  const drive = (events: SpringEvent[], from: SpringState = SPRING_IDLE) => {
    let state = from;
    const log: SpringEffects[] = [];
    for (const event of events) {
      const next = springStep(state, event, placeOf);
      state = next.state;
      log.push(next.effects);
    }
    return { state, log, last: log[log.length - 1] };
  };
  const over = (rowId: string | null, opensHere = false): SpringEvent => ({ kind: "over", inTree: true, rowId, opensHere });
  const outside: SpringEvent = { kind: "over", inTree: false, rowId: null, opensHere: false };
  const elapsed = (rowId: string): SpringEvent => ({ kind: "elapsed", rowId });
  const sprungAB = () => drive([over("A", true), elapsed("A"), over("B", true), elapsed("B")]).state;
  const closedBy = (events: SpringEvent[], from?: SpringState) => drive(events, from).log.flatMap((e) => e.close);

  check("the middle band is react-arborist's 'into this row' zone — a quarter in from each edge", () => {
    assert.equal(inMiddleBand(108, 100, 32), false, "exactly a quarter down: still the top edge");
    assert.equal(inMiddleBand(109, 100, 32), true);
    assert.equal(inMiddleBand(123, 100, 32), true);
    assert.equal(inMiddleBand(124, 100, 32), false, "the bottom quarter means 'beside'");
    assert.ok(SPRING_OPEN_DELAY_MS >= 300 && SPRING_OPEN_DELAY_MS <= 1000, "a short rest, not an instant flicker or a long wait");
  });
  check("resting on a collapsed row opens it after the wait — resting on, not re-arming", () => {
    const armed = drive([over("A", true)]);
    assert.equal(armed.last.wait, "A");
    assert.equal(drive([over("A", true)], armed.state).last.wait, undefined, "dragover repeats while resting: the wait isn't restarted");
    const sprung = drive([elapsed("A")], armed.state);
    assert.equal(sprung.last.open, "A");
    assert.deepEqual(sprung.state.opened, ["A"]);
  });
  check("nested: A, then B inside it; moving into what opened keeps it open (the owner's report)", () => {
    const { state, log } = drive([over("A", true), elapsed("A"), over("B", true), elapsed("B"), over("C"), over("B"), over("D")]);
    assert.deepEqual(state.opened, ["A", "B"]);
    assert.deepEqual(log.flatMap((e) => e.close), [], "nothing closed while the pointer stayed inside");
  });
  check("passing BELOW a row the drag opened leaves it open — closing it would pull the rows under the pointer up", () => {
    assert.deepEqual(closedBy([over("D")], sprungAB()), [], "D is below B (and inside A)");
    assert.deepEqual(closedBy([over("E")], sprungAB()), [], "E is below both");
  });
  check("moving ABOVE a row the drag opened closes it (nothing above it moves); deepest first", () => {
    assert.deepEqual(closedBy([over("A")], sprungAB()), ["B"], "A's own row is above B and inside A");
    const back = drive([over("A")], sprungAB());
    assert.deepEqual(back.state.opened, ["A"]);
    assert.deepEqual(closedBy([over("Z")], back.state), ["A"]);
    assert.deepEqual(closedBy([over("Z")], sprungAB()), ["B", "A"]);
  });
  check("over the tree but not a row closes nothing; leaving the tree closes all, deepest first", () => {
    assert.deepEqual(closedBy([over(null)], sprungAB()), [], "the gap or padding between rows says nothing");
    const out = drive([outside], sprungAB());
    assert.deepEqual(out.last.close, ["B", "A"]);
    assert.deepEqual(out.state, SPRING_IDLE);
  });
  check("the edge bands, another row, or a row that doesn't open stop the wait; a stale wait opens nothing", () => {
    const toEdge = drive([over("A", true), over("A", false), elapsed("A")]);
    assert.equal(toEdge.log[1].wait, null);
    assert.equal(toEdge.last.open, null);
    const toOther = drive([over("A", true), over("E", true), elapsed("A")]);
    assert.equal(toOther.log[1].wait, "E");
    assert.equal(toOther.last.open, null, "A's wait was replaced");
    assert.deepEqual(drive([over("C")]).last, { close: [], closeAfterDrop: [], open: null }, "nothing waiting, nothing to do");
    assert.equal(drive([over("A", true), outside]).log[1].wait, null, "leaving the tree stops the wait");
  });
  check("a drop in the tree keeps open what holds it; the rest closes AFTER the drop is handled", () => {
    const at = (rowId: string | null) => drive([{ kind: "drop", inTree: true, rowId }], sprungAB()).last;
    assert.deepEqual(at("C"), { close: [], closeAfterDrop: [], open: null, wait: null }, "inside both");
    assert.deepEqual(at("D").closeAfterDrop, ["B"], "inside A only");
    assert.deepEqual(at("E").closeAfterDrop, ["B", "A"]);
    assert.deepEqual(at(null).closeAfterDrop, ["B", "A"], "dropped on empty space");
    for (const rowId of ["C", "D", "E", null]) assert.deepEqual(at(rowId).close, [], "nothing moves while the drop is read");
    assert.deepEqual(closedBy([{ kind: "drop", inTree: true, rowId: "C" }, { kind: "end" }], sprungAB()), [], "the drop's own dragend closes nothing");
  });
  check("a drag cancelled or dropped elsewhere closes everything it opened, now", () => {
    assert.deepEqual(drive([{ kind: "end" }], sprungAB()).last.close, ["B", "A"]);
    assert.deepEqual(drive([{ kind: "drop", inTree: false, rowId: null }], sprungAB()).last.close, ["B", "A"]);
  });
  check("rows open before the drag are never closed by it", () => {
    assert.deepEqual(closedBy([over("A"), over("Z"), over(null), outside, { kind: "end" }]), []);
  });

  const read8 = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");
  const hook = read8("components/content/use-spring-open.ts");
  const fileTree = read8("components/content/FileTree.tsx");
  const fileNode = read8("components/content/FileNode.tsx");
  check("the tree runs it; it hears every drag (document, capture) and opens like a chevron click", () => {
    assert.ok(fileTree.includes("useSpringOpen(treeRef, containerRef, setExpanded);"));
    for (const name of ["dragover", "dragleave", "drop", "dragend"]) {
      assert.ok(new RegExp(`document\\.addEventListener\\("${name}", \\w+, true\\)`).test(hook), `${name} on the document, capture phase`);
    }
    assert.ok(/node\.open\(\);\s*setExpanded\(open, true\);/.test(hook), "opening persists the expansion (a shortcut's contents are built from it)");
    assert.ok(/\?\.close\(\);\s*setExpanded\(id, false\);/.test(hook));
    assert.equal(/preventDefault|stopPropagation/.test(hook), false, "it never interferes with a drag");
  });
  check("hit-tested on react-arborist's row box (no gaps), never FileNode's shorter element alone", () => {
    assert.ok(hook.includes(`const box = target.closest('[role="treeitem"]');`));
    assert.ok(hook.includes('const row = (box?.querySelector("[data-tree-node-id]") ??'));
    assert.ok(hook.includes("const rect = box.getBoundingClientRect();"));
  });
  check("only rows that show they open, in their middle band, never a dragged row", () => {
    assert.ok(hook.includes('row.getAttribute("aria-expanded") === "false"'));
    assert.ok(hook.includes("opensHere = !dragged && inMiddleBand(event.clientY, rect.top, rect.height);"));
    assert.ok(fileNode.includes("aria-expanded={usesRowToggle ? isOpen : undefined}"), "FileNode marks rows that open");
    assert.ok(fileNode.includes("data-tree-node-id={data.id}"));
  });
  check("inside = walked up the shown tree; above/below by list position; drop closes wait for the drop", () => {
    assert.ok(hook.includes("for (let node: NodeApi<TreeNode> | null = row; node; node = node.parent) {"));
    assert.ok(hook.includes('return (row.rowIndex ?? 0) < (opened.rowIndex ?? 0) ? "above" : "below";'));
    assert.ok(hook.includes("if (closeAfterDrop.length > 0) setTimeout(() => closeRows(closeAfterDrop), 0);"));
    assert.ok(hook.includes('run({ kind: "drop", inTree, rowId: row?.dataset.treeNodeId ?? null });'));
  });
}

console.log("\nthe referenced-items chip (source pin)");
{
  const fileNode = readFileSync(join(__dirname, "../components/content/FileNode.tsx"), "utf8");
  check("its placement arrow shows only while the block is on screen (flag on AND row open)", () => {
    assert.ok(fileNode.includes("const referencesOnScreen = referencesExpanded && isOpen;"));
    assert.ok(fileNode.includes("{referencesOnScreen && hasPrimaryChildren && ("));
    assert.equal(fileNode.includes("{referencesExpanded && hasPrimaryChildren && ("), false);
  });
}

console.log(`\ntree-smooth: ${checks} checks passed`);
