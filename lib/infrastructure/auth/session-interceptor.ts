"use client";

/**
 * Session interceptor — learn about sign-out from requests we were already
 * making, instead of asking on a timer.
 *
 * Every API route validates the session server-side, so **a 401 is the signal**.
 * Before this existed the only detection path was `AuthSessionSync` polling
 * `/api/auth/session`, which meant up to 3 × its interval to notice a revocation
 * and — far more expensively — a database-touching request every minute forever,
 * which is what stopped Neon ever reaching its 5-minute autosuspend threshold.
 *
 * With this in place detection is *instant on any user action*, costs nothing
 * (it rides requests that were happening anyway), and the poll can be demoted to
 * a slow safety net that lets the database sleep.
 *
 * See D15 in docs/notes-feature/work-tracking/POLLING-DISCIPLINE-PLAN.md.
 *
 * ── Why a global patch rather than a wrapper ─────────────────────────────────
 * `tracedFetch` is the sanctioned wrapper but has ~6 adopters, and an auth
 * interceptor is only useful if it sees *everything*. Patching once, centrally,
 * beats migrating 200 call sites and then relying on everyone remembering.
 */

import { publishSignedOut } from "@/lib/infrastructure/auth/client-session-events";
import { clientLogger } from "@/lib/core/logger/client";

/**
 * Paths whose 401 does NOT mean "your session died".
 *
 * - Auth flows 401 on a *failed sign-in attempt* — the user isn't signed in yet,
 *   so signing them out is nonsense.
 * - `/api/integrations/` is authenticated by browser-extension **bearer token**
 *   (`requireBrowserExtensionBearerAuth`), not the session cookie. A 401 there
 *   means a stale extension token, which is unrelated to this session.
 *
 * Everything else was audited: all 99 `status: 401` sites in `app/api` return it
 * for session reasons. This list is the complete set of exceptions as of
 * 2026-09-09 — extend it if a route starts 401-ing for some other reason.
 */
const NON_SESSION_401_PREFIXES = [
  "/api/auth/sign-in",
  "/api/auth/sign-up",
  "/api/integrations/",
];

/** The confirmation endpoint. Never itself intercepted, or this would recurse. */
const SESSION_CHECK_PATH = "/api/auth/session";

let installed = false;
let originalFetch: typeof fetch | null = null;
let confirming = false;

function isSessionRelevant(path: string): boolean {
  if (!path.startsWith("/api/")) return false;
  if (path.startsWith(SESSION_CHECK_PATH)) return false;
  return !NON_SESSION_401_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function resolvePath(input: RequestInfo | URL): string | null {
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : undefined;
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const url = new URL(raw, origin);
    // Cross-origin 401s tell us nothing about our own session.
    if (origin && url.origin !== origin) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

/**
 * Confirm a 401 really means the session is gone before acting on it.
 *
 * A transient database failure can make `validateSession` return null, which
 * surfaces as a 401 on a perfectly valid session — the same false positive that
 * `CONSECUTIVE_FAILURES_REQUIRED` guards against in the poller. One confirmation
 * request removes it, costs nothing in the normal case (it only runs when a 401
 * was already seen), and is far cheaper than three polling cycles.
 *
 * Debounced: a burst of parallel 401s triggers exactly one confirmation.
 */
async function confirmAndSignOut() {
  if (confirming || !originalFetch) return;
  confirming = true;
  try {
    const response = await originalFetch(`${SESSION_CHECK_PATH}?required=true`, {
      credentials: "include",
      cache: "no-store",
    });
    if (response.status !== 401) {
      clientLogger.info({
        layer: "ui",
        event: "session_interceptor:false_alarm",
        summary: "Saw a 401 but the session re-verified as valid — treating it as transient.",
      });
      return;
    }
    clientLogger.warn({
      layer: "ui",
      event: "session_interceptor:signed_out",
      summary: "A 401 was confirmed against the session endpoint; signing out.",
    });
    publishSignedOut("session-missing");
  } catch {
    // Network failure during confirmation is NOT a sign-out — being offline must
    // never log anyone out.
  } finally {
    confirming = false;
  }
}

/**
 * Patch `window.fetch` to watch for session-invalidating 401s.
 *
 * Idempotent, and returns an uninstall function. The patch is a pure observer:
 * it never alters the request, never consumes the body, and returns the original
 * response untouched.
 */
export function installSessionInterceptor(): () => void {
  if (installed || typeof window === "undefined") return () => {};
  installed = true;
  originalFetch = window.fetch.bind(window);

  const patched: typeof fetch = async (input, init) => {
    const response = await originalFetch!(input, init);
    // Read status only. Cloning or reading the body here would break streaming
    // responses and double-buffer every payload in the app.
    if (response.status === 401) {
      const path = resolvePath(input);
      if (path && isSessionRelevant(path)) {
        void confirmAndSignOut();
      }
    }
    return response;
  };

  window.fetch = patched;

  return () => {
    if (!installed) return;
    if (originalFetch) window.fetch = originalFetch;
    installed = false;
    originalFetch = null;
  };
}

/** Test seam. */
export function __isInterceptorInstalled() {
  return installed;
}
