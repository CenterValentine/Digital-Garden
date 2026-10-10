"use client";

/**
 * Click-away dismissal for the database's INLINE boxes — pickers and editors
 * that render in place rather than through PanelPortal (which has its own,
 * portal-aware dismissal). Owner rule 2026-10-09: a box opened by a click
 * closes when you click elsewhere; it never lingers.
 *
 * mousedown, so the click's own action (selecting a cell, opening another
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
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target || ref.current?.contains(target)) return;
      onAwayRef.current();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [active, ref]);
}
