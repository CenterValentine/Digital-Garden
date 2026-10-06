/**
 * Which tree row stands for a piece of content — where the tree points
 * (selection, the gold "open" tone, reveal) when that content is open.
 *
 * The same content can appear more than once: its own row, a shortcut to it,
 * and rows inside a shortcut to a folder that holds it. The tree used to
 * point only at the content's OWN row (selection and the gold tone match row
 * ids). Owner report, 2026-10-06: clicking a shortcut opened the original and
 * the tree's selection jumped to the original's row, away from where they
 * clicked — and in a view where the original lives outside, nothing was
 * selected at all. Worse, ⌥D right after opening through a shortcut acted on
 * the ORIGINAL (the selection had moved there), not the shortcut clicked.
 *
 * Order (owner-approved):
 *  1. The row you opened it from, if it is still in the tree — a shortcut or
 *     a row inside one stands in for the original while you work through it.
 *  2. Its own row, if the tree holds it.
 *  3. A shortcut in the tree that points straight at it.
 *  4. A row inside a shortcut to a folder that holds it (any depth) — the
 *     shortcut and the folders on the way are expanded so the row exists.
 *
 * Standing in changes only where the tree POINTS. What an action on that row
 * does is already defined for shortcut rows and rows inside them (reference
 * actions reach the original; Delete removes the shortcut).
 *
 * Pure: `tree:smooth:check` pins it.
 */
import type { TreeNode } from "@/lib/domain/content/types";
import {
  MAX_MIRROR_DEPTH,
  buildTreeIndex,
  contentIdOfRowId,
  shortcutIdOfMirrorRowId,
  shortcutMirrorId,
} from "./shortcut-mirror";

export interface StandIn {
  /** The row to point at (a real id, or a path-scoped `smirror:` id). */
  rowId: string;
  /**
   * Rows to expand so that row exists: a row inside a shortcut is built only
   * while the shortcut (and each folder on the way) is open.
   */
  expand: string[];
}

function liveShortcutTarget(node: TreeNode): string | null {
  if (node.contentType !== "shortcut") return null;
  const shortcut = node.shortcut;
  return shortcut?.targetId && !shortcut.targetDeleted ? shortcut.targetId : null;
}

/** The ids to expand so a mirror row exists: its shortcut, then each folder on the path. */
export function expansionsFor(mirrorRowId: string): string[] {
  const shortcutId = shortcutIdOfMirrorRowId(mirrorRowId);
  if (!shortcutId) return [];
  const segments = mirrorRowId.split("/");
  const prefixes: string[] = [shortcutId];
  // smirror:S/a/b/X → [S, smirror:S/a, smirror:S/a/b]
  for (let i = 1; i < segments.length - 1; i++) {
    prefixes.push(segments.slice(0, i + 1).join("/"));
  }
  return prefixes;
}

/** Ids from a folder's child down to `contentId`, through folders only (what a mirror descends). */
function pathWithin(
  index: Map<string, TreeNode>,
  folderId: string,
  contentId: string,
  depthLeft: number,
): string[] | null {
  const folder = index.get(folderId);
  if (!folder || depthLeft <= 0) return null;
  for (const child of folder.children ?? []) {
    if (child.id === contentId) return [child.id];
  }
  for (const child of folder.children ?? []) {
    if (child.contentType !== "folder") continue;
    const rest = pathWithin(index, child.id, contentId, depthLeft - 1);
    if (rest) return [child.id, ...rest];
  }
  return null;
}

/**
 * The row that stands for `contentId` in `tree` (the tree as loaded — real
 * rows only), with `carried` (a view's out-of-view shortcut targets) for
 * finding it inside a shortcut's folder. `remembered`: the row it was last
 * opened from, if any. Null when nothing in the tree leads to it.
 */
export function resolveTreeRow(
  contentId: string,
  tree: TreeNode[],
  carried: TreeNode[],
  remembered: string | null,
): StandIn | null {
  const onScreen = buildTreeIndex(tree);

  // 1. The row it was opened from, while it still leads there.
  if (remembered && remembered !== contentId) {
    const head = shortcutIdOfMirrorRowId(remembered);
    if (head) {
      if (onScreen.has(head) && contentIdOfRowId(remembered) === contentId) {
        return { rowId: remembered, expand: expansionsFor(remembered) };
      }
    } else {
      const row = onScreen.get(remembered);
      if (row && liveShortcutTarget(row) === contentId) return { rowId: remembered, expand: [] };
    }
  }

  // 2. Its own row.
  if (onScreen.has(contentId)) return { rowId: contentId, expand: [] };

  // 3. A shortcut straight to it.
  for (const node of onScreen.values()) {
    if (liveShortcutTarget(node) === contentId) return { rowId: node.id, expand: [] };
  }

  // 4. Inside a shortcut to a folder that holds it.
  const index = buildTreeIndex(tree, carried);
  for (const node of onScreen.values()) {
    const target = liveShortcutTarget(node);
    if (!target || node.shortcut?.targetContentType !== "folder") continue;
    const path = pathWithin(index, target, contentId, MAX_MIRROR_DEPTH);
    if (!path) continue;
    let rowId = node.id;
    for (const id of path) rowId = shortcutMirrorId(rowId, id);
    return { rowId, expand: expansionsFor(rowId) };
  }
  return null;
}
