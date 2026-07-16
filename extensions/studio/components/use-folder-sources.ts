/**
 * Folder source stats for the Studio tab's source chip.
 *
 * Phase 1: real counts and byte sizes straight from the content tree — no
 * mocked numbers. Token estimates and NO TEXT flags arrive with the resolver
 * wiring in Phase 3; bytes are the honest signal available today (tree file
 * payloads carry `fileSize`; notes carry no size in the tree response).
 */

"use client";

import { useEffect, useState } from "react";

interface TreeNode {
  id: string;
  title: string;
  contentType: string;
  deletedAt?: string | null;
  children?: TreeNode[];
  file?: { fileSize?: string | number };
}

export interface FolderSourceStats {
  /** Non-folder descendants at any depth. */
  sourceCount: number;
  /** Direct + nested subfolders. */
  folderCount: number;
  /** Sum of known file byte sizes (notes/code/external contribute 0 here). */
  totalBytes: number;
  /** Count per contentType, for the expanded breakdown. */
  byType: Record<string, number>;
}

const EMPTY_STATS: FolderSourceStats = {
  sourceCount: 0,
  folderCount: 0,
  totalBytes: 0,
  byType: {},
};

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children?.length) {
      const hit = findNode(node.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

function aggregate(folder: TreeNode): FolderSourceStats {
  const stats: FolderSourceStats = {
    sourceCount: 0,
    folderCount: 0,
    totalBytes: 0,
    byType: {},
  };
  const queue: TreeNode[] = [...(folder.children ?? [])];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || node.deletedAt) continue;
    if (node.contentType === "folder") {
      stats.folderCount += 1;
    } else {
      stats.sourceCount += 1;
      stats.byType[node.contentType] = (stats.byType[node.contentType] ?? 0) + 1;
      const rawSize = node.file?.fileSize;
      const bytes = typeof rawSize === "string" ? Number(rawSize) : rawSize ?? 0;
      if (Number.isFinite(bytes)) stats.totalBytes += bytes;
    }
    if (node.children?.length) queue.push(...node.children);
  }
  return stats;
}

/** Human-readable byte size, e.g. "1.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

interface FolderSourcesResult {
  forFolderId: string;
  stats: FolderSourceStats;
  error: string | null;
}

export function useFolderSources(folderId: string | null): {
  stats: FolderSourceStats;
  loading: boolean;
  error: string | null;
} {
  // Single result object keyed by the folder it was fetched for. Loading and
  // error states are DERIVED from it (result missing/stale = loading), so the
  // effect never calls setState synchronously — only from fetch callbacks.
  const [result, setResult] = useState<FolderSourcesResult | null>(null);

  useEffect(() => {
    if (!folderId) return;
    const controller = new AbortController();
    fetch("/api/content/content/tree", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Tree request failed (${res.status})`);
        return res.json();
      })
      .then((payload) => {
        const tree: TreeNode[] = payload.data?.tree ?? payload.tree ?? payload;
        const folder = Array.isArray(tree) ? findNode(tree, folderId) : null;
        setResult({
          forFolderId: folderId,
          stats: folder ? aggregate(folder) : EMPTY_STATS,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          forFolderId: folderId,
          stats: EMPTY_STATS,
          error: err instanceof Error ? err.message : "Failed to load sources",
        });
      });
    return () => controller.abort();
  }, [folderId]);

  const current =
    folderId && result?.forFolderId === folderId ? result : null;

  return {
    stats: current?.stats ?? EMPTY_STATS,
    loading: Boolean(folderId) && current === null,
    error: current?.error ?? null,
  };
}
