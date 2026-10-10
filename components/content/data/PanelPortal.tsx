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
 * toggles the panel, and dismissing on press first would close-then-reopen
 * — a menu that cannot be toggled shut.
 *
 * POINTERDOWN in the CAPTURE phase (owner report 2026-10-09: long-text
 * editors stacked up instead of closing). `mousedown` is not a reliable
 * "click-away" signal: a browser skips it entirely when anything cancels
 * the pointerdown (drag/resize/pane libraries do), and a bubbling listener
 * misses presses whose propagation was stopped. And a press inside an
 * IFRAME (another pane's embed) never reaches this document at all — focus
 * moving into one is caught on window blur instead.
 *
 * The listener is registered ONCE per open, with `onDismiss` read through a
 * ref. Callers pass inline callbacks, and re-subscribing on every render
 * dropped clicks: a press that makes some earlier listener set state (the
 * pane focusing itself) re-renders React synchronously mid-dispatch, the
 * effect swaps this listener out, and per the DOM spec neither the removed
 * nor the re-added one runs for that event. That is how long-text editors
 * stacked up instead of closing (owner report 2026-10-09).
 */
function useDismiss(
  open: boolean,
  panelRef: React.RefObject<HTMLDivElement | null>,
  markerRef: React.RefObject<HTMLSpanElement | null>,
  onDismiss: () => void
) {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => onDismissRef.current();
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (markerRef.current?.parentElement?.contains(target)) return;
      dismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    const onBlur = () => {
      // Alt-tab also blurs the window — only a move INTO an iframe counts.
      window.setTimeout(() => {
        if (document.activeElement?.tagName === "IFRAME") dismiss();
      }, 0);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [open, panelRef, markerRef]);
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
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  /**
   * Focus leaving the panel for another FIELD or CONTROL (Tab, a keyboard
   * shortcut, script focus) is a click-away too. A focus move to <body> is
   * a plain press elsewhere, which the press listener already handles, and
   * a window blur (alt-tab) is not leaving — `document.hasFocus()` guards it.
   */
  const handleBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && (panelRef.current?.contains(next) || markerRef.current?.parentElement?.contains(next))) {
      return;
    }
    window.setTimeout(() => {
      if (!document.hasFocus()) return;
      const active = document.activeElement;
      if (!active || active === document.body) return;
      if (panelRef.current?.contains(active)) return;
      if (markerRef.current?.parentElement?.contains(active)) return;
      onDismissRef.current();
    }, 0);
  };

  return (
    <>
      <span ref={markerRef} className="hidden" aria-hidden="true" />
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            // Marks "inside a database box" for grid-level click tracking
            // (one-click editing stays armed while you work in an editor).
            data-db-panel=""
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
                  // position is computed from true dimensions. OPACITY, not
                  // `visibility: hidden` — a hidden element cannot take focus,
                  // so every `autoFocus` field in a panel (the long-text
                  // editor's textarea, the add-column name) opened unfocused
                  // and the user's keys drove the grid behind it instead.
                  { left: 0, top: 0, opacity: 0, pointerEvents: "none" }
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
            onBlur={handleBlur}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
