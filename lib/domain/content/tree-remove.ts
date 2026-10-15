/**
 * Pure tree edits behind the file tree's optimistic delete.
 *
 * Deleting used to wait for the server and then refetch the tree with the
 * skeleton up: the whole react-arborist tree unmounted and came back at the
 * top, so every delete flashed and lost your place. The delete now takes the
 * rows out of the tree the moment it is confirmed and reconciles quietly
 * afterwards; these are the edits it makes.
 *
 * Structural sharing is the point, not an optimisation: a branch with nothing
 * removed is returned as the SAME array/object, so untouched rows keep their
 * identity and the tree re-renders only along the paths that changed. Kept free
 * of React and the stores so `pnpm tree:remove:check` can drive it in Node.
 */

export interface RemovableTreeNode<T> {
  id: string;
  children?: T[];
  /** Referenced (owned) rows, held apart from `children` — see TreeNode. */
  references?: T[];
}

/**
 * The tree without the nodes whose id is in `ids`, wherever they appear
 * (`children` or `references`). A removed node's subtree goes with it. Returns
 * the input array itself when nothing under it matched.
 */
export function removeNodesFromTree<T extends RemovableTreeNode<T>>(
  nodes: T[],
  ids: ReadonlySet<string>,
): T[] {
  if (ids.size === 0) return nodes;
  let changed = false;
  const next: T[] = [];
  for (const node of nodes) {
    if (ids.has(node.id)) {
      changed = true;
      continue;
    }
    const children = node.children
      ? removeNodesFromTree(node.children, ids)
      : node.children;
    const references = node.references
      ? removeNodesFromTree(node.references, ids)
      : node.references;
    if (children !== node.children || references !== node.references) {
      changed = true;
      next.push({ ...node, children, references });
    } else {
      next.push(node);
    }
  }
  return changed ? next : nodes;
}

/**
 * Every id that leaves the tree when `rootIds` are removed: the roots and all
 * of their descendants (children and references). Used to prune selection,
 * which would otherwise keep pointing at rows that are no longer there.
 */
export function collectRemovedIds<T extends RemovableTreeNode<T>>(
  nodes: T[],
  rootIds: ReadonlySet<string>,
): Set<string> {
  const removed = new Set<string>();
  const takeAll = (list: T[] | undefined) => {
    for (const node of list ?? []) {
      removed.add(node.id);
      takeAll(node.children);
      takeAll(node.references);
    }
  };
  const walk = (list: T[] | undefined) => {
    for (const node of list ?? []) {
      if (rootIds.has(node.id)) {
        removed.add(node.id);
        takeAll(node.children);
        takeAll(node.references);
      } else {
        walk(node.children);
        walk(node.references);
      }
    }
  };
  walk(nodes);
  return removed;
}

/**
 * `ids` without any in `removed`. Returns the input array itself when nothing
 * was dropped, so a caller can skip a store write (and the effects it fires).
 */
export function withoutIds(
  ids: readonly string[],
  removed: ReadonlySet<string>,
): readonly string[] {
  const kept = ids.filter((id) => !removed.has(id));
  return kept.length === ids.length ? ids : kept;
}
