/**
 * POST /api/crm/[folderId]/stage — move an opportunity to a stage and record
 * the move in its activity. { opportunityId, stageId }
 */

import type { NextRequest } from "next/server";
import { crmError, crmOk, crmRoute, readJson } from "@/extensions/crm/server/http";
import { setOpportunityStage } from "@/extensions/crm/server/actions";

type Params = Promise<{ folderId: string }>;

export async function POST(request: NextRequest, { params }: { params: Params }) {
  return crmRoute(request, "/api/crm/[folderId]/stage", async (userId) => {
    const { folderId } = await params;
    const body = await readJson(request);
    if (typeof body.opportunityId !== "string" || typeof body.stageId !== "string") {
      return crmError(400, "VALIDATION_ERROR", "`opportunityId` and `stageId` are required");
    }
    return crmOk(
      await setOpportunityStage(folderId, userId, {
        opportunityId: body.opportunityId,
        stageId: body.stageId,
      })
    );
  });
}
