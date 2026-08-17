/**
 * Surface family + device identity (layout-intent spec R2).
 *
 * Every session identifies as exactly one FAMILY when writing layout records:
 *   desktop        — the one coupled family (shared record, deviceId "shared")
 *   web-phone / web-tablet       — mobile browsers
 *   native-phone / native-tablet — the WebView shell
 *   ext:panel / ext:overlay      — browser-extension iframes (each unique; R2
 *                                  forbids cross-extension coupling)
 *
 * Detection is a plain read of the runtime environment — it feeds projection
 * and record-writing but is never itself persisted or synced.
 */

import { isNativeShell } from "@/lib/mobile-bridge/client";

export type WorkspaceSurfaceFamily =
  | "desktop"
  | "web-phone"
  | "web-tablet"
  | "native-phone"
  | "native-tablet"
  | `ext:${string}`;

const DEVICE_ID_KEY = "dg:device-id";
/** Phone/tablet split: shorter viewport side under this = phone (spec + useViewport). */
const PHONE_SHORT_SIDE_MAX = 600;

/** Stable per-device identity for layout records. Generated once, kept local. */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const generated = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_KEY, generated);
    return generated;
  } catch {
    // Storage unavailable (private mode edge cases): a per-session id still
    // satisfies the unique constraint, at the cost of record churn.
    return "ephemeral";
  }
}

export function detectWorkspaceSurfaceFamily(): WorkspaceSurfaceFamily {
  if (typeof window === "undefined") return "desktop";

  const pathname = window.location.pathname;
  if (pathname.startsWith("/embed/")) return "ext:panel";
  if (pathname.startsWith("/extension-overlay")) return "ext:overlay";

  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  const isPhone = coarse && shortSide < PHONE_SHORT_SIDE_MAX;
  const isTablet = coarse && shortSide >= PHONE_SHORT_SIDE_MAX;

  if (isNativeShell()) {
    return isPhone ? "native-phone" : "native-tablet";
  }
  if (isPhone) return "web-phone";
  if (isTablet) return "web-tablet";
  return "desktop";
}
