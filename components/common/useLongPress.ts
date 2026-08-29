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
 * Fires `onLongPress(x, y, pointerType)` after `delayMs` of a stationary press.
 * Cancels on:
 *   • movement beyond `moveTolerancePx` (so list scrolling never triggers it)
 *   • pointer up / cancel before the timer fires
 *   • any pointer type outside `pointerTypes`
 *
 * `pointerTypes` defaults to touch only, because that is the case that has no
 * alternative. Widen it when a press-and-hold means something on a mouse too —
 * the callback receives the pointer type so one hook can serve both without a
 * second set of pointer handlers fighting for the same element.
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
  onLongPress: (x: number, y: number, pointerType: string) => void,
  {
    delayMs = 500,
    moveTolerancePx = 10,
    pointerTypes = ["touch"],
  }: {
    delayMs?: number;
    moveTolerancePx?: number;
    pointerTypes?: readonly string[];
  } = {},
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  // Keep the latest callback without re-creating the handlers on every render.
  const callbackRef = useRef(onLongPress);
  useEffect(() => {
    callbackRef.current = onLongPress;
  }, [onLongPress]);

  // Same trick for the accepted pointer types: call sites pass an inline array
  // literal, whose identity changes every render and would otherwise rebuild
  // every handler each time.
  const pointerTypesRef = useRef(pointerTypes);
  useEffect(() => {
    pointerTypesRef.current = pointerTypes;
  }, [pointerTypes]);

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
      if (!pointerTypesRef.current.includes(e.pointerType)) return;
      clear();
      const { clientX: x, clientY: y, pointerType } = e;
      originRef.current = { x, y };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        // Re-check: a cancel may have landed in the same tick.
        if (originRef.current) callbackRef.current(x, y, pointerType);
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
