"use client";

/**
 * Click-and-hold for the database surfaces (owner, 2026-10-09).
 *
 * A primary-button press that stays put for `HOLD_MS` fires `onHold` while
 * the button is still down. Moving more than a few pixels cancels it — that
 * is a drag (column reorder, drag-select), not a hold. The click that the
 * release would deliver is swallowed once, so a hold never ALSO acts as a
 * click (selecting a column, toggling a checkbox cell).
 */

import { useCallback, useEffect, useRef } from "react";

export const HOLD_MS = 500;
const MOVE_TOLERANCE_PX = 5;

function swallowNextClick() {
  const swallow = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  // A release that produces no click (moved off target) must not leave the
  // listener armed for some later, unrelated click.
  window.setTimeout(() => window.removeEventListener("click", swallow, true), 800);
}

export function usePressHold<T>(onHold: (target: T) => void) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const onHoldRef = useRef(onHold);
  useEffect(() => {
    onHoldRef.current = onHold;
  }, [onHold]);

  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  /** Call from onPointerDown with whatever the hold acts on. */
  const start = useCallback(
    (e: React.PointerEvent, target: T) => {
      if (e.button !== 0) return;
      cancel();
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        origin.current = null;
        swallowNextClick();
        onHoldRef.current(target);
      }, HOLD_MS);
    },
    [cancel]
  );

  /** Call from onPointerMove — a press that travels is a drag. */
  const move = useCallback(
    (e: React.PointerEvent) => {
      const o = origin.current;
      if (!o) return;
      if (Math.abs(e.clientX - o.x) > MOVE_TOLERANCE_PX || Math.abs(e.clientY - o.y) > MOVE_TOLERANCE_PX) {
        cancel();
      }
    },
    [cancel]
  );

  return { start, move, cancel };
}
