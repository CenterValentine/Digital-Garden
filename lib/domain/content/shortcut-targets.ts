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
  /**
   * The roots of the carried forests, in the order first seen: carried
   * folders whose parent is not carried. A target that sits inside another
   * carried subtree travels inside it instead, so no node ships twice.
   */
  targetIds: string[];
  /** Every node to carry: those folders and their descendants. */
  carriedIds: Set<string>;
}

/**
 * For each shortcut INSIDE the view (`included`) that points at a live folder
 * OUTSIDE it: that folder and its whole subtree. Nodes already in the view are
 * never carried — they are on screen already, and a shortcut to an ancestor of
 * the view root would otherwise re-ship the entire view.
 *
 * Transitive: a shortcut inside a carried folder is followed too, the same
 * way `viewReachRoots` follows a chain. Owner report (2026-10-08): a shortcut
 * nested in a shortcut showed nothing in a workbench, because only shortcuts
 * IN the view were looked at — the inner one's target was neither in the view
 * nor carried, so its mirror had nothing to show. A cycle stops at the first
 * repeat: a target already in the view or already carried adds nothing.
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
  // Shortcuts to look at: those in the view, then each one carried along.
  const pending = [...included];
  for (let i = 0; i < pending.length; i++) {
    const node = nodes.get(pending[i]);
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
      pending.push(next);
      for (const child of childrenByParent.get(next) ?? []) queue.push(child);
    }
  }
  // A target carried first can turn out to sit inside one carried later (a
  // shortcut to B, then one inside B to B's parent A). It then travels inside
  // A's subtree; shipping it as a root too would put one node in two places.
  const roots = targetIds.filter((id) => {
    const parentId = nodes.get(id)?.parentId ?? null;
    return parentId === null || !carriedIds.has(parentId);
  });
  return { targetIds: roots, carriedIds };
}
