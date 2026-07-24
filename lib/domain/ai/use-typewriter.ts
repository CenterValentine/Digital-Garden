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
 *
 * `settleInitial` (AI 3.3, resumed streams): when a reload re-attaches to
 * an in-flight response, the whole buffered portion floods in at once.
 * Re-typing content that was actually generated seconds ago reads as a
 * jarring "catch-up race." With `settleInitial` the first non-empty text
 * snaps in fully — as if it had been there the whole time — and only
 * genuinely new tokens arriving afterward type. It's inert for fresh
 * sends (no buffer), so callers pass it only for the resumed turn.
 */

"use client";

import { useEffect, useRef, useState } from "react";

/** Fraction of the remaining backlog revealed per frame (higher = faster). */
const REVEAL_DIVISOR = 8;

export function useTypewriter(
  text: string,
  active: boolean,
  settleInitial = false,
): string {
  // Initialize from `active` once: a part mounting mid-stream reveals from
  // the start; a historical part shows in full immediately.
  const [displayed, setDisplayed] = useState(active ? "" : text);
  const indexRef = useRef(active ? 0 : text.length);
  const targetRef = useRef(text);
  const rafRef = useRef<number | null>(null);
  // One-shot latch for `settleInitial`: the first non-empty target snaps
  // to full instead of revealing from zero. Persists for the component's
  // life so live tokens after the settle still type normally.
  const settledRef = useRef(false);

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
      // Resumed-stream settle (AI 3.3): the first tick with real content
      // reveals the entire buffered flood at once — it was generated
      // seconds ago, so it should appear as if it had been there the whole
      // time. The latch flips here (not on an empty mount), so live tokens
      // arriving after the settle type normally.
      const settleNow = settleInitial && !settledRef.current;
      if (settleNow) settledRef.current = true;
      const step = settleNow
        ? backlog
        : Math.max(1, Math.ceil(backlog / REVEAL_DIVISOR));
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
  }, [text, active, settleInitial]);

  return active ? displayed : text;
}
