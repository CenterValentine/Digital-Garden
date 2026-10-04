/**
 * Reference-block transform gate.
 *
 * INVARIANT PROTECTED — object identity through `expandReferences`.
 *
 * The file tree's reference blocks are a DATA transform, not tree open-state:
 * the API partitions referenced children out of `children` into `references`,
 * and `expandReferences` splices them back for parents whose count chip is
 * open. Because that runs on every render of FileTree, it MUST return nodes and
 * arrays by identity when nothing about them changed.
 *
 * react-arborist keys row recycling off object identity. A version of this
 * function that clones unconditionally — the obvious "simplification", since it
 * produces identical JSON — remounts every row whenever anything anywhere in
 * the tree re-renders. The visible symptom is the inline-rename input losing
 * focus and caret position mid-keystroke, which is the same class of bug the
 * repo already hit with `OnlyOfficeEditor`'s `Date.now()` key (see CLAUDE.md,
 * "Lessons learned"). Neither tsc nor eslint can see it, and the production
 * build is perfectly happy, so it needs a gate.
 *
 * Also pins the behaviour the chip and its placement arrow depend on: ordering
 * either side of the primary children, edge tagging for the block's rounded
 * corners, and independent nesting.
 *
 * Run: pnpm reference-block:check
 */
import {
  expandReferences,
  referenceGroupKey,
} from "@/lib/features/content/reference-group";
import {
  toWindowReferenceRow,
  windowReferenceRowId,
} from "@/lib/features/content/window-reference";
import { findTreeNodeById } from "@/lib/domain/content/tree-drop-target";
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

/** Folder with 3 primary notes and 3 referenced attachments. */
function fixture(): TreeNode[] {
  return [
    node("folder", {
      contentType: "folder",
      children: [node("note-a"), node("note-b"), node("note-c")],
      references: [
        node("ref-1", { role: "referenced" }),
        node("ref-2", { role: "referenced" }),
        node("ref-3", { role: "referenced" }),
      ],
    }),
    node("loose-note"),
  ];
}

const ids = (nodes: TreeNode[]) => nodes.map((n) => n.id).join(",");
const KEY = referenceGroupKey("folder");
const EMPTY = new Set<string>();

// --- Identity contract (the load-bearing one) ------------------------------
{
  const data = fixture();
  const out = expandReferences(data, EMPTY, EMPTY);
  check("collapsed: array identity preserved", out === data);
  check("collapsed: node identity preserved", out[0] === data[0]);
  check(
    "collapsed: references stay out of children",
    ids(out[0].children) === "note-a,note-b,note-c",
    ids(out[0].children),
  );
}

{
  const data = fixture();
  const out = expandReferences(data, new Set([KEY]), EMPTY);
  check(
    "expanded: untouched sibling keeps identity",
    out[1] === data[1],
    "loose-note was cloned",
  );
  check(
    "expanded: primary children keep identity",
    out[0].children[0] === data[0].children[0],
    "note-a was cloned",
  );
}

{
  const data = [node("folder", { contentType: "folder", references: [] })];
  const out = expandReferences(data, new Set([KEY]), EMPTY);
  check("empty references array does not clone", out === data);
}

{
  const bare = { ...node("bare") } as TreeNode;
  delete (bare as Partial<TreeNode>).children;
  const data = [bare];
  check(
    "undefined children does not clone",
    expandReferences(data, EMPTY, EMPTY) === data,
  );
}

// --- Ordering + placement flip ---------------------------------------------
{
  const out = expandReferences(fixture(), new Set([KEY]), EMPTY);
  check(
    "default placement: references after primary",
    ids(out[0].children) === "note-a,note-b,note-c,ref-1,ref-2,ref-3",
    ids(out[0].children),
  );
}

{
  const out = expandReferences(fixture(), new Set([KEY]), new Set(["folder"]));
  check(
    "flipped placement: references before primary",
    ids(out[0].children) === "ref-1,ref-2,ref-3,note-a,note-b,note-c",
    ids(out[0].children),
  );
}

{
  const data = fixture();
  check(
    "placement without expansion is inert",
    expandReferences(data, EMPTY, new Set(["folder"])) === data,
  );
}

// --- Edge tagging (drives the block's rounded corners) ----------------------
{
  const out = expandReferences(fixture(), new Set([KEY]), EMPTY);
  const refs = out[0].children.filter((c) => c.isNestedReference);
  check("all references tagged isNestedReference", refs.length === 3);
  check(
    "edges are first/middle/last",
    refs.map((r) => r.referenceEdge).join(",") === "first,middle,last",
    refs.map((r) => r.referenceEdge).join(","),
  );
  check(
    "primary rows are not tagged",
    out[0].children
      .filter((c) => !c.isNestedReference)
      .every((c) => c.referenceEdge === undefined),
  );
}

{
  const data = [
    node("folder", {
      contentType: "folder",
      children: [node("note-a")],
      references: [node("ref-1", { role: "referenced" })],
    }),
  ];
  const only = expandReferences(data, new Set([KEY]), EMPTY)[0].children.find(
    (c) => c.isNestedReference,
  );
  check("lone reference gets edge 'only'", only?.referenceEdge === "only", only?.referenceEdge);
}

// --- Independent nesting (a chat's deliverables inside a folder's block) ----
{
  const data = [
    node("folder", {
      contentType: "folder",
      children: [],
      references: [
        node("chat", {
          contentType: "chat",
          role: "referenced",
          children: [],
          references: [node("deliverable", { role: "referenced" })],
        }),
      ],
    }),
  ];

  check(
    "inner block stays closed when only outer is open",
    expandReferences(data, new Set([KEY]), EMPTY)[0].children.length === 1,
  );

  const both = expandReferences(
    data,
    new Set([KEY, referenceGroupKey("chat")]),
    EMPTY,
  );
  check(
    "inner block opens independently",
    ids(both[0].children[0].children) === "deliverable",
    ids(both[0].children[0].children),
  );
}

// --- Lookup reaches into reference blocks --------------------------------
//
// Shared tree walkers must search `references` as well as `children`. The
// drag handler resolves every dragged id through findTreeNodeById and BAILS
// when one is missing ("could not be found in the current tree"), so a
// children-only walk made anything inside a reference block permanently
// unmovable — the move request was never even sent. Same omission silently
// pruned referenced rows from the persisted selection and skipped optimistic
// renames. Any new tree walker has to handle both arrays.
{
  const data = fixture();
  check(
    "findTreeNodeById finds a node inside references",
    findTreeNodeById(data, "ref-2")?.id === "ref-2",
    "children-only walk — reference block is unreachable",
  );
  check(
    "findTreeNodeById still finds primary children",
    findTreeNodeById(data, "note-b")?.id === "note-b",
  );
  check(
    "findTreeNodeById returns null for an absent id",
    findTreeNodeById(data, "nope") === null,
  );
}

{
  // A reference that itself owns references — the deliverable-under-side-chat
  // shape. Lookup has to recurse through a references array, not just into one.
  const data = [
    node("folder", {
      contentType: "folder",
      children: [],
      references: [
        node("chat", {
          contentType: "chat",
          role: "referenced",
          children: [],
          references: [node("deliverable", { role: "referenced" })],
        }),
      ],
    }),
  ];
  check(
    "findTreeNodeById recurses through nested references",
    findTreeNodeById(data, "deliverable")?.id === "deliverable",
  );
}

// --- Window reference rows (tree-API synthesis contract) -------------------
//
// The tree route derives a row per window-ref edge via toWindowReferenceRow
// and appends it to the host note's `references`. Two invariants matter and
// neither is visible to tsc:
//  1. ARRAY ALIASING. The clone must RESET children/references, never share
//     the real node's arrays — a shared array lets mutations bleed between
//     the real row and every window row of it, and drags the target's
//     subtree into the drawer.
//  2. ID NAMESPACING. `wref:` ids must collide with nothing: not a raw uuid,
//     not a `refs:` drawer key, not an `smirror:` mirror path — react-arborist
//     silently corrupts when one id names two rows.
{
  const target = node("target-note", {
    children: [node("target-child")],
    references: [node("target-attachment", { role: "referenced" })],
  });
  const row = toWindowReferenceRow(target, "host-note");

  check(
    "window row: id is path-scoped under the host",
    row.id === windowReferenceRowId("host-note", "target-note") &&
      row.id === "wref:host-note/target-note",
    row.id,
  );
  check(
    "window row: carries the mirror-row contract",
    row.mirrorOf === "target-note" &&
      row.isShortcutMirror === true &&
      row.windowRef?.targetId === "target-note",
  );
  check("window row: re-parented under the host", row.parentId === "host-note");
  check("window row: role forced to referenced", row.role === "referenced");
  check(
    "window row: children and references reset, not aliased",
    row.children.length === 0 &&
      row.references?.length === 0 &&
      row.children !== target.children &&
      row.references !== target.references,
  );
  check(
    "window row: source node left unmutated",
    target.id === "target-note" &&
      target.parentId === null &&
      target.children.length === 1 &&
      target.mirrorOf === undefined,
  );
  check(
    "wref prefix collides with no other namespace",
    !windowReferenceRowId("h", "t").startsWith("refs:") &&
      !windowReferenceRowId("h", "t").startsWith("smirror:") &&
      windowReferenceRowId("h", "t") !== "t",
  );
}

{
  // Window rows ride the drawer: spliced in when the host's chip is open,
  // tagged as nested references, and left out of children when it is not.
  const target = node("target-note");
  const host = node("host-note", {
    references: [toWindowReferenceRow(target, "host-note")],
  });
  const data = [host];

  const closed = expandReferences(data, EMPTY, EMPTY);
  check(
    "window row: stays out of children while the drawer is closed",
    closed === data && closed[0].children.length === 0,
  );

  const open = expandReferences(
    data,
    new Set([referenceGroupKey("host-note")]),
    EMPTY,
  );
  const spliced = open[0].children[0];
  check(
    "window row: splices into children when the drawer opens",
    open[0].children.length === 1 &&
      spliced?.id === "wref:host-note/target-note",
  );
  check(
    "window row: tagged as a nested reference when spliced",
    spliced?.isNestedReference === true && spliced?.referenceEdge === "only",
  );
  check(
    "window row: findTreeNodeById resolves it inside the references array",
    findTreeNodeById(data, "wref:host-note/target-note")?.windowRef?.targetId ===
      "target-note",
  );
}

if (failures > 0) {
  console.error(`\nreference-block:check — ${failures} check(s) failed.\n`);
  process.exit(1);
}

console.log(
  "reference-block:check — OK (identity, ordering, edges, nesting, window rows)",
);
