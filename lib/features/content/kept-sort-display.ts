/**
 * Folders that keep a sort, shown in it on the client too.
 *
 * The tree route already returns a sorted folder's children in its order
 * (sibling-order.ts `applyKeptSort`); this applies the same rule to the tree
 * the client holds, so an optimistic change — a drop into a sorted folder, a
 * rename, a new row — shows in its sorted place at once instead of jumping
 * there when the tree next refreshes.
 *
 * Identity contract, as expandReferences: a level already in order comes back
 * BY IDENTITY, and results are cached per input array and sort, so
 * react-arborist re-renders only rows that moved. Pure.
 */
import type { TreeNode } from "@/lib/domain/content/types";
import { applyKeptSort, isFolderLike, type KeptSort } from "@/lib/domain/content/sibling-order";

type Sortable = Pick<TreeNode, "id" | "title" | "displayOrder" | "contentType" | "shortcut" | "folder"> & {
  children?: Sortable[];
};

const cache = new WeakMap<object, { key: string; value: unknown }>();

function keyOf(kept: KeptSort | null): string {
  return kept ? `${kept.float ?? "-"}:${kept.name ?? "-"}` : "manual";
}

function orderLevel<T extends Sortable>(nodes: T[], kept: KeptSort | null): T[] {
  if (!kept || nodes.length < 2) return nodes;
  const ordered = applyKeptSort(
    nodes.map((node) => ({
      id: node.id,
      title: node.title,
      displayOrder: node.displayOrder ?? 0,
      folderLike: isFolderLike(node),
      nested: (node.children?.length ?? 0) > 0,
      node,
    })),
    kept,
  ).map((row) => row.node);
  return ordered.every((node, i) => node === nodes[i]) ? nodes : ordered;
}

/** `nodes` (a level whose own folder keeps `kept`) and every level below, in their kept orders. */
export function showKeptSorts<T extends Sortable>(nodes: T[], kept: KeptSort | null): T[] {
  const key = keyOf(kept);
  const hit = cache.get(nodes);
  if (hit && hit.key === key) return hit.value as T[];

  let changed = false;
  const next = nodes.map((node) => {
    if (!node.children?.length) return node;
    const children = showKeptSorts(node.children as T[], node.folder?.treeSort ?? null);
    if (children === node.children) return node;
    changed = true;
    return { ...node, children };
  });
  const result = orderLevel(changed ? next : nodes, kept);
  cache.set(nodes, { key, value: result });
  return result;
}

/** One level in its kept order (no recursion) — what the folder shows. */
export function orderKeptLevel<T extends Sortable>(nodes: T[], kept: KeptSort | null): T[] {
  return orderLevel(nodes, kept);
}

/**
 * The tree with folder `folderId` switched back to manual: its children fixed
 * in the order its sort showed, and its sort cleared — what a drag inside a
 * sorted folder does (the move route does the same on the server), so the
 * drop lands among the rows as the user saw them.
 */
export function clearKeptSort<T extends Sortable>(nodes: T[], folderId: string): T[] {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.id === folderId && node.folder?.treeSort) {
      changed = true;
      return {
        ...node,
        children: orderLevel((node.children ?? []) as T[], node.folder.treeSort),
        folder: { ...node.folder, treeSort: null },
      };
    }
    if (!node.children?.length) return node;
    const children = clearKeptSort(node.children as T[], folderId);
    if (children === node.children) return node;
    changed = true;
    return { ...node, children };
  });
  return changed ? next : nodes;
}
