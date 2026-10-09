/**
 * A view and its shortcuts: which folders a view-scoped tree must carry so
 * its shortcuts can show what they point at (`outOfScopeShortcutTargets`).
 *
 * A view (a workspace rooted at a folder) loads only that folder's subtree.
 * A shortcut inside the view whose target folder lives elsewhere then mirrored
 * nothing: the client builds a shortcut's contents by looking the target up in
 * the tree it has, and the view filter had removed it. Owner report
 * (2026-10-05): "Career Development & Resources" — a shortcut in the Career
 * Hunt view to a folder under Career Pathways — expanded to nothing, though the
 * folder had ten items.
 *
 * The tree route already loads all of a user's content before filtering, so
 * it can keep these subtrees for free. They travel BESIDE the tree
 * (`shortcutTargets`), never in it: they are what a shortcut mirrors, not rows
 * of the view. Pure so `shortcut-mirror:check` can pin the selection.
 */

export interface ScopedNodeLite {
  id: string;
  parentId: string | null;
  contentType: string;
  /** For shortcut rows: the live target id, or null if the shortcut is broken. */
  shortcutTargetId?: string | null;
}

export interface CarriedShortcutTargets {
  /** Target folders to return beside the tree, in the order first seen. */
  targetIds: string[];
  /** Every node to carry: those folders and their descendants. */
  carriedIds: Set<string>;
}

/**
 * For each shortcut INSIDE the view (`included`) that points at a live folder
 * OUTSIDE it: that folder and its whole subtree. Nodes already in the view are
 * never carried — they are on screen already, and a shortcut to an ancestor of
 * the view root would otherwise re-ship the entire view.
 */
export function outOfScopeShortcutTargets(
  nodes: ReadonlyMap<string, ScopedNodeLite>,
  included: ReadonlySet<string>,
): CarriedShortcutTargets {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes.values()) {
    if (node.parentId === null) continue;
    const list = childrenByParent.get(node.parentId) ?? [];
    list.push(node.id);
    childrenByParent.set(node.parentId, list);
  }

  const targetIds: string[] = [];
  const carriedIds = new Set<string>();
  for (const id of included) {
    const node = nodes.get(id);
    if (!node || node.contentType !== "shortcut") continue;
    const targetId = node.shortcutTargetId;
    if (!targetId || included.has(targetId) || carriedIds.has(targetId)) continue;
    const target = nodes.get(targetId);
    if (!target || target.contentType !== "folder") continue;

    targetIds.push(targetId);
    const queue = [targetId];
    while (queue.length > 0) {
      const next = queue.shift()!;
      if (carriedIds.has(next) || included.has(next)) continue;
      carriedIds.add(next);
      for (const child of childrenByParent.get(next) ?? []) queue.push(child);
    }
  }
  return { targetIds, carriedIds };
}
