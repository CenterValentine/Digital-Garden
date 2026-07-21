/**
 * Embed message-origin validation (BROWSER-REACH C2 hardening).
 *
 * Embed pages run inside iframes hosted by two classes of parent:
 *   1. The extension's side-panel page — origin `chrome-extension://<id>`
 *   2. The in-page overlay — origin is the host webpage (unknowable in advance)
 *
 * postMessage listeners in embed clients must validate `event.origin` before
 * acting. Policy (ShadowPrompt lesson — no wildcard origins):
 *   - same-origin messages are always allowed (the app talking to itself)
 *   - chrome-extension origins are allowed only if they match the configured
 *     allowlist (`NEXT_PUBLIC_EMBED_EXTENSION_IDS`, comma-separated IDs)
 *   - when the allowlist is unset (dev / not yet configured), any
 *     structurally-valid chrome-extension origin is accepted so local
 *     unpacked installs work; configure the env var in production.
 */

/** Chromium extension IDs are exactly 32 chars drawn from a–p. */
const CHROME_EXTENSION_ORIGIN_RE = /^chrome-extension:\/\/[a-p]{32}$/;

export function getAllowedExtensionOrigins(): string[] | null {
  const raw = process.env.NEXT_PUBLIC_EMBED_EXTENSION_IDS;
  if (!raw?.trim()) return null;
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => `chrome-extension://${id}`);
}

export function isAllowedEmbedMessageOrigin(origin: string): boolean {
  if (typeof window !== "undefined" && origin === window.location.origin) {
    return true;
  }
  if (!CHROME_EXTENSION_ORIGIN_RE.test(origin)) return false;
  const allowlist = getAllowedExtensionOrigins();
  if (allowlist === null) return true;
  return allowlist.includes(origin);
}
