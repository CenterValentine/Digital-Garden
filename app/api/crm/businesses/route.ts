/**
 * GET  /api/crm/businesses  — the caller's CRM business folders
 * POST /api/crm/businesses  — set up a business: folder + linked databases + config
 *      { name, presetId, parentId? }
 */

import type { NextRequest } from "next/server";
import { crmError, crmOk, crmRoute, readJson } from "@/extensions/crm/server/http";
import { listCrmBusinesses } from "@/extensions/crm/server/workspace";
import { createCrmBusiness } from "@/extensions/crm/server/setup";

const ROUTE = "/api/crm/businesses";

export async function GET(request: NextRequest) {
  return crmRoute(request, ROUTE, async (userId) => crmOk(await listCrmBusinesses(userId)));
}

export async function POST(request: NextRequest) {
  return crmRoute(request, ROUTE, async (userId) => {
    const body = await readJson(request);
    if (typeof body.name !== "string" || typeof body.presetId !== "string") {
      return crmError(400, "VALIDATION_ERROR", "`name` and `presetId` are required");
    }
    const created = await createCrmBusiness(userId, {
      name: body.name,
      presetId: body.presetId,
      parentId: typeof body.parentId === "string" ? body.parentId : null,
    });
    return crmOk({ folderId: created.folderId });
  });
}
