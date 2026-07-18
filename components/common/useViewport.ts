"use client";

import { useSyncExternalStore } from "react";

/**
 * Phone + orientation detection for the mobile content-IDE layout.
 *
 * `useIsMobile()` (width < 768px) is the right trigger for *narrow* viewports,
 * but it can't identify a phone: an iPhone in landscape is ~844px wide, so a
 * width-only check drops a landscape phone into the desktop layout. A phone is
 * better defined by **coarse pointer + a shorter side under ~600px** — which
 * includes landscape phones and excludes tablets (iPad's shorter side ≥ 768).
 *
 * Orientation is a plain aspect-ratio read so pane splits can follow the
 * device: portrait → stacked, landscape → side-by-side.
 *
 * Both hooks use `useSyncExternalStore` (tear-free, React-Compiler-friendly)
 * with a desktop server snapshot, corrected on hydration.
 */

const PHONE_SHORT_SIDE_MAX = 600;

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("resize", callback);
  window.addEventListener("orientationchange", callback);
  return () => {
    window.removeEventListener("resize", callback);
    window.removeEventListener("orientationchange", callback);
  };
}

function getIsPhone(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  return coarse && shortSide < PHONE_SHORT_SIDE_MAX;
}

function getIsLandscape(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth > window.innerHeight;
}

/** True on phones in any orientation (coarse pointer + shorter side < 600px). */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    getIsPhone,
    () => false,
  );
}

/** True when the viewport is wider than it is tall. */
export function useIsLandscape(): boolean {
  return useSyncExternalStore(
    subscribe,
    getIsLandscape,
    () => false,
  );
}
