"use client";

/**
 * Four-corner overlay placement chooser (BROWSER-REACH, side panel only).
 *
 * In the app, dragging a tab shows pane-placement previews. That's meaningless
 * in the side panel, which is single-pane by necessity — but the drag gesture
 * is still the natural way to say "put this over there."
 *
 * A drag cannot cross from the panel document into the web page (separate
 * top-level documents), so instead of dragging *onto* the page, the panel
 * shows a miniature of it: four quadrants standing in for the page's corners.
 * Dropping on one opens that content as an overlay in the matching corner.
 * The affordance only exists mid-drag, so it costs no permanent chrome.
 */

import { useState } from "react";
import { useContentStore } from "@/state/content-store";
import {
  requestOverlayOpen,
  OVERLAY_CORNERS,
  type OverlayCorner,
} from "@/lib/domain/browser-extension/panel-bridge";

const CORNER_LABELS: Record<OverlayCorner, string> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
};

export function PanelOverlayCornerTargets({
  draggedTabId,
  onDrop,
}: {
  draggedTabId: string | null;
  onDrop: () => void;
}) {
  const [hovered, setHovered] = useState<OverlayCorner | null>(null);
  const contentId = useContentStore((state) =>
    draggedTabId ? (state.tabs[draggedTabId]?.contentId ?? null) : null
  );

  if (!draggedTabId || !contentId) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 p-2">
      <div className="pointer-events-none absolute inset-x-0 top-1 text-center text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Drop to place on page
      </div>
      <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-2 pt-5">
        {OVERLAY_CORNERS.map((corner) => {
          const isHovered = hovered === corner;
          return (
            <div
              key={corner}
              // Each quadrant is a live drop target; the grid mirrors the page.
              className={`pointer-events-auto flex items-center justify-center rounded-lg border-2 border-dashed text-[11px] transition-colors ${
                isHovered
                  ? "border-gold-primary bg-gold-primary/15 text-gold-primary"
                  : "border-black/15 bg-white/70 text-gray-500 dark:border-white/20 dark:bg-black/40 dark:text-gray-400"
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (hovered !== corner) setHovered(corner);
              }}
              onDragLeave={() => {
                if (hovered === corner) setHovered(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setHovered(null);
                requestOverlayOpen(contentId, { corner });
                onDrop();
              }}
            >
              {CORNER_LABELS[corner]}
            </div>
          );
        })}
      </div>
    </div>
  );
}
