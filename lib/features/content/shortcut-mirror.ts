/**
 * Shortcut folder mirroring.
 *
 * A shortcut pointing at a folder shows that folder's contents inline, as
 * view-only rows, recursively. The user's framing: "safety-first recursive
 * folder mirroring."
 *
 * Three properties make the recursion safe, and all three are load-bearing:
 *
 *  1. LAZY. A level is built only when its row is actually expanded. A cycle
 *     (a shortcut to folder A living inside folder A) therefore costs one
 *     level per click instead of recursing forever at build time.
 *  2. PATH-SCOPED IDS. A mirror row's id is its parent's id plus the real
 *     content id, so the same content mirrored twice — or reached again
 *     through a cycle — still yields distinct rows. react-arborist keys
 *     selection, expansion, scroll-to and drop positions off row id, and every
 *     one of those breaks when an id appears twice.
 *  3. DEPTH CAP. Expansion state is persisted, so a pathological set of open
 *     ids could otherwise be replayed into an enormous tree on the next load,
 *     with no click to pace it. The cap bounds that first render.
 *
 * Mirror rows are projections: nothing here changes storage, and a shortcut
 * never becomes a real parent. Dropping onto one forwards to the real folder
 * (see the move route); dragging one moves the real item it stands for
 * (FileTree passes `mirrorOf` up), so content can be rearranged from inside a
 * shortcut without visiting the source folder. Actions that only REFER to the
 * content (open, copy, download) reach the original; deleting a mirror row
 * removes the shortcut, never the original (`deleteTargetsOfRowIds`); other
 * edits stay with the content's own row.
 *
 * Pure and dependency-free by design so it can be exercised without standing
 * up react-arborist or a browser. Mirrors the structure of `expandReferences`
 * in ./reference-group, including its identity contract.
 */
import type { TreeNode } from "@/lib/domain/content/types";
import { applyKeptSort, isFolderLike, type KeptSort } from "@/lib/domain/content/sibling-order";
import { WINDOW_REFERENCE_PREFIX } from "./window-reference";

/** Namespaced so a mirror row id can never collide with a ContentNode uuid. */
export const SHORTCUT_MIRROR_PREFIX = "smirror:";

/**
 * Deepest chain of mirrored folders built in one pass. Generous — real use is
 * a level or two — because this is a guard against replayed expansion state,
 * not a limit the user is meant to feel.
 */
export const MAX_MIRROR_DEPTH = 10;

/** Root of a mirror path: the shortcut row's own id scopes everything under it. */
export function shortcutMirrorId(parentRowId: string, realId: string): string {
  return parentRowId.startsWith(SHORTCUT_MIRROR_PREFIX)
    ? `${parentRowId}/${realId}`
    : `${SHORTCUT_MIRROR_PREFIX}${parentRowId}/${realId}`;
}

/** The real ContentNode id a mirror row stands for. */
export function realIdOfMirrorRow(node: TreeNode): string | null {
  return node.mirrorOf ?? null;
}

function isProjectionRowId(rowId: string): boolean {
  return rowId.startsWith(SHORTCUT_MIRROR_PREFIX) || rowId.startsWith(WINDOW_REFERENCE_PREFIX);
}

/**
 * The content a tree row stands for, from its id alone. A projection row — a
 * shortcut's mirror (`smirror:<shortcut>/…/<id>`) or a note's window
 * reference (`wref:<host>/<id>`) — ends in the real id; any other row IS its
 * content. For actions that only refer to content (open, copy a link,
 * download): they go to the original wherever the row is shown.
 */
export function contentIdOfRowId(rowId: string): string {
  if (!isProjectionRowId(rowId)) return rowId;
  return rowId.slice(rowId.lastIndexOf("/") + 1);
}

/**
 * The shortcut a mirror row is shown through: the head of its path, which is
 * the shortcut's own row in the user's tree. Null for any other row.
 */
export function shortcutIdOfMirrorRowId(rowId: string): string | null {
  if (!rowId.startsWith(SHORTCUT_MIRROR_PREFIX)) return null;
  const head = rowId.slice(SHORTCUT_MIRROR_PREFIX.length).split("/")[0];
  return head || null;
}

/**
 * What deleting these rows removes.
 *
 * A row seen through a shortcut removes THAT SHORTCUT — never the original it
 * mirrors (owner rule, 2026-10-05: "deleting … of a shortcut, NOT the deleting
 * of the original content itself"). The original lives somewhere the user is
 * not looking; trashing it from a projection is the surprise this prevents.
 * A window-reference row removes nothing: it is derived from a Note Window in
 * its host note, and taking that out is an edit of the note. Every other row
 * removes itself. Order kept, duplicates dropped.
 */
export function deleteTargetsOfRowIds(rowIds: readonly string[]): string[] {
  const targets: string[] = [];
  for (const rowId of rowIds) {
    if (rowId.startsWith(WINDOW_REFERENCE_PREFIX)) continue;
    const target = rowId.startsWith(SHORTCUT_MIRROR_PREFIX)
      ? shortcutIdOfMirrorRowId(rowId)
      : rowId;
    if (target && !targets.includes(target)) targets.push(target);
  }
  return targets;
}

/**
 * Does this row point at a folder we can mirror right now?
 *
 * A broken shortcut is deliberately not mirrorable: it has nothing to show,
 * and its row explains why instead.
 */
function mirrorableTargetId(node: TreeNode): string | null {
  if (node.contentType !== "shortcut") return null;
  const shortcut = node.shortcut;
  if (!shortcut || !shortcut.targetId || shortcut.targetDeleted) return null;
  if (shortcut.targetContentType !== "folder") return null;
  return shortcut.targetId;
}

/** Flat id → node index over both children and references. */
function indexTree(nodes: TreeNode[], into: Map<string, TreeNode>): void {
  for (const node of nodes) {
    into.set(node.id, node);
    if (node.children?.length) indexTree(node.children, into);
    if (node.references?.length) indexTree(node.references, into);
  }
}

export function buildTreeIndex(
  nodes: TreeNode[],
  /**
   * Folders a shortcut points at that are NOT in `nodes` — a view-scoped tree
   * leaves out everything outside its root, so the tree API returns those
   * targets beside it (`shortcutTargets`, see shortcut-targets.ts). Indexed
   * only where the visible tree has no row of that id: what's on screen wins.
   */
  extra: TreeNode[] = [],
): Map<string, TreeNode> {
  const index = new Map<string, TreeNode>();
  indexTree(nodes, index);
  if (extra.length > 0) {
    const carried = new Map<string, TreeNode>();
    indexTree(extra, carried);
    for (const [id, node] of carried) {
      if (!index.has(id)) index.set(id, node);
    }
  }
  return index;
}

/**
 * Clone one real row as a view-only mirror row.
 *
 * Carries the reference block's edge metadata so mirrored rows reuse that
 * chrome — the wash, rail and rounded corners already read as "this lives
 * somewhere else", which is exactly what a mirror is.
 */
function toMirrorRow(
  source: TreeNode,
  parentRowId: string,
  index: number,
  total: number,
): TreeNode {
  return {
    ...source,
    id: shortcutMirrorId(parentRowId, source.id),
    mirrorOf: source.id,
    isShortcutMirror: true,
    // Rebuilt per level as the user expands, never inherited from the source.
    children: [],
    references: [],
    referenceEdge:
      total === 1 ? "only" : index === 0 ? "first" : index === total - 1 ? "last" : "middle",
  };
}

/**
 * Children for one expanded mirror level.
 *
 * `sourceChildren` deliberately excludes the source's `references`: a
 * shortcut mirrors what a folder CONTAINS, and attachments belong to the note
 * that owns them, not to the folder they happen to sit under.
 */
function mirrorChildrenOf(
  sourceId: string,
  parentRowId: string,
  index: Map<string, TreeNode>,
  expandedIds: Set<string>,
  hideNested: boolean,
  depth: number,
  /** The shortcut's OWN sort, for its top level only (null = the folder's order). */
  ownSort: KeptSort | null = null,
): TreeNode[] {
  if (depth > MAX_MIRROR_DEPTH) return [];
  const source = index.get(sourceId);
  if (!source) return [];

  // A mirrored folder shows whatever it contains, shortcuts included — so a
  // shortcut can surface more shortcuts, each expanding into another mirror.
  // Legitimate, but noisy, and it is the shape that puts a cycle one click
  // away. Hiding them is per-shortcut and opt-in.
  const shown = (source.children ?? []).filter(
    (child) => !(hideNested && child.contentType === "shortcut"),
  );
  // A shortcut can keep its own sort (owner, 2026-10-06): it changes how THIS
  // shortcut shows the folder, never the folder. Without one, the shortcut
  // follows the folder's order — including a sort the folder keeps.
  const sourceChildren = ownSort
    ? applyKeptSort(
        shown.map((child) => ({
          id: child.id,
          title: child.title,
          displayOrder: child.displayOrder ?? 0,
          folderLike: isFolderLike(child),
          nested: (child.children?.length ?? 0) > 0,
          child,
        })),
        ownSort,
      ).map((row) => row.child)
    : shown;
  return sourceChildren.map((child, i) => {
    const row = toMirrorRow(child, parentRowId, i, sourceChildren.length);
    // Only descend into levels the user has actually opened — this is what
    // keeps a cycle finite. A folder shows its own contents; a shortcut
    // inside the mirror shows its target folder's (owner report,
    // 2026-10-06: it showed as open with nothing under it, since only
    // folders were descended into). The depth cap and lazy expansion bound
    // a shortcut that leads back here exactly as they bound a folder.
    const descendInto =
      child.contentType === "folder" ? child.id : mirrorableTargetId(child);
    if (descendInto && expandedIds.has(row.id)) {
      row.children = mirrorChildrenOf(
        descendInto,
        row.id,
        index,
        expandedIds,
        hideNested,
        depth + 1,
      );
    }
    return row;
  });
}

/**
 * Splice mirrored children into every expanded folder-shortcut row.
 *
 * IDENTITY CONTRACT — same rule as expandReferences, and load-bearing for the
 * same reason: nodes and arrays are returned BY IDENTITY when nothing about
 * them changed. react-arborist keys row recycling off object identity, so
 * cloning unconditionally remounts every row on any re-render, which among
 * other things destroys a focused inline-rename input mid-keystroke.
 *
 * Runs AFTER expandReferences so it sees the same `children` react-arborist
 * will, and so a mirror row never has to reason about reference blocks.
 */
export function expandShortcutMirrors(
  nodes: TreeNode[],
  expandedIds: Set<string>,
  index: Map<string, TreeNode>,
  hiddenNestedShortcutIds: Set<string> = new Set(),
  depth = 0,
  /** Shortcuts' own sorts, by shortcut id (user settings `ui.shortcutSorts`). */
  shortcutSorts: Readonly<Record<string, KeptSort>> = {},
): TreeNode[] {
  let changed = false;

  const next = nodes.map((node) => {
    const targetId = mirrorableTargetId(node);
    const shouldMirror =
      targetId !== null && expandedIds.has(node.id) && depth <= MAX_MIRROR_DEPTH;

    const children = node.children ?? [];
    const nextChildren = expandShortcutMirrors(
      children,
      expandedIds,
      index,
      hiddenNestedShortcutIds,
      depth + 1,
      shortcutSorts,
    );

    if (!shouldMirror) {
      if (nextChildren === children) return node;
      changed = true;
      return { ...node, children: nextChildren };
    }

    const mirrored = mirrorChildrenOf(
      targetId,
      node.id,
      index,
      expandedIds,
      hiddenNestedShortcutIds.has(node.id),
      depth + 1,
      shortcutSorts[node.id] ?? null,
    );
    if (mirrored.length === 0 && nextChildren === children) return node;

    changed = true;
    return { ...node, children: [...nextChildren, ...mirrored] };
  });

  return changed ? next : nodes;
}

/**
 * If a drop lands on this row, which real folder should receive it?
 *
 * A folder-shortcut, a mirrored folder and a shortcut seen inside a shortcut
 * all DISPLAY a folder that lives elsewhere. Dropping onto any of them means
 * "put this in that folder", so the destination is rewritten to the real id
 * before the move is sent — which is how "nothing is ever stored under a
 * shortcut" survives contact with drag-and-drop. (A shortcut inside a
 * shortcut used to forward nowhere, so drops on it were refused — owner
 * report, 2026-10-06.)
 *
 * Returns null for rows that are not projections, and for broken shortcuts:
 * there is no folder to forward to, so the drop is refused rather than
 * silently landing somewhere else.
 */
export function resolveDropForwardTarget(node: TreeNode): string | null {
  if (node.isShortcutMirror && node.contentType === "folder") {
    return node.mirrorOf ?? null;
  }
  // A shortcut — its own row, or seen inside another shortcut (a mirror row
  // keeps the original's shortcut payload): its target folder, if live.
  return mirrorableTargetId(node);
}

/**
 * The tree row a SELECTION stands for when deciding where "+" adds and what
 * the sort menu sorts. A row inside a shortcut stands for that shortcut (the
 * head of its path); a note's window row stands for its note. Their own ids
 * name nothing the tree's data holds, so they used to fall through to "the
 * top level" — the "+" tooltip named one place and the sort another.
 */
export function targetRowOfSelection(rowId: string): string {
  const shortcutId = shortcutIdOfMirrorRowId(rowId);
  if (shortcutId) return shortcutId;
  if (rowId.startsWith(WINDOW_REFERENCE_PREFIX)) {
    const host = rowId.slice(WINDOW_REFERENCE_PREFIX.length).split("/")[0];
    return host || rowId;
  }
  return rowId;
}
