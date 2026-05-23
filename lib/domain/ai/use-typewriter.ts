/**
 * useTypewriter — subtle streaming reveal (Session 5a polish).
 *
 * Progressively reveals `text` while `active` is true, producing the
 * gentle "typing" effect common to ChatGPT/Claude. When inactive (a
 * historical message, or the setting is off) it returns the full text
 * immediately — no animation, no cost.
 *
 * The reveal rate is backlog-proportional: each animation frame uncovers
 * a fraction of the remaining characters, so a fast stream stays caught
 * up (no growing lag) while a slow trickle still types smoothly. The rAF
 * loop parks itself the moment it catches the target and only restarts
 * when more text arrives, so an idle/complete message costs nothing.
 */

"use client";

import { useEffect, useRef, useState } from "react";

/** Fraction of the remaining backlog revealed per frame (higher = faster). */
const REVEAL_DIVISOR = 8;

export function useTypewriter(text: string, active: boolean): string {
  // Initialize from `active` once: a part mounting mid-stream reveals from
  // the start; a historical part shows in full immediately.
  const [displayed, setDisplayed] = useState(active ? "" : text);
  const indexRef = useRef(active ? 0 : text.length);
  const targetRef = useRef(text);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    targetRef.current = text;

    if (!active) {
      // Stop any in-flight animation and sync the cursor. No setState
      // needed — the hook returns `text` directly while inactive (so the
      // displayed-state value is simply unused), which also avoids a
      // synchronous setState-in-effect cascade.
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      indexRef.current = text.length;
      return;
    }

    // A reset/shorter target (e.g. regenerate) — clamp the cursor.
    if (indexRef.current > text.length) {
      indexRef.current = text.length;
    }

    const tick = () => {
      const target = targetRef.current;
      const current = indexRef.current;
      if (current >= target.length) {
        rafRef.current = null;
        return;
      }
      const backlog = target.length - current;
      const step = Math.max(1, Math.ceil(backlog / REVEAL_DIVISOR));
      indexRef.current = Math.min(target.length, current + step);
      setDisplayed(target.slice(0, indexRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };

    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [text, active]);

  return active ? displayed : text;
}
