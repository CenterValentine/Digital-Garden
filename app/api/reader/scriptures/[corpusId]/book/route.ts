/** GET /api/reader/scriptures/[corpusId]/book?book=alma → the book's chapters as cards. */

import { z } from "zod";
import { readerRouteWithParams } from "@/lib/domain/reader/server/route";
import { getBookChapters } from "@/lib/domain/scripture/server/corpus";

const querySchema = z.object({ book: z.string().regex(/^[a-z0-9-]{1,40}$/) });

export const GET = readerRouteWithParams<{ corpusId: string }, unknown>(
  "/api/reader/scriptures/[corpusId]/book",
  async ({ params, request }) => {
    const { book } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return getBookChapters(params.corpusId, book);
  }
);
