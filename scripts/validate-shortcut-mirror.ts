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
  contentIdOfRowId,
  shortcutIdOfMirrorRowId,
  deleteTargetsOfRowIds,
  targetRowOfSelection,
  SHORTCUT_MIRROR_PREFIX,
  MAX_MIRROR_DEPTH,
} from "@/lib/features/content/shortcut-mirror";
import { windowReferenceRowId } from "@/lib/features/content/window-reference";
import { expansionsFor, resolveTreeRow } from "@/lib/features/content/tree-stand-in";
import type { TreeNode } from "@/lib/domain/content/types";
import {
  outOfScopeShortcutTargets,
  viewReachRoots,
  type ScopedNodeLite,
} from "@/lib/domain/content/shortcut-targets";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

function run(nodes: TreeNode[], expanded: string[], hidden: string[] = []) {
  return expandShortcutMirrors(
    nodes,
    new Set(expanded),
    buildTreeIndex(nodes),
    new Set(hidden),
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
  // Owner report, 2026-10-06: a shortcut seen inside another shortcut
  // forwarded nowhere, so drops on it were refused.
  check(
    "a shortcut seen inside a shortcut forwards to ITS target folder",
    resolveDropForwardTarget({
      ...shortcutTo("inner-sc", "beta"),
      id: "smirror:sc/inner-sc",
      isShortcutMirror: true,
      mirrorOf: "inner-sc",
    }) === "beta",
  );
  check(
    "a broken shortcut seen inside a shortcut forwards nowhere",
    resolveDropForwardTarget({
      ...shortcutTo("inner-bad", "beta", { targetDeleted: true }),
      id: "smirror:sc/inner-bad",
      isShortcutMirror: true,
      mirrorOf: "inner-bad",
    }) === null,
  );
}

// --- 6b. A shortcut inside a shortcut opens onto its folder ----------------
//
// Owner report, 2026-10-06: it showed as open with nothing under it — the
// mirror only descended into folders.
{
  const data: TreeNode[] = [
    node("alpha", { contentType: "folder", children: [node("a-note"), shortcutTo("to-beta", "beta")] }),
    node("beta", { contentType: "folder", children: [node("b-note")] }),
    shortcutTo("sc", "alpha"),
  ];
  const nestedRow = shortcutMirrorId("sc", "to-beta");
  const closed = findRow(run(data, ["sc"]), nestedRow);
  check("a nested shortcut is mirrored but NOT descended into until opened", closed !== null && closed.children.length === 0);
  const open = findRow(run(data, ["sc", nestedRow]), nestedRow);
  check(
    "opened, it shows its target folder's contents",
    open?.children.map((child) => child.mirrorOf).join(",") === "b-note",
    open?.children.map((child) => child.mirrorOf).join(","),
  );
  check(
    "those rows are path-scoped under it (unique, and a drop among them forwards to the real folder)",
    open?.children[0]?.id === shortcutMirrorId(nestedRow, "b-note") && resolveDropForwardTarget(open!) === "beta",
  );
  const broken: TreeNode[] = [
    node("alpha", { contentType: "folder", children: [shortcutTo("to-gone", "gone", { targetDeleted: true })] }),
    shortcutTo("sc", "alpha"),
  ];
  const brokenRow = shortcutMirrorId("sc", "to-gone");
  check("a broken nested shortcut opens onto nothing", findRow(run(broken, ["sc", brokenRow]), brokenRow)?.children.length === 0);
}

// --- 7. Hiding nested shortcuts ------------------------------------------
//
// A mirrored folder shows what it contains, shortcuts included — so one
// shortcut can surface more, each expanding into another mirror. Per-shortcut,
// opt-in, and it must hide ONLY shortcuts.
{
  const data: TreeNode[] = [
    node("docs", {
      contentType: "folder",
      children: [node("note-a"), shortcutTo("inner", "docs")],
    }),
    shortcutTo("sc", "docs"),
  ];

  const shown = findRow(run(data, ["sc"]), "sc");
  check(
    "nested shortcuts appear by default",
    shown?.children.length === 2,
    `${shown?.children.length}`,
  );

  const hidden = findRow(run(data, ["sc"], ["sc"]), "sc");
  check(
    "hiding drops the nested shortcut",
    hidden?.children.length === 1,
    `${hidden?.children.length}`,
  );
  check(
    "hiding keeps everything that is not a shortcut",
    hidden?.children[0]?.mirrorOf === "note-a",
    hidden?.children[0]?.mirrorOf ?? "none",
  );
  check(
    "hiding is per shortcut, not global",
    findRow(run(data, ["sc"], ["other"]), "sc")?.children.length === 2,
  );
}

// --- Out-of-view targets (view-scoped trees) ----------------------------
// Owner report 2026-10-05: a shortcut in the Career Hunt VIEW to a folder
// under Career Pathways (outside the view) expanded to nothing. The client
// looks a shortcut's target up in the tree it has; the view filter had left
// the target out. The tree API now returns such targets beside the tree.
{
  // What a view-scoped tree delivers: the shortcut row, but not its target.
  const view = [shortcutTo("sc", "pathways-dev")];
  const carried = [
    node("pathways-dev", {
      contentType: "folder",
      children: [node("resume-tips"), node("interview-prep")],
    }),
  ];
  const before = expandShortcutMirrors(view, new Set(["sc"]), buildTreeIndex(view), new Set());
  check(
    "THE BUG: without the carried target, an out-of-view shortcut mirrors nothing",
    (findRow(before, "sc")?.children.length ?? -1) === 0,
  );
  const after = expandShortcutMirrors(view, new Set(["sc"]), buildTreeIndex(view, carried), new Set());
  check(
    "with the carried target, it mirrors the folder's contents",
    (findRow(after, "sc")?.children ?? []).map((c) => c.mirrorOf).join() === "resume-tips,interview-prep",
    (findRow(after, "sc")?.children ?? []).map((c) => c.mirrorOf).join(),
  );
  check(
    "carried targets never become rows of the tree",
    !allIds(after).includes("pathways-dev"),
  );

  // On-screen rows win an id collision with a carried copy.
  const onScreen = [node("dup", { title: "on screen" })];
  const index = buildTreeIndex(onScreen, [node("dup", { title: "carried" })]);
  check("an id on screen beats a carried copy", index.get("dup")?.title === "on screen");

  // Which targets the route carries.
  const lite = (id: string, parentId: string | null, contentType: string, shortcutTargetId?: string | null): ScopedNodeLite =>
    ({ id, parentId, contentType, shortcutTargetId });
  const all = new Map(
    [
      lite("view", null, "folder"),
      lite("sc-out", "view", "shortcut", "out"),
      lite("sc-in", "view", "shortcut", "inner"),
      lite("sc-note", "view", "shortcut", "a-note"),
      lite("sc-broken", "view", "shortcut", null),
      lite("sc-out-again", "view", "shortcut", "out"),
      lite("inner", "view", "folder"),
      lite("out-parent", null, "folder"),
      lite("out", "out-parent", "folder"),
      lite("out-child", "out", "note"),
      lite("out-sub", "out", "folder"),
      lite("out-grandchild", "out-sub", "note"),
      lite("a-note", null, "note"),
      lite("unrelated", null, "folder"),
    ].map((n) => [n.id, n]),
  );
  const included = new Set(["view", "sc-out", "sc-in", "sc-note", "sc-broken", "sc-out-again", "inner"]);
  const picked = outOfScopeShortcutTargets(all, included);
  check("carries a folder target outside the view", picked.targetIds.join() === "out", picked.targetIds.join());
  check(
    "…with its whole subtree, and nothing else",
    [...picked.carriedIds].sort().join() === "out,out-child,out-grandchild,out-sub",
    [...picked.carriedIds].sort().join(),
  );
  check("a target already in the view isn't carried", !picked.carriedIds.has("inner"));
  check("a non-folder target isn't carried (nothing to mirror)", !picked.carriedIds.has("a-note"));
  check("two shortcuts to one folder carry it once", picked.targetIds.filter((t) => t === "out").length === 1);
  check("the target's own parent isn't carried", !picked.carriedIds.has("out-parent"));

  // A shortcut to an ANCESTOR of the view root must not re-ship the view.
  const ancestorCase = new Map(
    [
      lite("top", null, "folder"),
      lite("view", "top", "folder"),
      lite("sc-up", "view", "shortcut", "top"),
      lite("sibling", "top", "note"),
    ].map((n) => [n.id, n]),
  );
  const up = outOfScopeShortcutTargets(ancestorCase, new Set(["view", "sc-up"]));
  check(
    "a shortcut to the view root's ancestor carries it minus the view itself",
    [...up.carriedIds].sort().join() === "sibling,top",
    [...up.carriedIds].sort().join(),
  );
}

// ── What a row inside a shortcut acts on ────────────────────────────────────
// Owner rule (2026-10-05): actions that only refer to content reach the
// ORIGINAL; deleting removes the SHORTCUT, never the original. Ids built by
// the real producers, so a format change on either side fails here.
{
  const top = shortcutMirrorId("sc", "folder-1");
  const deep = shortcutMirrorId(top, "note-1");
  const windowRow = windowReferenceRowId("host-note", "target-1");

  check("a mirror row refers to its original", contentIdOfRowId(top) === "folder-1", contentIdOfRowId(top));
  check("a nested mirror row refers to its own original", contentIdOfRowId(deep) === "note-1", contentIdOfRowId(deep));
  check("a window row refers to the windowed note", contentIdOfRowId(windowRow) === "target-1", contentIdOfRowId(windowRow));
  check("a real row refers to itself", contentIdOfRowId("plain-id") === "plain-id");

  check("a mirror row is seen through its shortcut", shortcutIdOfMirrorRowId(deep) === "sc", String(shortcutIdOfMirrorRowId(deep)));
  check("a real row is seen through no shortcut", shortcutIdOfMirrorRowId("plain-id") === null);
  check("a window row is seen through no shortcut", shortcutIdOfMirrorRowId(windowRow) === null);

  const targets = deleteTargetsOfRowIds(["plain-id", top, deep, windowRow]);
  check(
    "delete: a row inside a shortcut removes the shortcut; a window row removes nothing",
    targets.join() === "plain-id,sc",
    targets.join(),
  );
  check(
    "delete never reaches an original through its mirror",
    !targets.includes("folder-1") && !targets.includes("note-1") && !targets.includes("target-1"),
  );
  check("delete: the shortcut and its own mirror rows go once", deleteTargetsOfRowIds(["sc", top]).join() === "sc");
  check("delete: only window rows → nothing to delete", deleteTargetsOfRowIds([windowRow]).length === 0);
}

// ── What a view reaches through its shortcuts (the open guard's scope) ──────
// Owner rule (2026-10-05): "count view from a shortcut as in scope for any
// check related to the view targeting". Shaped on the owner's case: a
// shortcut in the Career Hunt view to a folder under Career Pathways.
{
  const parentOf = new Map<string, string | null>([
    ["top", null],
    ["hunt", "top"], // the view root
    ["hunt-sub", "hunt"],
    ["sc-in-view", "hunt-sub"], // shortcut inside the view → "resources"
    ["pathways", "top"],
    ["resources", "pathways"],
    ["resources-note", "resources"],
    ["sc-chain", "resources"], // a shortcut inside the reached folder → "far"
    ["far", "top"],
    ["far-note", "far"],
    ["sc-outside", "pathways"], // a shortcut OUTSIDE the view → "elsewhere"
    ["elsewhere", "top"],
    ["sc-to-note", "hunt"], // a shortcut to a single note
    ["lone-note", "pathways"],
    ["sc-cycle", "far"], // points back at the view root: must just stop
    ["sc-dead", "hunt"], // its target is trashed (not in the live map)
  ]);
  // The chain's second link is listed FIRST, so reach must keep going until
  // nothing new is added — a single pass would miss it.
  const shortcuts = [
    { id: "sc-chain", targetId: "far" },
    { id: "sc-in-view", targetId: "resources" },
    { id: "sc-outside", targetId: "elsewhere" },
    { id: "sc-to-note", targetId: "lone-note" },
    { id: "sc-cycle", targetId: "hunt" },
    { id: "sc-dead", targetId: "trashed-folder" },
    { id: "sc-trashed", targetId: "pathways" }, // the shortcut itself is trashed
  ];
  const roots = viewReachRoots("hunt", parentOf, shortcuts);
  const reached = (lineage: string[]) => lineage.some((id) => roots.has(id));

  check("a shortcut in the view brings its folder into scope", roots.has("resources"));
  check("…and everything under it", reached(["resources-note", "resources", "pathways", "top"]));
  check("a chain of shortcuts is followed", roots.has("far") && reached(["far-note", "far", "top"]));
  check("a shortcut to a note brings that note into scope", roots.has("lone-note"));
  check("a shortcut outside the view reaches nothing", !roots.has("elsewhere"));
  check("the target's own parent stays out of scope", !roots.has("pathways"));
  check("a trashed target reaches nothing", !roots.has("trashed-folder"));
  check("a trashed shortcut reaches nothing", [...roots].sort().join() === "far,hunt,lone-note,resources", [...roots].sort().join());

  const viewOnly = viewReachRoots("hunt", parentOf, []);
  check("with no shortcuts, only the view root is reached", [...viewOnly].join() === "hunt");

  const service = readFileSync(
    join(__dirname, "../extensions/workplaces/server/service.ts"),
    "utf8",
  );
  const scopeCheck = service.slice(
    service.indexOf("if (workspace.viewRootContentId) {\n    const isInScope ="),
    service.indexOf('conflictType: "viewScope"'),
  );
  check(
    "the open guard counts what the view reaches through shortcuts as in scope",
    scopeCheck.length > 0 && scopeCheck.includes("await reachedThroughViewShortcuts("),
  );
  check(
    "the guard reads reach through viewReachRoots on the content's lineage",
    /viewReachRoots\(\s*viewRootContentId,/.test(service) &&
      service.includes("return lineage.some((id) => roots.has(id));"),
  );
  check(
    "the cheap pre-check bails out only when no shortcut points into the lineage",
    /if \(!shortcuts\.some\(\(shortcut\) => lineage\.includes\(shortcut\.targetContentId \?\? ""\)\)\) \{\s*return false;/.test(service),
  );
}

// ── A shortcut's OWN sort (view-only; never the folder's) ───────────────────
// Owner, 2026-10-06: a shortcut can keep its own sort, kept in user settings,
// that changes only how the shortcut shows its folder.
{
  const folder = node("lib", {
    contentType: "folder",
    children: [node("zeta"), node("alpha"), node("sub", { contentType: "folder", children: [node("y"), node("x")] })],
  });
  const tree = [folder, node("home", { contentType: "folder", children: [shortcutTo("sc2", "lib")] })];
  const index = buildTreeIndex(tree);
  const mirrorOf = (sorts: Record<string, { name?: "asc" | "desc"; float?: "folders" | "nested" }>, expanded: string[]) => {
    const out = expandShortcutMirrors(tree, new Set(expanded), index, new Set(), 0, sorts);
    return findRow(out, "sc2")?.children ?? [];
  };
  const realIds = (rows: TreeNode[]) => rows.map((row) => row.mirrorOf).join(",");

  check("without its own sort, a shortcut shows its folder's order", realIds(mirrorOf({}, ["sc2"])) === "zeta,alpha,sub", realIds(mirrorOf({}, ["sc2"])));
  check("with its own sort, the shortcut shows it — the folder's data is untouched", realIds(mirrorOf({ sc2: { name: "asc" } }, ["sc2"])) === "alpha,sub,zeta" && folder.children.map((c) => c.id).join() === "zeta,alpha,sub", realIds(mirrorOf({ sc2: { name: "asc" } }, ["sc2"])));
  check("a float works the same way", realIds(mirrorOf({ sc2: { float: "folders" } }, ["sc2"])) === "sub,zeta,alpha", realIds(mirrorOf({ sc2: { float: "folders" } }, ["sc2"])));
  // A–Z, so a sort leaking into the sub-folder would turn its "y,x" into "x,y".
  const subRow = mirrorOf({ sc2: { name: "asc" } }, ["sc2", shortcutMirrorId("sc2", "sub")]).find((row) => row.mirrorOf === "sub");
  check("only the shortcut's own level: a mirrored sub-folder keeps its folder's order", realIds(subRow?.children ?? []) === "y,x", realIds(subRow?.children ?? []));

  check("a selected row inside a shortcut stands for the shortcut", targetRowOfSelection(shortcutMirrorId(shortcutMirrorId("sc2", "sub"), "x")) === "sc2");
  check("a selected window row stands for its note", targetRowOfSelection(windowReferenceRowId("host-note", "t")) === "host-note");
  check("any other selection stands for itself", targetRowOfSelection("plain") === "plain");
}

// ── Which row stands for open content (tree-stand-in.ts) ─────────────────────
// Owner, 2026-10-06: opened through a shortcut, the tree keeps pointing at the
// shortcut (or the row inside it), not the original's row elsewhere.
{
  const docs = node("docs", { contentType: "folder", children: [node("note-a"), node("sub", { contentType: "folder", children: [node("deep")] })] });
  const sc = shortcutTo("sc", "docs");
  const scToNote = shortcutTo("sc-note", "note-a", { targetContentType: "note" });
  const tree = [docs, node("projects", { contentType: "folder", children: [sc, scToNote] })];

  const fromShortcut = resolveTreeRow("note-a", tree, [], "sc-note");
  check("opened through a shortcut: that shortcut stands in, though the original is on screen", fromShortcut?.rowId === "sc-note", JSON.stringify(fromShortcut));
  const mirrorRow = shortcutMirrorId("sc", "note-a");
  const fromMirror = resolveTreeRow("note-a", tree, [], mirrorRow);
  check("opened from a row inside a shortcut: that row stands in, with its shortcut expanded", fromMirror?.rowId === mirrorRow && fromMirror.expand.join() === "sc", JSON.stringify(fromMirror));
  check("a remembered row that no longer leads there is ignored", resolveTreeRow("note-a", tree, [], "sc")?.rowId === "note-a");
  check("otherwise its own row", resolveTreeRow("note-a", tree, [], null)?.rowId === "note-a");

  // A view without the original: only the shortcuts are on screen; docs is carried.
  const view = [node("projects", { contentType: "folder", children: [sc, scToNote] })];
  check("not in the tree: a shortcut straight to it", resolveTreeRow("note-a", view, [docs], null)?.rowId === "sc-note");
  const deep = resolveTreeRow("deep", view, [docs], null);
  check(
    "not in the tree, no direct shortcut: the row inside a shortcut's folder, folders on the way expanded",
    deep?.rowId === shortcutMirrorId(shortcutMirrorId("sc", "sub"), "deep") && deep.expand.join() === `sc,${shortcutMirrorId("sc", "sub")}`,
    JSON.stringify(deep),
  );
  check("nothing leads to it: null", resolveTreeRow("elsewhere", view, [docs], null) === null);
  check("expansions for a row three deep", expansionsFor("smirror:S/a/b/X").join() === "S,smirror:S/a,smirror:S/a/b");
}

if (failures > 0) {
  console.error(`\nshortcut-mirror:check — ${failures} check(s) failed.\n`);
  process.exit(1);
}

console.log(
  "shortcut-mirror:check — OK (identity, mirroring, broken targets, laziness, cycles, drop forwarding, nested-shortcut hiding, out-of-view targets, row actions, view reach, shortcut sorts, stand-in rows)",
);
