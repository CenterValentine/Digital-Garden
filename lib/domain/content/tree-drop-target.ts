/**
 * File-tree drop-target resolution.
 *
 * External file drops onto the tree used to always land at the vault root.
 * These helpers answer "which folder does this drop belong to?" from the
 * three signals the sidebar has, in descending order of intent:
 *
 *   1. the row under the pointer at drop time,
 *   2. the current tree selection,
 *   3. the content open in the main panel.
 *
 * A leaf resolves to its containing folder, so dropping onto a note puts the
 * file beside it rather than at the root. Synthetic People rows (peopleGroup /
 * person) are not real content parents, so resolution climbs past them.
 */

import type { TreeNode } from "./types";

export const ROOT_DROP_TARGET_LABEL = "root";

/** Where the resolved destination came from — drives the drag overlay copy. */
export type DropTargetSource = "pointer" | "selection" | "openContent" | "root";

export interface UploadDropTarget {
  /** Content id of the destination folder; `null` means the vault root. */
  parentId: string | null;
  /** Destination title for the drag overlay. */
  label: string;
  source: DropTargetSource;
}

export const ROOT_DROP_TARGET: UploadDropTarget = {
  parentId: null,
  label: ROOT_DROP_TARGET_LABEL,
  source: "root",
};

/**
 * Depth-first lookup across BOTH child arrays.
 *
 * Referenced children are partitioned out of `children` into `references` by
 * the tree API, so searching `children` alone makes anything inside a
 * reference block invisible to every caller of this helper. That included the
 * drag handler's pre-flight resolve, which bails when a dragged id can't be
 * found — so a reference dropped into a folder became unmovable: the guard
 * rejected it before any request was sent.
 */
export function findTreeNodeById(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found =
      (node.children ? findTreeNodeById(node.children, id) : null) ??
      (node.references ? findTreeNodeById(node.references, id) : null);
    if (found) return found;
  }
  return null;
}

/** A folder that can actually own uploaded content (not a People placeholder). */
function isContentFolder(node: TreeNode): boolean {
  return node.contentType === "folder" && (node.treeNodeKind ?? "content") === "content";
}

/**
 * Climb from `startId` to the nearest folder that can own content.
 * Returns `null` when the walk reaches the root.
 */
export function resolveDropParentNode(
  treeData: TreeNode[],
  startId: string | null,
): TreeNode | null {
  let current = startId ? findTreeNodeById(treeData, startId) : null;
  const seen = new Set<string>();

  while (current && !isContentFolder(current)) {
    if (seen.has(current.id)) return null; // cycle guard on malformed trees
    seen.add(current.id);
    current = current.parentId ? findTreeNodeById(treeData, current.parentId) : null;
  }

  return current;
}

function toDropTarget(
  treeData: TreeNode[],
  startId: string | null,
  source: DropTargetSource,
): UploadDropTarget {
  const folder = resolveDropParentNode(treeData, startId);
  if (!folder) return ROOT_DROP_TARGET;
  return { parentId: folder.id, label: folder.title || "Untitled folder", source };
}

export interface ResolveUploadDropTargetArgs {
  treeData: TreeNode[];
  /** Id of the tree row under the pointer, if any. */
  pointerNodeId?: string | null;
  /** Current file-tree selection (`useTreeStateStore`). */
  selectedIds?: string[];
  /** Content open in the main panel (`useContentStore.selectedContentId`). */
  activeContentId?: string | null;
}

/**
 * Resolve where an external file drop should land.
 *
 * Pointer wins outright — hovering a root-level note is an explicit request
 * for the root, so it does NOT fall through to the selection. Selection is
 * only consulted when exactly one row is selected; a multi-selection has no
 * unambiguous destination.
 */
export function resolveUploadDropTarget({
  treeData,
  pointerNodeId = null,
  selectedIds = [],
  activeContentId = null,
}: ResolveUploadDropTargetArgs): UploadDropTarget {
  if (pointerNodeId && findTreeNodeById(treeData, pointerNodeId)) {
    return toDropTarget(treeData, pointerNodeId, "pointer");
  }

  if (selectedIds.length === 1 && findTreeNodeById(treeData, selectedIds[0])) {
    return toDropTarget(treeData, selectedIds[0], "selection");
  }

  if (activeContentId && findTreeNodeById(treeData, activeContentId)) {
    return toDropTarget(treeData, activeContentId, "openContent");
  }

  return ROOT_DROP_TARGET;
}
