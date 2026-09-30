/**
 * GET /api/reader/scriptures/[corpusId]/search?q=faith → the passage when the
 * query is a reference, plus phrase matches in canonical order.
 */

import { z } from "zod";
import { readerRouteWithParams } from "@/lib/domain/reader/server/route";
import { searchCorpus } from "@/lib/domain/scripture/server/corpus";

const querySchema = z.object({ q: z.string().trim().min(1).max(200) });

export const GET = readerRouteWithParams<{ corpusId: string }, unknown>(
  "/api/reader/scriptures/[corpusId]/search",
  async ({ params, request }) => {
    const { q } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return searchCorpus(params.corpusId, q);
  }
);
