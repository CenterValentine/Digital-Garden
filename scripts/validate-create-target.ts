/**
 * Create-target gate: every "+" create resolves its parent with one rule
 * (lib/domain/content/create-target.ts). Runs with `pnpm create-target:check`.
 */

import assert from "node:assert/strict";
import {
  resolveCreateParent,
  toServerParent,
  type CreateTargetNode,
} from "../lib/domain/content/create-target";

const nodes: CreateTargetNode[] = [
  { id: "folderA", contentType: "folder", parentId: null },
  { id: "noteInA", contentType: "note", parentId: "folderA" },
  { id: "shortcutInA", contentType: "shortcut", parentId: "folderA" },
  { id: "rootNote", contentType: "note", parentId: null },
  { id: "orphan", contentType: "note", parentId: "trashedFolder" },
  // view-scoped tree: top level items hang off the (hidden) view root
  { id: "viewFolder", contentType: "folder", parentId: "viewRoot" },
  { id: "viewNote", contentType: "note", parentId: "viewRoot" },
];
const findNode = (id: string) => nodes.find((node) => node.id === id) ?? null;
const resolve = (explicitParentId: string | null, selectedIds: string[], viewRootId: string | null = null) =>
  resolveCreateParent({ explicitParentId, selectedIds, findNode, viewRootId });

let checks = 0;
function check(name: string, fn: () => void) {
  fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
}

check("explicit folder wins over the selection", () => {
  assert.equal(resolve("folderA", ["rootNote"]), "folderA");
});
check("explicit non-folder / shortcut → sibling (its parent)", () => {
  assert.equal(resolve("noteInA", []), "folderA");
  assert.equal(resolve("shortcutInA", []), "folderA");
});
check("selected folder → inside it; selected item → beside it", () => {
  assert.equal(resolve(null, ["folderA"]), "folderA");
  assert.equal(resolve(null, ["noteInA"]), "folderA");
  assert.equal(resolve(null, ["rootNote"]), null);
});
check("nothing / multiple / stale / virtual selection → top of tree", () => {
  assert.equal(resolve(null, []), null);
  assert.equal(resolve(null, ["folderA", "rootNote"]), null);
  assert.equal(resolve(null, ["gone"]), null);
  assert.equal(resolve(null, ["reader:library"]), null);
});
check("orphan of a trashed folder → top of tree, never the dead id", () => {
  assert.equal(resolve(null, ["orphan"]), null);
  assert.equal(resolve("trashedFolder", []), null);
});
check("view scope: top level is tree-space null, server-space view root", () => {
  assert.equal(resolve(null, [], "viewRoot"), null);
  assert.equal(resolve(null, ["viewNote"], "viewRoot"), null);
  assert.equal(resolve("viewRoot", [], "viewRoot"), null);
  assert.equal(resolve(null, ["viewFolder"], "viewRoot"), "viewFolder");
  assert.equal(toServerParent(null, "viewRoot"), "viewRoot");
  assert.equal(toServerParent(null, null), null);
  assert.equal(toServerParent("viewFolder", "viewRoot"), "viewFolder");
});
check("people virtual + optimistic temp parents pass through", () => {
  assert.equal(resolve("peopleGroup:g1", []), "peopleGroup:g1");
  assert.equal(resolve("temp-123", []), "temp-123");
  assert.equal(toServerParent("person:p1", "viewRoot"), "person:p1");
});

console.log(`create-target:check passed (${checks} checks)`);
