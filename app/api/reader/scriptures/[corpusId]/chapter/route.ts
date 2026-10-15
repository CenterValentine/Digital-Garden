/** GET /api/reader/scriptures/[corpusId]/chapter?book=alma&chapter=32 */

import { z } from "zod";
import { readerRouteWithParams } from "@/lib/domain/reader/server/route";
import { getChapter } from "@/lib/domain/scripture/server/corpus";

const querySchema = z.object({
  book: z.string().regex(/^[a-z0-9-]{1,40}$/),
  chapter: z.coerce.number().int().min(1).max(500),
});

export const GET = readerRouteWithParams<{ corpusId: string }, unknown>(
  "/api/reader/scriptures/[corpusId]/chapter",
  async ({ params, request }) => {
    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return getChapter(params.corpusId, query.book, query.chapter);
  }
);
