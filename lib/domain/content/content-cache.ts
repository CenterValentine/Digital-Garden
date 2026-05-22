// In-process content payload cache.
//
// Every /api/content/content/[id] GET issues a Prisma findUnique against
// Neon-hosted Postgres in us-west-2. Even with auth caching, sub-spanned
// timings show the SQL roundtrip dominating the request: 280-1028ms for
// the same query back-to-back. The variance isn't query-plan or row-size —
// it's network RTT + Neon serverless compute spinning back up after idle.
// The query itself probably executes in 10-30ms; everything else is travel
// and warm-up tax.
//
// This cache lets a tab switch on already-loaded content serve in <1ms
// with zero DB roundtrips. That's the load-bearing user-facing effect.
//
// Coherence model:
//   - Cache is per-process (same scope as session cache). Cross-instance
//     staleness is bounded by TTL.
//   - PATCH and DELETE in app/api/content/content/[id]/route.ts invalidate
//     the local entry. Other instances catch up via TTL expiry.
//   - For collab-active notes (Hocuspocus), the REST tiptapJson is only a
//     bootstrap; the Y.Doc on Hocuspocus is the source of truth. Brief
//     staleness here is harmless — the editor's Y.Doc sync overrides it
//     immediately after first paint.
//   - Soft-deleted content (deletedAt != null) is NOT cached, so a delete
//     followed by re-fetch always returns the freshest state.
//
// TTL: 30s. Shorter than session cache because content mutates more
// freely. Long enough to absorb the burst of GETs from a single page load
// or tab switch.
//
// Max entries: 100. Notes can be large (tiptapJson up to ~MB), so a
// generous cap would balloon memory. 100 covers typical working set
// without dominating heap.

import type { ContentDetailResponse } from "./api-types";

const TTL_MS = 30 * 1000;
const MAX_ENTRIES = 100;

type CacheEntry = {
  data: ContentDetailResponse;
  cachedAt: number;
};

const cache = new Map<string, CacheEntry>();
let stats = { hits: 0, misses: 0, evictions: 0 };

/**
 * Look up cached content by id.
 * Returns:
 *   - `ContentDetailResponse` — fresh cached value
 *   - `undefined`             — cache miss (caller must query DB)
 *
 * Unlike the session cache, this does NOT negative-cache 404s. Content
 * can be created after a miss, and we never want to serve a phantom
 * 404 from cache. Negative caching here would also conflict with the
 * "fresh after delete" invariant — invalidation on DELETE only works if
 * the cache doesn't independently learn "this doesn't exist."
 */
export function getCachedContent(
  contentId: string,
): ContentDetailResponse | undefined {
  const entry = cache.get(contentId);
  if (!entry) {
    stats.misses += 1;
    return undefined;
  }

  if (Date.now() - entry.cachedAt > TTL_MS) {
    cache.delete(contentId);
    stats.misses += 1;
    return undefined;
  }

  // Move to most-recent slot for LRU ordering.
  cache.delete(contentId);
  cache.set(contentId, entry);
  stats.hits += 1;
  return entry.data;
}

export function setCachedContent(
  contentId: string,
  data: ContentDetailResponse,
): void {
  // Soft-deleted content must not be cached — a subsequent un-delete or
  // re-create needs to bypass the stale entry. Callers that observe
  // deletedAt should skip the cache write entirely; this guard is a
  // belt-and-suspenders check.
  if (data.deletedAt) return;

  if (cache.size >= MAX_ENTRIES && !cache.has(contentId)) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
      stats.evictions += 1;
    }
  }
  cache.set(contentId, { data, cachedAt: Date.now() });
}

/**
 * Drop a content id from this process's cache. Call from any handler
 * that mutates content state — PATCH, DELETE, tag updates, etc. Other
 * process instances catch up via TTL expiry; this is best-effort
 * for the local instance.
 */
export function invalidateCachedContent(contentId: string): void {
  cache.delete(contentId);
}

/**
 * Read-only snapshot for diagnostic logging. Mirrors session cache
 * stats shape so admin/observability dashboards can render both
 * with one formatter.
 */
export function getContentCacheStats(): {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
} {
  const total = stats.hits + stats.misses;
  return {
    ...stats,
    size: cache.size,
    hitRate: total > 0 ? stats.hits / total : 0,
  };
}

// Exposed for tests only.
export function __resetContentCacheForTests(): void {
  cache.clear();
  stats = { hits: 0, misses: 0, evictions: 0 };
}
