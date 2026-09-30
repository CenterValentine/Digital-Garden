/** GET /api/reader/scriptures/[corpusId]/contents → volumes and books. */

import { readerRouteWithParams } from "@/lib/domain/reader/server/route";
import { getContents } from "@/lib/domain/scripture/server/corpus";

export const GET = readerRouteWithParams<{ corpusId: string }, unknown>(
  "/api/reader/scriptures/[corpusId]/contents",
  async ({ params }) => getContents(params.corpusId)
);
