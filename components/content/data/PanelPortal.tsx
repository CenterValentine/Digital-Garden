"use client";

/**
 * Shared portaled panel for the database surfaces — column menus, the view
 * bar's menus, and anything else that pops out of a clipped container.
 *
 * Portaled to <body> at z-[120] and positioned with `calculateMenuPosition`,
 * the repo's canonical menu pattern (CLAUDE.md "Menu Positioning"). Extracted
 * from DataColumnMenu when the view bar became its second consumer — one
 * clipping fix, not one per popover.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/core/utils";
import {
  calculateMenuPosition,
  type CalculatedPosition,
} from "@/lib/core/menu-positioning";

/** Gap between anchor and panel, and the panel's minimum viewport margin. */
const GAP = 4;
const EDGE = 8;

/** Panel chrome shared by every consumer, so the popovers read as one family. */
export const panelClass = cn(
  "fixed z-[120] w-64 rounded-lg border border-border bg-popover p-3 shadow-lg"
);

/**
 * Anchors a portaled panel to the parent element of an invisible marker.
 *
 * Two-phase per the menu-positioning contract: the panel first renders
 * invisible at the viewport origin so it can be measured, then the measured
 * size goes through `calculateMenuPosition` for flip/shift at viewport
 * edges. Repositions on scroll (capture, so inner scrollers count) and
 * resize rather than closing.
 */
function usePanelPlacement(open: boolean) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CalculatedPosition | null>(null);

  const reposition = useCallback(() => {
    const anchor = markerRef.current?.parentElement;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const a = anchor.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    // Horizontal flip/shift from the shared helper; vertical is decided here
    // against the anchor's BOX. The helper flips a point — its "above" ends
    // at the trigger y, which for us is the anchor's bottom edge, so a
    // flipped panel sat ON the column header it was editing (owner,
    // 2026-10-09). A panel never covers its anchor: below if it fits, else
    // above the anchor's top, else on the roomier side, scrolling.
    const { x } = calculateMenuPosition({
      triggerPosition: { x: a.left, y: a.bottom + GAP },
      menuDimensions: { width: p.width, height: p.height },
    });
    const vh = window.innerHeight;
    const below = vh - (a.bottom + GAP) - EDGE;
    const above = a.top - GAP - EDGE;
    // `scrollHeight`, not the rect: once capped the rect is the cap.
    const want = panel.scrollHeight || p.height;
    let y: number;
    let maxHeight: number;
    if (want <= below || below >= above) {
      y = a.bottom + GAP;
      maxHeight = below;
    } else {
      maxHeight = above;
      y = a.top - GAP - Math.min(want, above);
    }
    setPos({ x, y, maxHeight: Math.max(120, maxHeight) });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- audited: two-phase menu measurement, same pattern as ContextMenu
      setPos(null);
      return;
    }
    // Measuring the just-rendered panel requires a post-render setState —
    // the sanctioned exception used by every calculateMenuPosition consumer.
    reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", reposition);
    document.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  return { markerRef, panelRef, pos };
}

/**
 * Outside-click + Escape dismissal, portal-aware.
 *
 * The anchor element is exempted from "outside": its own click handler
 * toggles the panel, and dismissing on mousedown first would
 * close-then-reopen — a menu that cannot be toggled shut.
 */
function useDismiss(
  open: boolean,
  panelRef: React.RefObject<HTMLDivElement | null>,
  markerRef: React.RefObject<HTMLSpanElement | null>,
  onDismiss: () => void
) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (markerRef.current?.parentElement?.contains(target)) return;
      onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, panelRef, markerRef, onDismiss]);
}

export interface PanelPortalProps {
  open: boolean;
  onDismiss: () => void;
  /** Merged over the base chrome via cn/twMerge — e.g. `w-[22rem]` widens. */
  className?: string;
  children: React.ReactNode;
}

export function PanelPortal({ open, onDismiss, className, children }: PanelPortalProps) {
  const { markerRef, panelRef, pos } = usePanelPlacement(open);
  useDismiss(open, panelRef, markerRef, onDismiss);

  return (
    <>
      <span ref={markerRef} className="hidden" aria-hidden="true" />
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            className={cn(panelClass, className)}
            style={
              pos
                ? {
                    left: pos.x,
                    top: pos.y,
                    maxHeight: pos.maxHeight,
                    overflowY: "auto",
                  }
                : // Measurement frame: mounted but invisible, so the real
                  // position is computed from true dimensions.
                  { left: 0, top: 0, visibility: "hidden" }
            }
            // React portals propagate synthetic events through the COMPONENT
            // tree, so without this a click inside the panel bubbles to the
            // anchor's onClick and toggles the panel shut mid-edit.
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            // Same for the anchor's double-click / press-and-hold gestures
            // (column header): a long press on Save must not re-open, and
            // swallow the click of, the panel it is in.
            onDoubleClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
