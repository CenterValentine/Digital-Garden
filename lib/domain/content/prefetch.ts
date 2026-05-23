// Hover-prefetch for content GETs.
//
// When a user hovers a file-tree node or workspace tab, fire a best-effort
// fetch against /api/content/content/[id] so the server-side cache is
// warm by the time they click. The real click then reads the cache in <1ms
// and the editor renders without waiting for a round trip.
//
// Policy:
//   - Dedupe by id within a short window so quick mouse movement across a
//     tree doesn't spam the server. The dedupe window is intentionally
//     shorter than the server cache TTL so re-prefetching after cache
//     expiry is allowed.
//   - Fire-and-forget. We don't await, we don't care about the response.
//     tracedFetch already emits fetch:requested / fetch:completed events,
//     so prefetches show up in dev traces with a recognizable pattern
//     (many requests, all hitting the cache after the first).
//   - Failures silently re-allow re-prefetch on next hover. The real
//     click-driven fetch will surface any actual error.

import { tracedFetch } from "@/lib/core/logger/client-fetch";

const PREFETCH_DEDUPE_MS = 25_000;
const prefetched = new Map<string, number>();

export function prefetchContent(id: string | null | undefined): void {
  if (!id) return;

  const now = Date.now();
  const last = prefetched.get(id);
  if (last !== undefined && now - last < PREFETCH_DEDUPE_MS) {
    return;
  }
  prefetched.set(id, now);

  void tracedFetch(`/api/content/content/${id}`, {
    credentials: "include",
  }).catch(() => {
    // Allow re-prefetch on the next hover — failures are usually transient
    // (network blip, abort during nav). The real fetch will surface real
    // errors with full UX handling.
    prefetched.delete(id);
  });
}

/**
 * Forget any prefetch markers for an id — call after a mutation so a
 * subsequent hover re-warms the cache. Right now this is mostly a hook
 * for future use; the server-side cache already invalidates on
 * PATCH/DELETE, so the next prefetch hit would land on a cold cache
 * regardless.
 */
export function forgetPrefetched(id: string): void {
  prefetched.delete(id);
}
