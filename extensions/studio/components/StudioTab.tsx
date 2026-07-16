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

import { useCallback, useMemo, useState } from "react";
import { useContentStore } from "@/state/content-store";
import { useRightSidebarStateStore } from "@/state/right-sidebar-state-store";
import { getStudioToolsGroupedByShelf } from "../registry";
import type { StudioShelf } from "../types";
import { StudioToolTile } from "./StudioToolTile";
import { SourcePicker } from "./SourcePicker";

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
  const setActiveTab = useRightSidebarStateStore((s) => s.setActiveTab);
  const [openToolId, setOpenToolId] = useState<string | null>(null);
  const [invokingToolId, setInvokingToolId] = useState<string | null>(null);
  const [invokeError, setInvokeError] = useState<string | null>(null);

  // The registry is module-stable; grouping is cheap but keep render pure.
  const shelves = useMemo(() => getStudioToolsGroupedByShelf(), []);

  // Tool invocation (Phase 4): compose the prompt server-side, stash it for
  // the conversation engine (sessionStorage survives the tab-mount race),
  // then jump to the chat tab where the engine sends it.
  const handleInvoke = useCallback(
    (toolId: string, variantId?: string) => {
      if (!selectedContentId) return;
      const folderId = selectedContentId;
      setInvokingToolId(toolId);
      setInvokeError(null);
      fetch("/api/studio/tools/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId, variantId, folderId }),
      })
        .then(async (res) => {
          const body = await res.json();
          if (!res.ok || !body.success) {
            throw new Error(body.error ?? "Could not start the tool");
          }
          window.sessionStorage.setItem(
            `dg:studio-invoke:${folderId}`,
            body.data.prompt
          );
          setActiveTab(folderId, "chat");
        })
        .catch((err: unknown) => {
          setInvokeError(
            err instanceof Error ? err.message : "Could not start the tool"
          );
        })
        .finally(() => setInvokingToolId(null));
    },
    [selectedContentId, setActiveTab]
  );

  return (
    <div className="scrollbar-hide h-full overflow-y-auto px-3 py-3">
      {/* ── Source picker — selection that grounds folder chat + tools ── */}
      {selectedContentId && <SourcePicker folderId={selectedContentId} />}

      {invokeError && (
        <p className="mt-2 px-1 text-xs text-red-500/90">{invokeError}</p>
      )}

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
                  onInvoke={handleInvoke}
                  invokingToolId={invokingToolId}
                />
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );
}
