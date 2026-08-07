"use client";

import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { PanelRight } from "lucide-react";

interface MovableCollapseHandleProps {
  /** Which viewport edge the handle docks to (the sidebar's collapse direction). */
  edge: "right" | "bottom";
  /** Expand the sidebar. Fired on a click that wasn't a drag. */
  onExpand: () => void;
  /** localStorage key for the persisted position (a 0..1 fraction along the edge). */
  positionKey: string;
  title?: string;
}

// Keep the handle away from the extreme corners so it never sits fully off-screen.
const MIN_FRAC = 0.04;
const MAX_FRAC = 0.92;
const DEFAULT_FRAC = 0.12;
const DRAG_THRESHOLD_PX = 3;

/**
 * The collapsed-sidebar re-open handle (the rounded edge tab from the main app),
 * made MOVABLE within range and persisted — so it can be dragged clear of tabs /
 * the × instead of sitting at a fixed spot. Shared by the app's right sidebar
 * (edge="right", drags vertically) and the panel embed's bottom strip
 * (edge="bottom", drags horizontally). A click expands; a drag repositions.
 */
export function MovableCollapseHandle({
  edge,
  onExpand,
  positionKey,
  title = "Expand sidebar (Cmd+.)",
}: MovableCollapseHandleProps) {
  const [frac, setFrac] = useState(DEFAULT_FRAC);
  const fracRef = useRef(DEFAULT_FRAC);
  const draggedRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(positionKey);
      const f = raw ? Number.parseFloat(raw) : Number.NaN;
      if (!Number.isNaN(f)) {
        const clamped = Math.min(MAX_FRAC, Math.max(MIN_FRAC, f));
        fracRef.current = clamped;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage hydration of the persisted position
        setFrac(clamped);
      }
    } catch {
      // Storage unavailable — keep the default.
    }
  }, [positionKey]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      draggedRef.current = false;
      const start = edge === "right" ? e.clientY : e.clientX;
      const onMove = (ev: PointerEvent) => {
        const cur = edge === "right" ? ev.clientY : ev.clientX;
        if (Math.abs(cur - start) > DRAG_THRESHOLD_PX) draggedRef.current = true;
        const extent = edge === "right" ? window.innerHeight : window.innerWidth;
        if (extent === 0) return;
        const next = Math.min(MAX_FRAC, Math.max(MIN_FRAC, cur / extent));
        fracRef.current = next;
        setFrac(next);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          localStorage.setItem(positionKey, String(fracRef.current));
        } catch {
          // Non-fatal.
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [edge, positionKey],
  );

  // A click that moved is a reposition, not an expand.
  const onClick = useCallback(() => {
    if (!draggedRef.current) onExpand();
  }, [onExpand]);

  const positionStyle =
    edge === "right"
      ? { right: 0, top: `${frac * 100}%`, transform: "translateY(-50%)" }
      : { bottom: 0, left: `${frac * 100}%`, transform: "translateX(-50%)" };

  const shapeClass =
    edge === "right"
      ? "h-12 w-8 rounded-l-lg border-l border-t border-b"
      : "w-12 h-8 rounded-t-lg border-t border-l border-r";

  const dragCursor = edge === "right" ? "cursor-ns-resize" : "cursor-ew-resize";

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onExpand();
      }}
      title={title}
      aria-label="Expand sidebar"
      style={{ position: "fixed", zIndex: 50, touchAction: "none", ...positionStyle }}
      className={`group flex items-center justify-center border-white/10 bg-gray-900/90 backdrop-blur-sm transition-colors hover:border-gold-primary/50 hover:bg-gray-800/90 ${shapeClass} ${dragCursor}`}
    >
      <PanelRight className="pointer-events-none h-4 w-4 text-gray-400 group-hover:text-gold-primary" />
    </div>
  );
}
