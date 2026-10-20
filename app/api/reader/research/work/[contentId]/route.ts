/**
 * GET /api/reader/research/work/[contentId] — a saved research node as the
 * reader opens it (RESEARCH-READER-PLAN.md §7.2): the Work rebuilt from its
 * WorkMeta row, its copy policy, and the on-demand copy when there is one.
 */

import { readerRouteWithParams } from "@/lib/domain/reader/server/route";
import { isUuid } from "@/lib/domain/content/uuid";
import { ResearchError } from "@/lib/domain/research/server/service";
import { getResearchWorkNode } from "@/lib/domain/research/server/work";

export const GET = readerRouteWithParams<{ contentId: string }, unknown>(
  "/api/reader/research/work/[contentId]",
  async ({ ownerId, params }) => {
    if (!isUuid(params.contentId)) throw new ResearchError("Not a content id", 400);
    return getResearchWorkNode(ownerId, params.contentId);
  }
);
