"use client";

/**
 * Click-away dismissal for the database's INLINE boxes — pickers and editors
 * that render in place rather than through PanelPortal (which has its own,
 * portal-aware dismissal). Owner rule 2026-10-09: a box opened by a click
 * closes when you click elsewhere; it never lingers.
 *
 * On press, so the click's own action (selecting a cell, opening another
 * picker) still lands after the close.
 */

import { useEffect, useRef } from "react";

export function useClickAway(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onAway: () => void
) {
  const onAwayRef = useRef(onAway);
  useEffect(() => {
    onAwayRef.current = onAway;
  }, [onAway]);

  useEffect(() => {
    if (!active) return;
    // pointerdown + capture, like PanelPortal: mousedown is skipped when a
    // pointerdown is cancelled, and a bubbling listener misses stopped ones.
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target || ref.current?.contains(target)) return;
      onAwayRef.current();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [active, ref]);
}
