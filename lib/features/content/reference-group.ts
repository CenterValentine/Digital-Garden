/**
 * Reference block expansion key.
 *
 * Referenced content (attachments, embedded media, AI deliverables) is
 * partitioned out of a parent's `children` by the tree API and revealed by a
 * count chip on the parent row. The open/closed state of that block is stored
 * in the SAME `expandedIds` set as ordinary node expansion, so it inherits
 * localStorage persistence and TreeStateSnapshot workspace round-tripping
 * without any new plumbing.
 *
 * Lives here rather than in FileTree so FileNode can read it without creating
 * an import cycle (FileTree renders FileNode).
 */
import type { TreeNode } from "@/lib/domain/content/types";

export const REFERENCE_GROUP_PREFIX = "refs:";

/** Namespaced so it can never collide with a ContentNode uuid. */
export function referenceGroupKey(parentId: string): string {
  return `${REFERENCE_GROUP_PREFIX}${parentId}`;
}

/**
 * Splice each parent's `references` back into `children` when its chip is open,
 * before or after the primary children depending on that parent's placement.
 *
 * The API partitions references out so they never interleave; this is the only
 * place they come back, and only for parents the user has opened.
 *
 * IDENTITY CONTRACT — load-bearing, do not "simplify" away: nodes and arrays are
 * returned BY IDENTITY when nothing about them changed. react-arborist keys row
 * recycling off object identity, so cloning unconditionally would remount every
 * row whenever anything anywhere in the tree re-rendered — which, among other
 * things, destroys the focused inline-rename input mid-keystroke. The `changed`
 * flag and the `nextPrimary === primary` check exist for that reason.
 *
 * Pure and dependency-free by design so it can be exercised directly, without
 * standing up react-arborist or a browser.
 */
export function expandReferences(
  nodes: TreeNode[],
  expandedIds: Set<string>,
  referencesAtStartIds: Set<string>,
): TreeNode[] {
  let changed = false;

  const next = nodes.map((node) => {
    const references = node.references ?? [];
    const primary = node.children ?? [];
    const nextPrimary = expandReferences(
      primary,
      expandedIds,
      referencesAtStartIds,
    );
    const showReferences =
      references.length > 0 && expandedIds.has(referenceGroupKey(node.id));

    if (!showReferences) {
      if (nextPrimary === primary) return node;
      changed = true;
      return { ...node, children: nextPrimary };
    }

    const nested = expandReferences(
      references,
      expandedIds,
      referencesAtStartIds,
    ).map(
      (reference, index, all): TreeNode => ({
        ...reference,
        isNestedReference: true,
        referenceEdge:
          all.length === 1
            ? "only"
            : index === 0
              ? "first"
              : index === all.length - 1
                ? "last"
                : "middle",
      }),
    );

    // Placement is per-parent: a media folder reads better with its
    // attachments first, a working folder with them out of the way.
    const atStart = referencesAtStartIds.has(node.id);

    changed = true;
    return {
      ...node,
      children: atStart
        ? [...nested, ...nextPrimary]
        : [...nextPrimary, ...nested],
    };
  });

  return changed ? next : nodes;
}
