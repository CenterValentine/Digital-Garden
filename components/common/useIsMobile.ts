"use client";

import { useSyncExternalStore } from "react";

/**
 * useIsMobile
 *
 * Returns true when the viewport is below the Tailwind `md` breakpoint
 * (< 768px) — i.e. phone-width. Drives the mobile content-IDE layout
 * (single-pane + drawers + bottom nav) so desktop is completely unaffected.
 *
 * Implementation notes:
 * - Built on `useSyncExternalStore` (not useState/useEffect) so it's tear-free,
 *   needs no manual memoization (React Compiler friendly), and has an explicit
 *   server snapshot.
 * - `getServerSnapshot` returns `false` — we assume desktop during SSR so the
 *   server HTML is deterministic; the real value is applied on hydration. Pair
 *   any layout that shifts on this value with the usual hydration care (render
 *   the desktop tree on the server, swap on the client).
 *
 * Usage:
 *   const isMobile = useIsMobile();
 */

// Below Tailwind's `md` (768px). max-width:767.98px avoids the fractional-pixel
// gap some browsers leave exactly at the integer boundary.
const MOBILE_QUERY = "(max-width: 767.98px)";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
