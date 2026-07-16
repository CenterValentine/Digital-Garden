/**
 * Studio sidebar tab — the Option B mount (plan → Phase 1).
 *
 * Everything below the source chip renders from the tool registry via
 * `getStudioToolsGroupedByShelf()`: no hardcoded tiles, so a new tool — or a
 * whole shelf — appears here without touching this file. The source chip shows
 * REAL counts/sizes from the content tree (no mocked numbers); token budgets
 * and the tri-state picker replace it in Phase 3.
 *
 * Width-fluid by design: the same markup serves the desktop rail (~250px) and
 * the mobile bottom-sheet presentation. All interactive rows are ≥44px tall.
 */

"use client";

import { useMemo, useState } from "react";
import { ChevronRight, FolderOpen } from "lucide-react";
import { useContentStore } from "@/state/content-store";
import { getStudioToolsGroupedByShelf } from "../registry";
import type { StudioShelf } from "../types";
import { StudioToolTile } from "./StudioToolTile";
import { formatBytes, useFolderSources } from "./use-folder-sources";

const SHELF_LABELS: Record<StudioShelf, string> = {
  create: "Create",
  practice: "Practice",
  analyze: "Analyze",
};

const SHELF_HINTS: Record<StudioShelf, string> = {
  create: "Files that land in this folder",
  practice: "Graded sessions — nothing is saved",
  analyze: "Insight built on folder context",
};

export function StudioTab() {
  const selectedContentId = useContentStore((s) => s.selectedContentId);
  const { stats, loading, error } = useFolderSources(selectedContentId);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [openToolId, setOpenToolId] = useState<string | null>(null);

  // The registry is module-stable; grouping is cheap but keep render pure.
  const shelves = useMemo(() => getStudioToolsGroupedByShelf(), []);

  const typeBreakdown = Object.entries(stats.byType).sort((a, b) => b[1] - a[1]);

  return (
    <div className="scrollbar-hide h-full overflow-y-auto px-3 py-3">
      {/* ── Source chip — collapsed summary of what would ground the chat ── */}
      <div className="rounded-lg border border-black/10 dark:border-white/10">
        <button
          type="button"
          onClick={() => setSourcesOpen((v) => !v)}
          aria-expanded={sourcesOpen}
          className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left"
        >
          <FolderOpen className="h-4 w-4 shrink-0 text-gold-primary/80" />
          <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-200">
            {loading
              ? "Counting sources…"
              : error
                ? "Sources unavailable"
                : `${stats.sourceCount} source${stats.sourceCount === 1 ? "" : "s"}`}
          </span>
          {!loading && !error && stats.totalBytes > 0 && (
            <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
              {formatBytes(stats.totalBytes)}
            </span>
          )}
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${
              sourcesOpen ? "rotate-90" : ""
            }`}
          />
        </button>

        {sourcesOpen && (
          <div className="border-t border-black/[0.06] px-3 py-2.5 dark:border-white/[0.08]">
            {error ? (
              <p className="text-xs text-red-500/80">{error}</p>
            ) : stats.sourceCount === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                This folder has no content yet — studio tools need at least one
                source.
              </p>
            ) : (
              <ul className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                {typeBreakdown.map(([type, count]) => (
                  <li key={type} className="flex justify-between">
                    <span className="capitalize">{type}</span>
                    <span>{count}</span>
                  </li>
                ))}
                {stats.folderCount > 0 && (
                  <li className="flex justify-between text-gray-400 dark:text-gray-500">
                    <span>Subfolders</span>
                    <span>{stats.folderCount}</span>
                  </li>
                )}
              </ul>
            )}
            <button
              type="button"
              disabled
              title="The source picker arrives with folder chat (Phase 3)"
              className="mt-2 flex min-h-[44px] w-full cursor-default items-center justify-center rounded-md border border-dashed border-black/15 text-xs text-gray-400 dark:border-white/15 dark:text-gray-500"
            >
              Select sources — coming with folder chat
            </button>
          </div>
        )}
      </div>

      {/* ── Shelves — rendered purely from the registry ── */}
      {shelves.map(({ shelf, tools }) =>
        tools.length === 0 ? null : (
          <section key={shelf} className="mt-4">
            <h3 className="px-1 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {SHELF_LABELS[shelf]}
            </h3>
            <p className="mb-2 px-1 text-[11px] text-gray-400/80 dark:text-gray-500/80">
              {SHELF_HINTS[shelf]}
            </p>
            <div className="flex flex-col gap-1.5">
              {tools.map((tool) => (
                <StudioToolTile
                  key={tool.id}
                  tool={tool}
                  open={openToolId === tool.id}
                  onToggle={() =>
                    setOpenToolId((current) =>
                      current === tool.id ? null : tool.id
                    )
                  }
                />
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );
}
