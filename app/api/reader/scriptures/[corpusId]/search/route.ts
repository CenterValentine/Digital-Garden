/**
 * GET /api/reader/scriptures/[corpusId]/search?q=faith&mode=smart&volume=bofm&sort=relevance
 * → the passage when the query is a reference, books whose names match, and
 * verses matched as words (see searchCorpus for the modes).
 */

import { z } from "zod";
import { readerRouteWithParams } from "@/lib/domain/reader/server/route";
import { searchCorpus } from "@/lib/domain/scripture/server/corpus";

const querySchema = z.object({
  q: z.string().trim().min(1).max(200),
  mode: z.enum(["smart", "exact", "all", "any"]).optional(),
  volume: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  sort: z.enum(["relevance", "canonical"]).optional(),
});

export const GET = readerRouteWithParams<{ corpusId: string }, unknown>(
  "/api/reader/scriptures/[corpusId]/search",
  async ({ params, request }) => {
    const { q, ...options } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return searchCorpus(params.corpusId, q, options);
  }
);
