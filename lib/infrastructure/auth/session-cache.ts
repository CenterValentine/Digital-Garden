// In-process session lookup cache.
//
// Every authenticated route currently does `prisma.session.findUnique` to
// translate a session token into a user — that was the dominant cost in the
// /api/content/content/[id] traces (avg 226ms, max 1418ms). The lookup is
// effectively idempotent for the lifetime of the cookie, so caching the
// result for a short TTL turns ~98% of session lookups into <1ms work.
//
// Scope: per Node.js process. On Vercel Fluid Compute, each function
// instance gets its own cache that warms during its lifetime. Cross-instance
// staleness is bounded by TTL_MS — a deleted session may remain valid on
// other instances for up to that window. For this codebase (personal use,
// short TTL) the tradeoff is right; multi-tenant deployments would want
// Redis + invalidation broadcast instead.
//
// Stored values include null ("we already checked, this token is invalid")
// to defend against repeated-invalid-token DoS — without that branch, an
// attacker could force a DB hit per request by spamming bad tokens.

import type { SessionData } from "./types";

const TTL_MS = 60 * 1000; // 1 minute — short enough that revocation is fast
const MAX_ENTRIES = 1000; // ~1MB at typical session shape; bounded memory

type CacheEntry = {
  // null = confirmed-not-a-session (negative cache to absorb bad-token traffic)
  session: SessionData | null;
  cachedAt: number;
};

// Map preserves insertion order, so eviction of the oldest key is O(1) via
// `cache.keys().next().value`. Reinserting on hit moves the entry to the
// most-recent slot — LRU without a separate doubly-linked list.
const cache = new Map<string, CacheEntry>();

let stats = { hits: 0, misses: 0, evictions: 0 };

/**
 * Look up a cached session by token.
 * Returns:
 *   - `SessionData` — confirmed valid session served from cache
 *   - `null`        — confirmed invalid/unknown token served from cache
 *   - `undefined`   — cache miss (caller must query DB)
 */
export function getCachedSession(
  token: string,
): SessionData | null | undefined {
  const entry = cache.get(token);
  if (!entry) {
    stats.misses += 1;
    return undefined;
  }

  // TTL check — independent of session.expiresAt. Even valid sessions get
  // re-validated every TTL to pick up revocations from other instances.
  if (Date.now() - entry.cachedAt > TTL_MS) {
    cache.delete(token);
    stats.misses += 1;
    return undefined;
  }

  // Session-row expiry check — even within TTL, a session that has crossed
  // its expiresAt must not be served. Drop and force re-query so the caller
  // gets the DB's authoritative expired/deleted state.
  if (entry.session && entry.session.expiresAt.getTime() < Date.now()) {
    cache.delete(token);
    stats.misses += 1;
    return undefined;
  }

  // Move to most-recent slot for LRU ordering.
  cache.delete(token);
  cache.set(token, entry);
  stats.hits += 1;
  return entry.session;
}

export function setCachedSession(
  token: string,
  session: SessionData | null,
): void {
  if (cache.size >= MAX_ENTRIES && !cache.has(token)) {
    // Evict the oldest entry (first key in iteration order).
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
      stats.evictions += 1;
    }
  }
  cache.set(token, { session, cachedAt: Date.now() });
}

/**
 * Invalidate a specific token's cache entry. Call this from sign-out and
 * any explicit session-revocation path to keep the local cache consistent
 * with the DB. Other instances will catch up via TTL expiry.
 */
export function invalidateCachedSession(token: string): void {
  cache.delete(token);
}

/**
 * Read-only snapshot of cache effectiveness. Surfaces hit rate and current
 * size for periodic diagnostic logging or admin dashboards.
 */
export function getSessionCacheStats(): {
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

// Exposed for tests only — never call from production code.
export function __resetSessionCacheForTests(): void {
  cache.clear();
  stats = { hits: 0, misses: 0, evictions: 0 };
}
