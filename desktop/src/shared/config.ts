/**
 * Runtime configuration for the desktop shell (main process only).
 *
 * The web origin is NOT hardcoded (same rule as mobile/src/config.ts). Point the
 * shell at another environment with DG_DESKTOP_URL:
 *
 *   npm run dev                                   # → http://localhost:3015/content (pnpm dev)
 *   npm run dev:prod                              # → https://davidvalentine.org/content
 *   DG_DESKTOP_URL=http://localhost:3017/content npm run dev   # a `pnpm dev -wt` worktree port
 *
 * Launch at /content (the workspace), not / (the public site). /content is a
 * protected prefix in proxy.ts, so a signed-out launch lands on
 * /sign-in?from=/content and returns to the workspace after sign-in.
 */

/** This repo's `pnpm dev` binds 3015, not the generic 3000. */
export const DEFAULT_APP_URL = "http://localhost:3015/content";

/**
 * Persistent session partition. Cookies (the httpOnly `session_token`),
 * IndexedDB (the per-note Y.js cache `dg:content:{id}`), and localStorage all
 * live here and survive relaunches. Renaming it signs the user out and drops
 * the offline note cache, so treat it as a stable identifier.
 */
export const SESSION_PARTITION = "persist:garden";

export function getAppUrl(): string {
  const fromEnv = process.env.DG_DESKTOP_URL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_APP_URL;
}

export function getAppOrigin(): string {
  return new URL(getAppUrl()).origin;
}

/** True when `url` parses and shares the app's exact origin (scheme + host + port). */
export function isAppOrigin(url: string, appOrigin: string = getAppOrigin()): boolean {
  try {
    return new URL(url).origin === appOrigin;
  } catch {
    return false;
  }
}
