/**
 * POST /api/reader/acquire
 * { sourceId, entry, acquisitionIndex?, parentId? }
 *
 * Downloads a DRM-free book into the user's library folder (or `parentId`)
 * as an ordinary file node + BookMeta. 422 when the file is copy-protected.
 */

import { z } from "zod";
import { catalogEntrySchema as entrySchema } from "@/lib/domain/reader/server/schemas";
import { acquireBook } from "@/lib/domain/reader/server/library";
import { readerRoute } from "@/lib/domain/reader/server/route";

const bodySchema = z.object({
  sourceId: z.string().min(1).max(200),
  entry: entrySchema,
  acquisitionIndex: z.number().int().min(0).max(19).optional(),
  parentId: z.string().uuid().nullish(),
});

export const POST = readerRoute("/api/reader/acquire", async ({ ownerId, request }) => {
  const body = bodySchema.parse(await request.json());
  return acquireBook({
    ownerId,
    sourceId: body.sourceId,
    entry: body.entry,
    acquisitionIndex: body.acquisitionIndex,
    parentId: body.parentId ?? null,
  });
});
