/**
 * Shortcut-mirror transform gate.
 *
 * A shortcut pointing at a folder projects that folder's contents inline as
 * view-only rows. Three invariants make that safe, none of which tsc or eslint
 * can see, and all of which fail silently in ways that look like something
 * else entirely.
 *
 * 1. OBJECT IDENTITY. Same contract as `expandReferences`, and load-bearing
 *    for the same reason: react-arborist keys row recycling off identity, so a
 *    version that clones unconditionally — the obvious "simplification", since
 *    it produces identical JSON — remounts every row on any re-render and eats
 *    the inline-rename caret mid-keystroke.
 *
 * 2. ID UNIQUENESS UNDER CYCLES. A shortcut to folder A can live INSIDE folder
 *    A. Mirror row ids are path-scoped precisely so that expanding through
 *    such a cycle yields distinct rows; a plain content id would repeat, and
 *    react-arborist's selection, expansion, scroll-to and drop-position maps
 *    all silently corrupt when one id names two rows.
 *
 * 3. LAZINESS. A level is built only when its row is expanded. This is what
 *    makes a cycle cost one level per click instead of hanging the tab, so a
 *    "harmless" eager recursion here is a browser freeze.
 *
 * Run: pnpm shortcut-mirror:check
 */
import {
  expandShortcutMirrors,
  buildTreeIndex,
  shortcutMirrorId,
  resolveDropForwardTarget,
  SHORTCUT_MIRROR_PREFIX,
  MAX_MIRROR_DEPTH,
} from "@/lib/features/content/shortcut-mirror";
import type { TreeNode } from "@/lib/domain/content/types";

let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (!condition) {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — got: ${detail}` : ""}`);
  }
}

function node(id: string, extra: Partial<TreeNode> = {}): TreeNode {
  return {
    id,
    title: id,
    slug: id,
    parentId: null,
    displayOrder: 0,
    customIcon: null,
    iconColor: null,
    isPublished: false,
    contentType: "note",
    children: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null,
    ...extra,
  };
}

function shortcutTo(
  id: string,
  targetId: string,
  extra: Partial<TreeNode["shortcut"]> = {},
): TreeNode {
  return node(id, {
    contentType: "shortcut",
    shortcut: {
      targetId,
      targetContentType: "folder",
      targetTitle: targetId,
      targetDeleted: false,
      ...extra,
    },
  });
}

/** Folder "docs" with two notes, plus a shortcut aimed at it from elsewhere. */
function fixture(): TreeNode[] {
  return [
    node("docs", {
      contentType: "folder",
      children: [node("note-a"), node("note-b")],
    }),
    node("projects", {
      contentType: "folder",
      children: [shortcutTo("sc", "docs")],
    }),
  ];
}

function run(nodes: TreeNode[], expanded: string[]) {
  return expandShortcutMirrors(
    nodes,
    new Set(expanded),
    buildTreeIndex(nodes),
  );
}

/** Every row id in a tree, both arrays. */
function allIds(nodes: TreeNode[], into: string[] = []): string[] {
  for (const n of nodes) {
    into.push(n.id);
    if (n.children?.length) allIds(n.children, into);
    if (n.references?.length) allIds(n.references, into);
  }
  return into;
}

function findRow(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit =
      findRow(n.children ?? [], id) ?? findRow(n.references ?? [], id);
    if (hit) return hit;
  }
  return null;
}

// --- 1. Identity ---------------------------------------------------------
{
  const data = fixture();
  check(
    "collapsed shortcut returns the input array by identity",
    run(data, []) === data,
    "array was cloned with nothing expanded",
  );
  check(
    "collapsed shortcut returns untouched nodes by identity",
    run(data, [])[0] === data[0],
  );

  const expanded = run(data, ["sc"]);
  check(
    "expanding one shortcut does not clone unrelated siblings",
    expanded[0] === data[0],
    "the mirrored folder itself was cloned",
  );
}

// --- 2. Mirroring --------------------------------------------------------
{
  const data = fixture();
  const out = run(data, ["sc"]);
  const sc = findRow(out, "sc");
  check("expanded shortcut gains children", (sc?.children.length ?? 0) === 2);

  const first = sc?.children[0];
  check(
    "mirror row id is path-scoped, not the real content id",
    first?.id === shortcutMirrorId("sc", "note-a"),
    first?.id,
  );
  check("mirror row id is namespaced", first?.id.startsWith(SHORTCUT_MIRROR_PREFIX) === true);
  check("mirror row carries the real id", first?.mirrorOf === "note-a");
  check("mirror row is flagged view-only", first?.isShortcutMirror === true);
  check("mirror row keeps the source title", first?.title === "note-a");
  check(
    "mirror rows get reference-block edge tags",
    first?.referenceEdge === "first" && sc?.children[1]?.referenceEdge === "last",
  );
  check(
    "the real folder is not mutated",
    findRow(out, "docs")?.children.length === 2 &&
      findRow(out, "docs")?.children[0]?.id === "note-a",
  );
}

// --- 3. Broken and non-folder targets are not mirrored --------------------
{
  const trashed = [
    node("docs", { contentType: "folder", children: [node("note-a")] }),
    shortcutTo("sc", "docs", { targetDeleted: true }),
  ];
  check(
    "a trashed target is not mirrored",
    (findRow(run(trashed, ["sc"]), "sc")?.children.length ?? 0) === 0,
  );

  const purged = [shortcutTo("sc", "docs", { targetId: null })];
  check(
    "a purged target is not mirrored",
    (findRow(run(purged, ["sc"]), "sc")?.children.length ?? 0) === 0,
  );

  const toNote = [
    node("note-x"),
    shortcutTo("sc", "note-x", { targetContentType: "note" }),
  ];
  check(
    "a shortcut to a non-folder is not mirrored",
    (findRow(run(toNote, ["sc"]), "sc")?.children.length ?? 0) === 0,
  );
}

// --- 4. Laziness ---------------------------------------------------------
{
  const data = [
    node("docs", {
      contentType: "folder",
      children: [
        node("sub", { contentType: "folder", children: [node("deep")] }),
      ],
    }),
    shortcutTo("sc", "docs"),
  ];

  const oneLevel = run(data, ["sc"]);
  const sub = findRow(oneLevel, shortcutMirrorId("sc", "sub"));
  check(
    "a nested folder is mirrored but NOT descended into until expanded",
    sub !== null && sub.children.length === 0,
    `children: ${sub?.children.length}`,
  );

  const twoLevels = run(data, ["sc", shortcutMirrorId("sc", "sub")]);
  const subOpen = findRow(twoLevels, shortcutMirrorId("sc", "sub"));
  check(
    "expanding the nested mirror row builds the next level",
    subOpen?.children[0]?.mirrorOf === "deep",
    subOpen?.children[0]?.id,
  );
}

// --- 5. Cycles -----------------------------------------------------------
//
// The shape that motivated path-scoped ids: a shortcut to folder A, living
// inside folder A. Expanding it shows A's contents, which include the shortcut
// again — for as many levels as the user opens, and no further.
{
  const cyclic: TreeNode[] = [
    node("A", {
      contentType: "folder",
      children: [node("note-a"), shortcutTo("sc", "A")],
    }),
  ];

  const lvl1 = run(cyclic, ["sc"]);
  const inner = findRow(lvl1, shortcutMirrorId("sc", "sc"));
  check("a cycle mirrors one level without hanging", inner !== null);
  check(
    "the repeated shortcut is NOT auto-expanded",
    (inner?.children.length ?? 0) === 0,
  );

  const lvl2 = run(cyclic, ["sc", shortcutMirrorId("sc", "sc")]);
  const ids = allIds(lvl2);
  check(
    "every row id stays unique through a cycle",
    new Set(ids).size === ids.length,
    `${ids.length - new Set(ids).size} duplicate id(s)`,
  );

  // Replayed expansion state cannot build an unbounded tree.
  let path = "sc";
  const deep = ["sc"];
  for (let i = 0; i < MAX_MIRROR_DEPTH + 5; i += 1) {
    path = shortcutMirrorId(path, "sc");
    deep.push(path);
  }
  const capped = run(cyclic, deep);
  const cappedIds = allIds(capped);
  check(
    "depth cap bounds a replayed cycle",
    cappedIds.length < MAX_MIRROR_DEPTH * 4,
    `${cappedIds.length} rows`,
  );
  check(
    "depth-capped tree still has unique ids",
    new Set(cappedIds).size === cappedIds.length,
  );
}

// --- 6. Drop forwarding --------------------------------------------------
//
// "Nothing is ever stored under a shortcut" survives drag-and-drop only
// because the destination is rewritten before the move is sent. A rule that
// exists in the move route but not here would let the optimistic tree update
// disagree with what the server does.
{
  const data = fixture();
  const out = run(data, ["sc"]);

  check(
    "dropping on a folder-shortcut forwards to the real folder",
    resolveDropForwardTarget(findRow(out, "sc")!) === "docs",
  );
  check(
    "dropping on a mirrored folder forwards to that real folder",
    resolveDropForwardTarget(
      node("m", {
        contentType: "folder",
        isShortcutMirror: true,
        mirrorOf: "sub",
      }),
    ) === "sub",
  );
  check(
    "a broken shortcut forwards nowhere",
    resolveDropForwardTarget(
      shortcutTo("bad", "docs", { targetDeleted: true }),
    ) === null,
  );
  check(
    "a shortcut to a note forwards nowhere",
    resolveDropForwardTarget(
      shortcutTo("n", "note-x", { targetContentType: "note" }),
    ) === null,
  );
  check(
    "an ordinary folder forwards nowhere",
    resolveDropForwardTarget(findRow(out, "docs")!) === null,
  );
  check(
    "a mirrored NOTE forwards nowhere — only folders receive drops",
    resolveDropForwardTarget(
      node("m2", { isShortcutMirror: true, mirrorOf: "note-a" }),
    ) === null,
  );
}

if (failures > 0) {
  console.error(`\nshortcut-mirror:check — ${failures} check(s) failed.\n`);
  process.exit(1);
}

console.log(
  "shortcut-mirror:check — OK (identity, mirroring, broken targets, laziness, cycles, drop forwarding)",
);
