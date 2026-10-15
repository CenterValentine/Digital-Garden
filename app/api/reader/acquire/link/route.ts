/**
 * POST /api/reader/acquire/link { sourceId, entry, parentId? }
 * Add a catalog book with no free download to the library as a reference:
 * an external link to its source page + BookMeta (details, AI context,
 * shelving all work). Lands where the "+" pointed.
 */

import { z } from "zod";
import { addLinkBook } from "@/lib/domain/reader/server/library";
import { readerRoute } from "@/lib/domain/reader/server/route";
import { catalogEntrySchema } from "@/lib/domain/reader/server/schemas";

const bodySchema = z.object({
  sourceId: z.string().min(1).max(200),
  entry: catalogEntrySchema,
  parentId: z.string().uuid().nullish(),
});

export const POST = readerRoute("/api/reader/acquire/link", async ({ ownerId, request }) => {
  const body = bodySchema.parse(await request.json());
  return addLinkBook({
    ownerId,
    sourceId: body.sourceId,
    entry: body.entry,
    parentId: body.parentId ?? null,
  });
});
