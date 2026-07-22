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
 *
 * Two drag sources feed it:
 *  - main-panel TABS (native HTML5 drag) — the `draggedTabId` prop;
 *  - file-tree NODES (react-arborist / react-dnd, type "NODE") — the shared
 *    `useTreeDragStore`. The node id IS the content id used for overlays.
 */

import { useState } from "react";
import { useDrop } from "react-dnd";
import { useContentStore } from "@/state/content-store";
import { useTreeDragStore } from "@/state/tree-drag-store";
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

// react-arborist's drag type — must match FileTree/FileNode's react-dnd source
// (same constant the chat composer's drop target uses).
const NODE_DRAG_TYPE = "NODE";

function CornerQuadrant({
  corner,
  tabContentId,
  onPlaced,
}: {
  corner: OverlayCorner;
  tabContentId: string | null;
  onPlaced: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  // File-tree NODE drops (react-dnd). The dragged node's id is the content id.
  const [{ isOver }, dropRef] = useDrop(
    () => ({
      accept: NODE_DRAG_TYPE,
      drop: () => {
        const nodeId = useTreeDragStore.getState().draggingNode?.id ?? null;
        if (nodeId) requestOverlayOpen(nodeId, { corner });
        useTreeDragStore.getState().setDraggingNode(null);
        onPlaced();
      },
      collect: (monitor) => ({ isOver: monitor.isOver() }),
    }),
    [corner, onPlaced]
  );

  const active = hovered || isOver;

  return (
    <div
      ref={dropRef as unknown as React.Ref<HTMLDivElement>}
      // Each quadrant is a live drop target; the grid mirrors the page.
      className={`pointer-events-auto flex items-center justify-center rounded-lg border-2 border-dashed text-[11px] transition-colors ${
        active
          ? "border-gold-primary bg-gold-primary/15 text-gold-primary"
          : "border-black/15 bg-white/70 text-gray-500 dark:border-white/20 dark:bg-black/40 dark:text-gray-400"
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (!hovered) setHovered(true);
      }}
      onDragLeave={() => setHovered(false)}
      onDrop={(event) => {
        // Native path = a main-panel TAB drag. File-tree NODE drops are handled
        // by the react-dnd `drop` above, so bail here to avoid double-firing.
        if (useTreeDragStore.getState().draggingNode) return;
        event.preventDefault();
        event.stopPropagation();
        setHovered(false);
        if (tabContentId) requestOverlayOpen(tabContentId, { corner });
        onPlaced();
      }}
    >
      {CORNER_LABELS[corner]}
    </div>
  );
}

export function PanelOverlayCornerTargets({
  draggedTabId,
  onDrop,
}: {
  draggedTabId: string | null;
  onDrop: () => void;
}) {
  const tabContentId = useContentStore((state) =>
    draggedTabId ? (state.tabs[draggedTabId]?.contentId ?? null) : null
  );
  const nodeDragging = useTreeDragStore((s) => s.draggingNode !== null);

  // Appear during a TAB drag (with a resolvable content id) OR a file-tree drag.
  if (!tabContentId && !nodeDragging) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 p-2">
      <div className="pointer-events-none absolute inset-x-0 top-1 text-center text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Drop to place on page
      </div>
      <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-2 pt-5">
        {OVERLAY_CORNERS.map((corner) => (
          <CornerQuadrant
            key={corner}
            corner={corner}
            tabContentId={tabContentId}
            onPlaced={onDrop}
          />
        ))}
      </div>
    </div>
  );
}
