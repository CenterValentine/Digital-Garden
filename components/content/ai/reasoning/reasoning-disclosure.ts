"use client";

/**
 * Shared disclosure behavior for ALL reasoning blocks (owner ask 2026-08-08):
 *
 * - Verbose thinkers (DeepSeek et al.) emit one reasoning block per step —
 *   expanding one expands them ALL, collapsing collapses them all. The
 *   preference is session-scoped (not persisted); `null` means "no
 *   preference yet", where each block auto-opens while its part streams.
 * - Toggling is scroll-ANCHORED on the clicked header: collapsing dozens of
 *   blocks above the viewport must not shift the chat under the user. We
 *   flushSync the state change and compensate the scroll container in the
 *   same task, before the browser paints.
 * - A live elapsed timer (WorkingIndicator convention: held back for the
 *   first 3s, m:ss, tabular-nums) tells the user a long think is alive; the
 *   final elapsed stays visible for the rest of the session.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { create } from "zustand";

const useReasoningPrefStore = create<{
  pref: boolean | null;
  setPref: (pref: boolean | null) => void;
}>((set) => ({
  pref: null,
  setPref: (pref) => set({ pref }),
}));

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let cur = el?.parentElement ?? null;
  while (cur) {
    const style = getComputedStyle(cur);
    if (
      /(auto|scroll)/.test(style.overflowY) &&
      cur.scrollHeight > cur.clientHeight
    ) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

function useReasoningElapsed(streaming: boolean | undefined): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!streaming) return;
    if (startRef.current === null) startRef.current = Date.now();
    const start = startRef.current;
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [streaming]);
  return elapsed;
}

export interface ReasoningDisclosure {
  open: boolean;
  /** Toggle EVERY reasoning block, keeping the clicked header visually still. */
  toggle: () => void;
  /** Attach to the header button — the scroll anchor for the global toggle. */
  headerRef: React.RefObject<HTMLButtonElement | null>;
  /** Seconds this block's part has been (or was) streaming; 0 for history. */
  elapsed: number;
}

export function useReasoningDisclosure(
  streaming: boolean | undefined,
): ReasoningDisclosure {
  const pref = useReasoningPrefStore((s) => s.pref);
  const setPref = useReasoningPrefStore((s) => s.setPref);
  const headerRef = useRef<HTMLButtonElement | null>(null);
  // Default COLLAPSED even while streaming (owner, 2026-08-28): verbose
  // thinkers emit a block per step, and auto-opening each one turns the
  // transcript into scrolling noise. The header's live timer already says
  // a think is alive; expanding is one click and sticky for the session.
  const open = pref ?? false;

  const toggle = useCallback(() => {
    const el = headerRef.current;
    const beforeTop = el?.getBoundingClientRect().top;
    // Synchronous commit so we can measure + compensate before paint — no
    // one-frame jump while dozens of sibling blocks change height.
    flushSync(() => setPref(!open));
    if (el && beforeTop !== undefined) {
      const scroller = findScrollParent(el);
      if (scroller) {
        const delta = el.getBoundingClientRect().top - beforeTop;
        if (delta !== 0) scroller.scrollTop += delta;
      }
    }
  }, [open, setPref]);

  const elapsed = useReasoningElapsed(streaming);
  return { open, toggle, headerRef, elapsed };
}

/** m:ss, WorkingIndicator-style; empty until the wait is clearly real. */
export function formatReasoningElapsed(
  elapsed: number,
  streaming: boolean | undefined,
): string | null {
  const show = streaming ? elapsed >= 3 : elapsed > 0;
  if (!show) return null;
  const mm = Math.floor(elapsed / 60);
  const ss = elapsed % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}
