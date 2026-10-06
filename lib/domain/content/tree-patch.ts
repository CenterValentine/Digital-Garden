/**
 * Patch a row's title in place, wherever it sits in the tree — children or a
 * parent's reference block. Used for renames made outside the tree (the main
 * panel, a tab, a Note Window — the `content-updated` event), so the tree
 * shows the new name without a refetch.
 *
 * Identity-preserving: only the renamed row and its ancestors are new
 * objects, and an unchanged tree comes back as the same array — react-arborist
 * recycles rows by identity (see expandReferences). Pure.
 */
import type { TreeNode } from "./types";

export function patchTreeNodeTitle(
  nodes: TreeNode[],
  contentId: string,
  newTitle: string,
): TreeNode[] {
  // Identity-preserving: only the renamed row and its ancestors are new
  // objects (react-arborist recycles rows by identity — see expandReferences).
  let changed = false;
  const next = nodes.map((node) => {
    // The row itself, or a row that stands for it — a Note Window's row in
    // its note's referenced content (`wref:` id, `mirrorOf` the windowed
    // note). Owner report, 2026-10-06: renaming a windowed note left its
    // window row showing the old name.
    if (node.id === contentId || node.mirrorOf === contentId) {
      if (node.title === newTitle) return node;
      changed = true;
      return { ...node, title: newTitle };
    }

    // Both arrays — a rename of content sitting in a parent's reference block
    // has to patch there too, or the optimistic title never updates for it.
    if (!node.children?.length && !node.references?.length) {
      return node;
    }

    const children = node.children?.length
      ? patchTreeNodeTitle(node.children, contentId, newTitle)
      : node.children;
    const references = node.references?.length
      ? patchTreeNodeTitle(node.references, contentId, newTitle)
      : node.references;
    if (children === node.children && references === node.references) return node;
    changed = true;
    return { ...node, children: children ?? [], references };
  });
  return changed ? next : nodes;
}
