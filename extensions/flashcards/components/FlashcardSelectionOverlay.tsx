"use client";

/**
 * FlashcardSelectionOverlay (Epoch 19, Sprint 8)
 *
 * Cursor-following floating hint bar that surfaces while the user is
 * mid-selection in the flashcard-from-text workflow. Subscribes to
 * the flashcard selection store and renders nothing when the phase
 * is "idle".
 *
 * Why cursor-following (vs pinned to editor frame): the user is
 * actively dragging text — putting the hint near the cursor lets them
 * glance without breaking the drag. The trade-off is a mousemove
 * listener on the document, scoped to only the non-idle phases so
 * there's no overhead at rest.
 *
 * Why portal: the overlay needs to escape any scroll/clip parent
 * inside the editor pane. We mount it at document.body via a portal
 * so position: fixed is referenced to the viewport.
 *
 * Why the body-level cursor class: while the user is selecting, the
 * crosshair cursor should persist over chrome (the editor toolbar,
 * sidebars, etc.). Adding `.flashcard-select-cursor` to body lets the
 * CSS rule cascade everywhere; we strip it on cleanup.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getSurfaceStyles } from "@/lib/design/system";
import {
  selectionHintFor,
  useFlashcardSelectionStore,
} from "@/state/flashcard-selection-store";

const OFFSET_X = 14;
const OFFSET_Y = 20;
const OVERLAY_MAX_WIDTH = 280;

interface CursorPos {
  x: number;
  y: number;
}

export function FlashcardSelectionOverlay() {
  const phase = useFlashcardSelectionStore((s) => s.phase);
  const isActive = phase !== "idle";

  // The cursor position writes happen inside a mousemove handler (a
  // browser event callback, not a render effect), so the React
  // Compiler doesn't flag them as "setState in effect" — that rule
  // only fires on synchronous in-effect mutations. Browser event
  // handlers are async by definition.
  const [cursor, setCursor] = useState<CursorPos | null>(null);

  // Stash the last-applied body class flag in a ref so the cleanup
  // can run idempotently even if the cleanup function runs twice
  // (StrictMode dev) or out of order with the activation effect.
  const bodyClassApplied = useRef(false);

  useEffect(() => {
    if (!isActive) {
      // Cleanup-on-idle: the listener from the previous active phase
      // was already torn down by the previous effect's cleanup; we
      // just guarantee the body class is gone.
      if (bodyClassApplied.current) {
        document.body.classList.remove("flashcard-select-cursor");
        bodyClassApplied.current = false;
      }
      return;
    }

    document.body.classList.add("flashcard-select-cursor");
    bodyClassApplied.current = true;

    const handler = (e: MouseEvent) => {
      setCursor({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handler);

    return () => {
      window.removeEventListener("mousemove", handler);
      document.body.classList.remove("flashcard-select-cursor");
      bodyClassApplied.current = false;
    };
  }, [isActive]);

  if (!isActive) return null;
  // Portal target only exists in the browser. "use client" gates
  // hydration but not SSR — this check skips render during SSR.
  if (typeof document === "undefined") return null;

  const hint = selectionHintFor(phase);
  if (!hint) return null;

  // Pre-cursor-move state: render bottom-center as a fallback so the
  // user gets immediate feedback after triggering the workflow.
  const position: { left: number; top: number } = cursor
    ? clampToViewport(
        cursor.x + OFFSET_X,
        cursor.y + OFFSET_Y,
        OVERLAY_MAX_WIDTH,
      )
    : {
        left: Math.max(0, window.innerWidth / 2 - OVERLAY_MAX_WIDTH / 2),
        top: window.innerHeight - 80,
      };

  const surface = getSurfaceStyles("glass-2");

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: position.left,
        top: position.top,
        zIndex: 9999,
        maxWidth: OVERLAY_MAX_WIDTH,
        padding: "8px 12px",
        borderRadius: 8,
        background: surface.background,
        backdropFilter: surface.backdropFilter,
        WebkitBackdropFilter: surface.backdropFilter,
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
        color: "var(--foreground)",
        fontSize: 13,
        lineHeight: 1.4,
        pointerEvents: "none",
        userSelect: "none",
        cursor: "crosshair",
      }}
    >
      {hint}
    </div>,
    document.body,
  );
}

function clampToViewport(
  left: number,
  top: number,
  width: number,
): { left: number; top: number } {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const heightEstimate = 36; // single-line overlay
  return {
    left: Math.min(Math.max(0, left), viewportW - width),
    top: Math.min(Math.max(0, top), viewportH - heightEstimate - 4),
  };
}
