/**
 * PUT /api/crm/[folderId]/drafts — save (or, with an empty body, clear) the
 * reply draft for one contact. { contactId, opportunityId?, body }
 */

import type { NextRequest } from "next/server";
import { crmError, crmOk, crmRoute, readJson } from "@/extensions/crm/server/http";
import { saveReplyDraft } from "@/extensions/crm/server/actions";

type Params = Promise<{ folderId: string }>;

export async function PUT(request: NextRequest, { params }: { params: Params }) {
  return crmRoute(request, "/api/crm/[folderId]/drafts", async (userId) => {
    const { folderId } = await params;
    const body = await readJson(request);
    if (typeof body.contactId !== "string" || typeof body.body !== "string") {
      return crmError(400, "VALIDATION_ERROR", "`contactId` and `body` are required");
    }
    const result = await saveReplyDraft(folderId, userId, {
      contactId: body.contactId,
      opportunityId: typeof body.opportunityId === "string" ? body.opportunityId : null,
      body: body.body,
    });
    return crmOk(result);
  });
}
