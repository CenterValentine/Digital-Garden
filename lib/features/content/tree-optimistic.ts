/**
 * Optimistic file-tree rows for creates that happen OUTSIDE the tree (the
 * reader's Library, the "+ → Reader → Books" shelf, …).
 *
 * The tree's own creates insert a `temp-…` row immediately and swap in the
 * real id when the server answers. Outside surfaces used to fire
 * `dg:tree-refresh` instead, which refetches the whole tree behind the
 * skeleton — the row appeared late and the tree flashed. These events give
 * them the same path: insert a placeholder now, resolve it to the real row
 * (followed by a quiet refetch that never shows the skeleton), or drop it on
 * failure.
 *
 * Parent ids are SERVER space (`resolveServerCreateParent`): null or the
 * view root means "top of the current tree"; an id outside the visible tree
 * inserts nothing (the quiet refetch still reconciles).
 */

import type { ContentType } from "@/lib/domain/content/types";

export const TREE_OPTIMISTIC_EVENT = "dg:tree-optimistic";
/** Quiet refetch (no skeleton) for writes that need no placeholder row. */
export const TREE_SYNC_EVENT = "dg:tree-sync";

export function syncTreeQuietly(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TREE_SYNC_EVENT));
}

export interface OptimisticTreeRow {
  title: string;
  contentType: ContentType;
  parentId: string | null;
  /** File rows: drives the row icon while pending. */
  mimeType?: string;
  /** Shortcut rows: the target, so the row shows its icon while pending. */
  shortcutTarget?: { id: string; contentType: string; title: string };
  /**
   * Where the create puts it, when the caller knows: the top of its parent,
   * or right after a sibling. Without it the row is shown where the server
   * sorts a default (displayOrder 0) row.
   */
  place?: "top" | { afterId: string };
}

export type TreeOptimisticDetail =
  | { action: "insert"; tempId: string; row: OptimisticTreeRow }
  /** Swap the placeholder for the real id; `null` realId = nothing was created (drop it). */
  | { action: "resolve"; tempId: string; realId: string | null }
  | { action: "remove"; tempId: string };

function dispatch(detail: TreeOptimisticDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<TreeOptimisticDetail>(TREE_OPTIMISTIC_EVENT, { detail }));
}

/** Insert a pending row; returns its temp id for `resolve` / `remove`. */
export function insertOptimisticTreeRow(row: OptimisticTreeRow): string {
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  dispatch({ action: "insert", tempId, row });
  return tempId;
}

export function resolveOptimisticTreeRow(tempId: string, realId: string | null): void {
  dispatch({ action: "resolve", tempId, realId });
}

export function removeOptimisticTreeRow(tempId: string): void {
  dispatch({ action: "remove", tempId });
}

/**
 * Run a create with an optimistic row: inserted now, resolved to the id
 * `realIdOf` picks from the result (null = nothing new, e.g. a duplicate),
 * removed if the create throws.
 */
export async function withOptimisticTreeRow<T>(
  row: OptimisticTreeRow,
  create: () => Promise<T>,
  realIdOf: (result: T) => string | null
): Promise<T> {
  const tempId = insertOptimisticTreeRow(row);
  try {
    const result = await create();
    resolveOptimisticTreeRow(tempId, realIdOf(result));
    return result;
  } catch (error) {
    removeOptimisticTreeRow(tempId);
    throw error;
  }
}
