"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * useLongPress
 *
 * Touch equivalent of right-click. Touch devices have no `contextmenu` event we
 * can rely on (iOS long-press raises the native callout instead), so the file
 * tree's 33 context-menu actions — Rename, Move, Delete, Change Icon … — are
 * otherwise unreachable on a phone.
 *
 * Fires `onLongPress(x, y)` after `delayMs` of a stationary touch. Cancels on:
 *   • movement beyond `moveTolerancePx` (so list scrolling never triggers it)
 *   • pointer up / cancel before the timer fires
 *   • any non-touch pointer (mouse keeps using real `contextmenu`)
 *
 * Returns props to spread on the target element. Pair with
 * `touch-callout-none` (app/globals.css) on the same element, or iOS will draw
 * its own callout on top of the menu.
 *
 * Usage:
 *   const longPress = useLongPress((x, y) => openMenuAt(x, y));
 *   return <div {...longPress}>…</div>;
 */
export function useLongPress(
  onLongPress: (x: number, y: number) => void,
  { delayMs = 500, moveTolerancePx = 10 }: { delayMs?: number; moveTolerancePx?: number } = {},
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  // Keep the latest callback without re-creating the handlers on every render.
  const callbackRef = useRef(onLongPress);
  useEffect(() => {
    callbackRef.current = onLongPress;
  }, [onLongPress]);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
  }, []);

  // Belt-and-braces: never leak a pending timer across unmount (react-arborist
  // recycles rows aggressively while scrolling).
  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Mouse/pen keep the native contextmenu path.
      if (e.pointerType !== "touch") return;
      clear();
      const { clientX: x, clientY: y } = e;
      originRef.current = { x, y };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        // Re-check: a cancel may have landed in the same tick.
        if (originRef.current) callbackRef.current(x, y);
      }, delayMs);
    },
    [clear, delayMs],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const origin = originRef.current;
      if (!origin || !timerRef.current) return;
      const dx = Math.abs(e.clientX - origin.x);
      const dy = Math.abs(e.clientY - origin.y);
      // Scrolling the tree must never open the menu.
      if (dx > moveTolerancePx || dy > moveTolerancePx) clear();
    },
    [clear, moveTolerancePx],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
  };
}
