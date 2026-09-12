/**
 * POST /api/content/share-links
 *
 * Batch-resolve public file links for the caller's own files, minting a
 * capability token for any file that does not have one yet.
 *
 * Body:     { contentIds: string[] }            (≤ 200)
 * Response: { success: true, data: { links: { [contentId]: "/f/<token>" } } }
 *
 * Files the caller does not own, trashed files, and unfinished uploads are
 * omitted rather than erroring, so one bad id never blocks a whole batch.
 * The editor's Clipboard extension is the consumer: it primes a client-side
 * cache from this route so a synchronous copy event can rewrite image `src`s
 * to links that work outside the app.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { ensurePublicFileLinks } from "@/lib/domain/content/file-share-links";
import { logger, withRouteTrace } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/share-links";
const MAX_IDS = 200;

function parseContentIds(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const ids = (body as { contentIds?: unknown }).contentIds;
  if (!Array.isArray(ids) || ids.length > MAX_IDS) return null;
  const valid = ids.every(
    (id): id is string => typeof id === "string" && id.length > 0 && id.length <= 64,
  );
  return valid ? (ids as string[]) : null;
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    let userId: string;
    try {
      userId = (await requireAuth()).user.id;
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 },
      );
    }

    const contentIds = parseContentIds(await request.json().catch(() => null));
    if (!contentIds) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: `contentIds must be an array of at most ${MAX_IDS} ids`,
          },
        },
        { status: 400 },
      );
    }

    try {
      const links = await ensurePublicFileLinks(userId, contentIds);
      return NextResponse.json({ success: true, data: { links } });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "share_links:failed",
        summary: "share link mint failed",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to resolve share links" } },
        { status: 500 },
      );
    }
  });
}
