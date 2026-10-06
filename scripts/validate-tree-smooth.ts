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
  treeScopeKey,
} from "../lib/domain/content/tree-refresh";

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
  check("a load marks its scope as on-screen only after the stale-scope check", () => {
    const loadTree = sliceBetween("const loadTree = useCallback(", "const fetchTree = useCallback(");
    const guard = loadTree.indexOf("responseStillApplies(requestScope");
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
  check("reconciles quietly (loadTree(true))", () => {
    assert.ok(body.includes("loadTree(true)"));
  });
  check("never calls fetchTree() — the skeleton path that unmounts the tree", () => {
    assert.equal(/\bfetchTree\(/.test(body), false);
  });
  check("prunes selection (FileTree only does it on first mount)", () => {
    assert.ok(body.includes("collectRemovedIds(") && body.includes("setSelectedIds("));
  });
}

console.log(`\ntree-smooth: ${checks} checks passed`);
