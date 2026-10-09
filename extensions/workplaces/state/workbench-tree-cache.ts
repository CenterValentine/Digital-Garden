"use client";

import type { TreeNode } from "@/lib/domain/content/types";

/**
 * The folder trees behind the workspace selector's workbench panels, kept
 * warm so a panel opens with its folders already there.
 *
 * Each panel lists a view workspace's folders from ONE view-scoped tree fetch
 * (`/api/content/content/tree?viewRootContentId=…`). That route assembles the
 * user's whole tree before scoping it, so it is the slowest call in the app —
 * fast locally, seconds in production — and the panel used to make it fresh
 * on EVERY hover, showing "loading" until it landed. Owner (2026-10-08):
 * "the experience and accessibility of workbenches should be and feel
 * instant, that info shouldn't be lazy."
 *
 * So: fetched ahead of time (idle after startup, again when the menu opens),
 * served from here at once, refreshed in the background when older than
 * `FRESH_FOR_MS`. A refresh never blanks what is on screen.
 */

const FRESH_FOR_MS = 30_000;

interface Entry {
  tree: TreeNode[];
  fetchedAt: number;
}

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<TreeNode[]>>();

/** The last tree fetched for this view root, however old — or null. */
export function cachedWorkbenchTree(viewRootId: string): TreeNode[] | null {
  return cache.get(viewRootId)?.tree ?? null;
}

/**
 * The tree for this view root: from the cache when fresh, else fetched (one
 * request per root at a time). Rejects only when there is nothing cached to
 * fall back to.
 */
export function loadWorkbenchTree(viewRootId: string): Promise<TreeNode[]> {
  const entry = cache.get(viewRootId);
  if (entry && Date.now() - entry.fetchedAt < FRESH_FOR_MS) {
    return Promise.resolve(entry.tree);
  }
  const pending = inFlight.get(viewRootId);
  if (pending) return pending;

  const request = fetch(
    `/api/content/content/tree?viewRootContentId=${encodeURIComponent(viewRootId)}`,
    { credentials: "include" },
  )
    .then(async (response) => {
      const result = (await response.json()) as {
        success: boolean;
        data?: { tree: TreeNode[] };
        error?: { message: string };
      };
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error?.message ?? "Failed to load folders");
      }
      cache.set(viewRootId, { tree: result.data.tree, fetchedAt: Date.now() });
      return result.data.tree;
    })
    .catch((error: unknown) => {
      const stale = cache.get(viewRootId);
      if (stale) return stale.tree;
      throw error;
    })
    .finally(() => {
      inFlight.delete(viewRootId);
    });
  inFlight.set(viewRootId, request);
  return request;
}

/** Warm several roots, one after another so startup never fans out. */
export async function prefetchWorkbenchTrees(viewRootIds: readonly string[]): Promise<void> {
  for (const id of viewRootIds) {
    try {
      await loadWorkbenchTree(id);
    } catch {
      // Advisory: the panel fetches on open if this missed.
    }
  }
}
