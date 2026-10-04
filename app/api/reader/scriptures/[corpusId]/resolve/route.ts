/**
 * GET /api/reader/scriptures/[corpusId]/resolve?ref=Alma+32:21-23 → parsed
 * references with their verse text (links, quotes, AI).
 */

import { z } from "zod";
import { readerRouteWithParams } from "@/lib/domain/reader/server/route";
import { resolveReferences } from "@/lib/domain/scripture/server/corpus";

const querySchema = z.object({ ref: z.string().trim().min(1).max(300) });

export const GET = readerRouteWithParams<{ corpusId: string }, unknown>(
  "/api/reader/scriptures/[corpusId]/resolve",
  async ({ params, request }) => {
    const { ref } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return { references: await resolveReferences(params.corpusId, ref) };
  }
);
