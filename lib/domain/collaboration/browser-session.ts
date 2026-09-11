"use client";

/**
 * Browser-session identity for collaboration surfaces.
 *
 * Extracted from runtime.ts to break an import cycle. `presence-poll.ts` needs
 * the session id so it can ask the batch route to exclude our own record, and
 * runtime.ts now subscribes to that same poller for its wake signal — so
 * without this module the two would import each other.
 *
 * A "browser session" is one tab's identity for the life of that tab: it lives
 * in `sessionStorage`, so it survives reloads and in-tab navigation but is
 * distinct per tab and gone when the tab closes. That is exactly the granularity
 * presence needs — two tabs on the same note are genuinely two surfaces, and a
 * closed tab should stop counting immediately rather than linger under a
 * localStorage key nothing will clean up.
 */

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Math.random().toString(36).slice(2)}:${Date.now()}`;
}

function getSessionStorageId(key: string, prefix: string) {
  if (typeof window === "undefined") return createId(prefix);
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next = createId(prefix);
  window.sessionStorage.setItem(key, next);
  return next;
}

/** Stable id for THIS tab, for the lifetime of the tab. */
export function getCollaborationBrowserSessionId() {
  return getSessionStorageId("dg-collab-session-id", "session");
}
