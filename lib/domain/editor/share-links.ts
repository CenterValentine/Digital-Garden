/**
 * Public file share links — client-side cache.
 *
 * The copy event is synchronous, but a file's public link lives on the
 * server (FilePayload.publicToken, minted on demand). This module bridges
 * the two: the Clipboard extension primes the cache whenever image nodes
 * with a contentId appear in a document, and consults it synchronously at
 * copy time to rewrite each image's `src` into a link that works outside
 * the app.
 *
 * Misses are non-fatal. An image whose link has not arrived yet (or whose
 * prime request failed — e.g. the browser-extension embed, whose session
 * does not ride on plain fetch cookies) is copied with its absolute private
 * URL instead: still better than the bare relative path, and correct again
 * on the next copy once the link lands.
 */

const SHARE_LINKS_ROUTE = "/api/content/share-links";
const PRIME_DEBOUNCE_MS = 50;

/** contentId → "/f/<token>" */
const cache = new Map<string, string>();
/** contentIds with a request in flight or queued, so we never double-ask. */
const pending = new Set<string>();
let queued: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function getCachedSharePath(contentId: string): string | null {
  return cache.get(contentId) ?? null;
}

/** Test seam + upload hook: record a link the server already told us about. */
export function rememberSharePath(contentId: string, path: string): void {
  cache.set(contentId, path);
}

/**
 * Ask the server for links for any contentIds we have not seen. Batched
 * across a short debounce so a document load with many images is one
 * request, not one per image.
 */
export function primeShareLinks(contentIds: Iterable<string>): void {
  if (typeof window === "undefined") return;
  for (const id of contentIds) {
    if (cache.has(id) || pending.has(id)) continue;
    pending.add(id);
    queued.push(id);
  }
  if (queued.length === 0 || flushTimer) return;
  flushTimer = setTimeout(flush, PRIME_DEBOUNCE_MS);
}

async function flush(): Promise<void> {
  flushTimer = null;
  const batch = queued;
  queued = [];
  try {
    const response = await fetch(SHARE_LINKS_ROUTE, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentIds: batch }),
    });
    if (!response.ok) return;
    const json = (await response.json()) as {
      success?: boolean;
      data?: { links?: Record<string, string> };
    };
    const links = json.success ? json.data?.links : undefined;
    if (!links) return;
    for (const [contentId, path] of Object.entries(links)) cache.set(contentId, path);
  } catch {
    // Silent: copy falls back to the absolute private URL. Ids are released
    // below so a later document change can retry.
  } finally {
    for (const id of batch) pending.delete(id);
  }
}

function isAbsoluteUrl(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(src);
}

/**
 * The `src` an image node should carry when it leaves the app.
 *
 *   uploaded file with a known link  → https://<origin>/f/<token>
 *   uploaded file, link not cached   → https://<origin>/api/…/download?stream=true
 *   external / data: / blob: image   → unchanged (already self-describing)
 */
export function shareableImageSrc(attrs: {
  src?: string | null;
  contentId?: string | null;
}): string {
  const src = attrs.src ?? "";
  if (typeof window === "undefined") return src;
  const origin = window.location.origin;

  if (attrs.contentId) {
    const path = getCachedSharePath(attrs.contentId);
    if (path) return `${origin}${path}`;
  }
  if (src.startsWith("/") && !src.startsWith("//")) return `${origin}${src}`;
  if (src && !isAbsoluteUrl(src)) return `${origin}/${src}`;
  return src;
}
