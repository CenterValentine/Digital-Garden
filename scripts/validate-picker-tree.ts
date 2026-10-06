/**
 * Picker tree gate. Runs with `pnpm picker:tree:check` (tsx, no database,
 * no network, no React).
 *
 * Pins the pure walk behind ContentTreePicker (lib/domain/content/picker-tree.ts)
 * against a fixture tree. The regression it exists for (2026-10-05): a picker
 * that accepts notes only never descended into a folder, so choosing a scope
 * listed only the notes at its top level — "root — show all files" showed one
 * item. Eligibility decides what can be PICKED; folders are always browsed.
 */

import assert from "node:assert/strict";
import {
  flattenEligible,
  type FlatRow,
  type TreeNodeLite,
} from "../lib/domain/content/picker-tree";

let checks = 0;
function check(name: string, fn: () => void) {
  fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const node = (
  id: string,
  contentType: string,
  children?: TreeNodeLite[],
  extra: Partial<TreeNodeLite> = {},
): TreeNodeLite => ({ id, title: id, contentType, children, ...extra });

// root
// ├─ salesforce            (note)
// ├─ Career                (folder)
// │   ├─ resume            (note)
// │   ├─ Projects          (folder)
// │   │   └─ atlas         (note)
// │   └─ headshot          (file)
// ├─ Empty                 (folder, no children)
// ├─ sheet                 (data)
// └─ people                (synthetic People mount — never a row)
const TREE: TreeNodeLite[] = [
  node("salesforce", "note"),
  node("Career", "folder", [
    node("resume", "note"),
    node("Projects", "folder", [node("atlas", "note")]),
    node("headshot", "file"),
  ]),
  node("Empty", "folder", []),
  node("sheet", "data"),
  node("people", "folder", [], { treeNodeKind: "peopleGroup" }),
];

const ids = (rows: FlatRow[]) => rows.map((r) => r.id);
const byId = (rows: FlatRow[], id: string) => {
  const row = rows.find((r) => r.id === id);
  assert.ok(row, `row ${id} should exist`);
  return row;
};

console.log("picker tree");

check("notes-only picker still reaches notes inside nested folders", () => {
  const rows = flattenEligible(TREE, new Set(["note"]), null);
  assert.deepEqual(ids(rows), [
    "salesforce",
    "Career",
    "resume",
    "Projects",
    "atlas",
    "Empty",
  ]);
});

check("a folder is a browse-only row when folders are not pickable", () => {
  const rows = flattenEligible(TREE, new Set(["note"]), null);
  assert.equal(byId(rows, "Career").pickable, false);
  assert.equal(byId(rows, "Projects").pickable, false);
  assert.equal(byId(rows, "salesforce").pickable, true);
  assert.equal(byId(rows, "atlas").pickable, true);
});

check("browse-only folders still expand (hasChildren) and carry depth/parent", () => {
  const rows = flattenEligible(TREE, new Set(["note"]), null);
  assert.equal(byId(rows, "Career").hasChildren, true);
  assert.equal(byId(rows, "Empty").hasChildren, false);
  assert.equal(byId(rows, "atlas").depth, 2);
  assert.equal(byId(rows, "atlas").parentId, "Projects");
});

check("types that are neither pickable nor folders stay out", () => {
  const rows = flattenEligible(TREE, new Set(["note"]), null);
  assert.ok(!ids(rows).includes("headshot"));
  assert.ok(!ids(rows).includes("sheet"));
});

check("sibling indices count every content sibling, shown or not (move-route index space)", () => {
  const rows = flattenEligible(TREE, new Set(["note"]), null);
  // Career's children: resume(0), Projects(1), headshot(2, hidden)
  assert.equal(byId(rows, "resume").siblingIndex, 0);
  assert.equal(byId(rows, "Projects").siblingIndex, 1);
  // Top level: salesforce(0), Career(1), Empty(2), sheet(3, hidden)
  assert.equal(byId(rows, "Empty").siblingIndex, 2);
});

check("synthetic People rows never appear and do not advance the sibling index", () => {
  const rows = flattenEligible(
    [node("people", "folder", [], { treeNodeKind: "peopleGroup" }), node("n", "note")],
    new Set(["note"]),
    null,
  );
  assert.deepEqual(ids(rows), ["n"]);
  assert.equal(rows[0].siblingIndex, 0);
});

check("a picker that lists folders as pickable behaves as before (everything pickable)", () => {
  const rows = flattenEligible(TREE, new Set(["note", "folder", "file", "data"]), null);
  assert.ok(rows.every((r) => r.pickable));
  assert.deepEqual(ids(rows), [
    "salesforce",
    "Career",
    "resume",
    "Projects",
    "atlas",
    "headshot",
    "Empty",
    "sheet",
  ]);
});

check("a folders-only picker lists folders, none of their notes", () => {
  const rows = flattenEligible(TREE, new Set(["folder"]), null);
  assert.deepEqual(ids(rows), ["Career", "Projects", "Empty"]);
  assert.ok(rows.every((r) => r.pickable));
});

check("references are walked after primary children and flagged", () => {
  const rows = flattenEligible(
    [
      node("host", "note", [node("child", "note")], {
        references: [node("attachment", "note")],
      }),
    ],
    new Set(["note"]),
    null,
  );
  assert.deepEqual(ids(rows), ["host", "child", "attachment"]);
  assert.equal(byId(rows, "attachment").isReference, true);
  assert.equal(byId(rows, "child").isReference, false);
});

check("a scoped tree's top level carries the view root as its real parent", () => {
  const rows = flattenEligible(TREE, new Set(["note"]), "view-root");
  assert.equal(byId(rows, "salesforce").parentId, "view-root");
  assert.equal(byId(rows, "Career").parentId, "view-root");
});

console.log(`\npicker tree: ${checks} checks passed`);
