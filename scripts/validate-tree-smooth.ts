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
  resolveDropAnchor,
  sortedInsertIndex,
  type DropRow,
  type OrderedSibling,
} from "../lib/domain/content/sibling-order";

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
    assert.ok(moveRoute.includes("placeAmongSiblings(siblings, movedItem, placement)"));
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
    assert.ok(fileTree.includes("buildTreeIndex(withReferences, shortcutTargets)"));
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
  check("canDrop refuses only window-reference rows, not every mirror row", () => {
    assert.ok(fileTree.includes("dragNode.data.isShortcutMirror && dragNode.data.windowRef"));
    assert.equal(/dragNodes\.some\(\(dragNode\) => dragNode\.data\.isShortcutMirror\)\)/.test(fileTree), false);
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

console.log(`\ntree-smooth: ${checks} checks passed`);
