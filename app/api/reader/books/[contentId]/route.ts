/**
 * GET   /api/reader/books/[contentId] → BookMeta (created lazily for plain
 *       uploads) + reading progress + a DRM message when the file is protected.
 * PATCH /api/reader/books/[contentId] { readingStatus } → set status; mirrors
 *       to Hardcover when connected.
 */

import { z } from "zod";
import { getProgress } from "@/lib/domain/reader/server/annotations";
import { setReadingStatus } from "@/lib/domain/reader/server/integrations";
import { getOrCreateBookMeta } from "@/lib/domain/reader/server/library";
import { readerRouteWithParams } from "@/lib/domain/reader/server/route";
import { contentTargetKey } from "@/lib/domain/reader/types";

const ROUTE = "/api/reader/books/[contentId]";

export const GET = readerRouteWithParams<{ contentId: string }, unknown>(
  ROUTE,
  async ({ ownerId, params }) => {
    const { meta, drmMessage } = await getOrCreateBookMeta(ownerId, params.contentId);
    const progress = await getProgress(ownerId, contentTargetKey(params.contentId));
    return { meta, progress, drmMessage };
  }
);

const patchSchema = z.object({
  readingStatus: z.enum(["want", "reading", "finished"]).nullable(),
});

export const PATCH = readerRouteWithParams<{ contentId: string }, unknown>(
  ROUTE,
  async ({ ownerId, params, request }) => {
    const body = patchSchema.parse(await request.json());
    return setReadingStatus(ownerId, params.contentId, body.readingStatus);
  }
);
