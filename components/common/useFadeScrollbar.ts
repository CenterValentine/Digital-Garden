"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * useFadeScrollbar
 *
 * Pair with the `fade-scroll` CSS class in app/globals.css. The hook adds
 * `data-scrolling="true"` to the element while it scrolls and removes it
 * after `idleMs` of stillness; the CSS rules then transition the thumb
 * opacity in and out.
 *
 * The thumb is also visible on `:hover` (a pure-CSS guarantee), so the
 * hook only adds the "appears while scrolling" half of the behavior.
 *
 * Usage:
 *   const ref = useFadeScrollbar<HTMLDivElement>();
 *   return <div ref={ref} className="fade-scroll overflow-y-auto">...</div>;
 *
 * Or attach to an existing ref:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useFadeScrollbar(ref);
 */
export function useFadeScrollbar<T extends HTMLElement>(
  externalRef?: RefObject<T | null>,
  idleMs = 800,
): RefObject<T | null> {
  const internalRef = useRef<T | null>(null);
  const ref = externalRef ?? internalRef;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const onScroll = () => {
      el.dataset.scrolling = "true";
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        delete el.dataset.scrolling;
      }, idleMs);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
      delete el.dataset.scrolling;
    };
  }, [ref, idleMs]);

  return ref;
}
