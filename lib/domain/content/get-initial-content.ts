// Server-side initial-content fetch for /content page render.
//
// Reads the server cache populated by /api/content/content/[id] GETs.
// On a cache hit, returns the ContentDetailResponse so the page can pass
// it down to the workspace as initialContent — the client then skips its
// post-hydration fetch effect entirely, and the editor mounts with content
// already in props.
//
// On a cache miss, returns null. The client falls back to its normal
// useEffect-driven fetch, populating the cache for the next visit.
//
// This is a deliberate scope choice: skipping cache misses keeps SSR
// from duplicating the route handler's ~150 lines of response-building
// code. Composes with the cache: every reload within ~30s of recent
// activity becomes a server-rendered hit. First-ever loads stay
// client-driven (same as today); the second visit gets the speedup.
//
// Server-only — uses next/headers indirectly via withTrace and reads
// the in-process content cache. Do NOT import from client components.

import { prisma } from "@/lib/database/client";
import { resolveContentAccessFromNode } from "@/lib/domain/collaboration/access";
import type { ContentDetailResponse } from "./api-types";
import { getCachedContent } from "./content-cache";
import { logger } from "@/lib/core/logger";

export async function getInitialContentFromCache(
  contentId: string,
  userId: string,
): Promise<ContentDetailResponse | null> {
  const cached = getCachedContent(contentId);
  if (!cached) return null;

  // Access check using cached metadata — same code path as the API
  // route. We catch and convert any denial to null so the client can
  // re-attempt the fetch and get a proper 403 with full UX handling.
  try {
    await resolveContentAccessFromNode(prisma, {
      content: {
        id: cached.id,
        ownerId: cached.ownerId,
        contentType: cached.contentType,
        deletedAt: cached.deletedAt,
      },
      userId,
      require: "view",
    });
  } catch {
    return null;
  }

  return cached;
}

/**
 * Wrap the cache lookup in a try/catch so any unexpected failure (cache
 * data corruption, access check throwing for non-permission reasons,
 * etc.) falls back to the client-fetch path instead of breaking the
 * page render. Belt-and-suspenders — the page can't afford to crash
 * for a missing cache entry.
 */
export async function safeGetInitialContent(
  contentId: string | null | undefined,
  userId: string | null | undefined,
): Promise<ContentDetailResponse | null> {
  if (!contentId || !userId) return null;
  try {
    return await getInitialContentFromCache(contentId, userId);
  } catch (err) {
    logger.warn({
      layer: "content",
      event: "ssr_initial_fetch:failed",
      summary: "initial content SSR fetch failed, falling back to client",
      attrs: { content_id: contentId },
      error: err instanceof Error ? err : undefined,
    });
    return null;
  }
}
