/**
 * POST /api/reader/shelf { contentId, parentId? }
 * "+ → Reader → Books → <book>": place a shortcut to the book where the "+"
 * pointed (resolved client-side with the tree's create rule; null = top).
 */

import { z } from "zod";
import { readerRoute } from "@/lib/domain/reader/server/route";
import { placeBookShortcut } from "@/lib/domain/reader/server/shelf";

const bodySchema = z.object({
  contentId: z.string().uuid(),
  parentId: z.string().uuid().nullish(),
});

export const POST = readerRoute("/api/reader/shelf", async ({ ownerId, request }) => {
  const body = bodySchema.parse(await request.json());
  return placeBookShortcut(ownerId, {
    contentId: body.contentId,
    parentId: body.parentId ?? null,
  });
});
