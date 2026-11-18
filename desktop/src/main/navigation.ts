/**
 * Navigation policy: where does a URL the web app tries to open belong?
 *
 * Two entry points reach this from main/index.ts:
 *   - "navigate":    the page changes its own location (link click, location.assign).
 *                    Server-side redirects (e.g. /api/auth/google → accounts.google.com
 *                    → callback) do NOT pass through here: they fire `will-redirect`,
 *                    so the OAuth redirect chain completes in-window unaided.
 *   - "window-open": window.open() or <a target="_blank">.
 */

export type NavigationKind = "navigate" | "window-open";

export type NavigationTarget =
  /** Load in the current window. */
  | "stay"
  /** Open in a new Electron window that shares the persist:garden session. */
  | "app-window"
  /** Hand to the OS default browser (shell.openExternal). */
  | "system-browser"
  /** Refuse silently. */
  | "block";

/**
 * Off-origin hosts that must complete inside the shell's own cookie jar.
 * Learned on mobile (P0 smoke, 2026-08-14): if accounts.google.com finishes in
 * an external browser, that browser gets the session cookie and the shell stays
 * signed out.
 */
export const IN_APP_AUTH_HOSTS: ReadonlySet<string> = new Set(["accounts.google.com"]);

export function classifyNavigation(
  targetUrl: string,
  appOrigin: string,
  kind: NavigationKind,
): NavigationTarget {
  if (targetUrl === "about:blank") return kind === "window-open" ? "app-window" : "stay";

  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return "block";
  }

  if (url.protocol === "mailto:" || url.protocol === "tel:") return "system-browser";
  // blob:/data:/file:/javascript:/custom schemes never navigate the app window.
  // (Downloads of blob: URLs go through will-download, not navigation.)
  if (url.protocol !== "http:" && url.protocol !== "https:") return "block";

  const sameOrigin = url.origin === appOrigin;
  const authHost = IN_APP_AUTH_HOSTS.has(url.hostname);

  if (kind === "navigate") {
    // In-place navigation to our origin or to an auth host stays; anything else
    // leaves the app (keeps session cookies off third-party pages).
    return sameOrigin || authHost ? "stay" : "system-browser";
  }

  return decideWindowOpen(url, sameOrigin, authHost);
}

/**
 * window.open / target="_blank" policy: the one branch with real product
 * judgment in it. See the TODO.
 */
function decideWindowOpen(url: URL, sameOrigin: boolean, authHost: boolean): NavigationTarget {
  // TODO(owner): decide how window.open behaves in the desktop app.
  //
  // Cases worth deciding deliberately:
  //   • authHost (Google reauth popup from google-reauth-client.ts): the opener
  //     may expect `window.opener` to survive, which needs "app-window", not the
  //     system browser.
  //   • sameOrigin, e.g. "open note in new tab", published-site previews
  //     (/site/...), export downloads served from /api/...: new app window? Load
  //     in place ("stay" isn't valid for window-open; pick "app-window" or route
  //     some paths to "system-browser")?
  //   • off-origin http(s): almost certainly "system-browser".
  //
  // Temporary default so M0 is usable: auth popups + same-origin → app window.
  if (authHost || sameOrigin) return "app-window";
  void url;
  return "system-browser";
}
