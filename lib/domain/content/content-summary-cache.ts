import type { WorkspaceContentSummary } from "@/extensions/workplaces/server";

const CACHE_KEY = "dg-content-summary-cache-v1";
const MAX_ENTRIES = 200;
const STALENESS_MS = 7 * 24 * 60 * 60 * 1_000;

interface CacheEntry extends WorkspaceContentSummary {
  fetchedAt: number;
  accessedAt: number;
}

type CacheStore = Record<string, CacheEntry>;

function readCache(): CacheStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CacheStore;
  } catch {
    return {};
  }
}

function writeCache(store: CacheStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    // quota exceeded — cache is best-effort
  }
}

function evictLRU(store: CacheStore): void {
  const keys = Object.keys(store);
  if (keys.length <= MAX_ENTRIES) return;

  let oldestKey = keys[0]!;
  let oldestTime = store[oldestKey]!.accessedAt;
  for (const key of keys) {
    const t = store[key]!.accessedAt;
    if (t < oldestTime) {
      oldestTime = t;
      oldestKey = key;
    }
  }
  delete store[oldestKey];
}

export function getContentSummary(contentId: string): WorkspaceContentSummary | null {
  const store = readCache();
  const entry = store[contentId];
  if (!entry) return null;

  const now = Date.now();
  entry.accessedAt = now;

  if (now - entry.fetchedAt > STALENESS_MS) {
    // entry is stale — callers can trigger a background sync independently
  }

  writeCache(store);
  return { id: entry.id, title: entry.title, contentType: entry.contentType, parentId: entry.parentId };
}

export function warmContentSummaryCache(summaries: WorkspaceContentSummary[]): void {
  if (typeof window === "undefined") return;
  if (summaries.length === 0) return;

  const store = readCache();
  const now = Date.now();

  for (const summary of summaries) {
    store[summary.id] = {
      ...summary,
      fetchedAt: now,
      accessedAt: store[summary.id]?.accessedAt ?? now,
    };
    evictLRU(store);
  }

  writeCache(store);
}

export function purgeContentSummaryCache(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CACHE_KEY);
}
