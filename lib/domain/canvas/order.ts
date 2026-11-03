/**
 * Canvas archive — keeping the user's own notes where they put them (§8).
 *
 * Inside a folder the import owns, the user may drop notes between imported
 * items. Re-import must put Canvas's items back in Canvas order without
 * scattering those notes. The anchor is worked out from the CURRENT order
 * each time, never stored: each node that isn't an imported item belongs to
 * the nearest imported item above it (or to the top of the folder), and moves
 * with it. The tree is the only record of where things sit, so a drag is all
 * the input the rule needs.
 *
 * Pure. Pinned by `pnpm canvas:check`.
 */

/**
 * @param current  The folder's children, ids in their current display order.
 * @param canvasOrder  The imported children this re-import places, ids in Canvas
 *   order. Nodes not listed here (the user's notes, a sibling copy, an item
 *   Canvas removed) are treated as attached to the anchor above them. Ids
 *   listed here but not in `current` are new and arrive with nothing attached.
 * @returns Every id from both lists exactly once, in the new order.
 */
export function mergeOrder(current: string[], canvasOrder: string[]): string[] {
  const anchors = new Set(canvasOrder);
  const TOP = "\u0000top";
  const attached = new Map<string, string[]>();
  let anchor = TOP;
  for (const id of current) {
    if (anchors.has(id)) {
      anchor = id;
      continue;
    }
    const list = attached.get(anchor) ?? [];
    list.push(id);
    attached.set(anchor, list);
  }
  const result: string[] = [...(attached.get(TOP) ?? [])];
  for (const id of canvasOrder) {
    result.push(id, ...(attached.get(id) ?? []));
  }
  return result;
}
