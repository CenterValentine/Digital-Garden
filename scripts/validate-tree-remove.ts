/**
 * Optimistic-delete gate. Runs with `pnpm tree:remove:check` (tsx, no
 * database, no network, no React).
 *
 * The regression it exists for (2026-10-05): deleting from the file tree
 * waited for the server, then refetched with the skeleton up. The skeleton
 * unmounted react-arborist, so every delete flashed the whole tree and dropped
 * the user back at the top. The delete now removes rows at once and reconciles
 * quietly. Two things are pinned here:
 *
 *  1. The pure edits (lib/domain/content/tree-remove.ts) — including that an
 *     untouched branch keeps its identity, which is what stops the rest of the
 *     tree re-rendering, and that a partial failure restores rows in place.
 *  2. The handler itself (LeftSidebarContent.handleDeleteConfirmed) — that it
 *     removes optimistically and reconciles with `loadTree(true)`, and never
 *     calls `fetchTree()`, the skeleton path. A source pin, because the
 *     failure is a one-word revert nobody would notice in review.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  collectRemovedIds,
  removeNodesFromTree,
  withoutIds,
} from "../lib/domain/content/tree-remove";

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

console.log("\nthe delete handler (source pin)");
{
  const source = readFileSync(
    join(__dirname, "../components/content/content/LeftSidebarContent.tsx"),
    "utf8",
  );
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

console.log(`\ntree-remove: ${checks} checks passed`);
