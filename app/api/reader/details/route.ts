/**
 * GET /api/reader/details?title=…&author=…&isbn=…&sourceId=…&entryId=…&openLibraryId=…&contentId=…
 * Enriched book details (description + where it came from, subjects, pages).
 * With contentId, empty BookMeta fields of that library book are back-filled.
 */

import { z } from "zod";
import { getBookDetails } from "@/lib/domain/reader/server/details";
import { readerRoute } from "@/lib/domain/reader/server/route";

const querySchema = z.object({
  title: z.string().min(1).max(1000),
  author: z.string().max(500).optional(),
  isbn: z.string().max(20).optional(),
  sourceId: z.string().max(200).optional(),
  entryId: z.string().max(2000).optional(),
  openLibraryId: z.string().max(40).optional(),
  contentId: z.string().uuid().optional(),
});

export const GET = readerRoute("/api/reader/details", async ({ ownerId, request }) => {
  const params = Object.fromEntries(
    [...new URL(request.url).searchParams.entries()].filter(([, value]) => value !== "")
  );
  return getBookDetails(ownerId, querySchema.parse(params));
});
