/**
 * GET /api/crm/[folderId] — the CRM snapshot every view projects from.
 * Folder view access + read access on every bound table, or 404.
 */

import type { NextRequest } from "next/server";
import { crmNotFound, crmOk, crmRoute } from "@/extensions/crm/server/http";
import { loadCrmWorkspace } from "@/extensions/crm/server/workspace";

type Params = Promise<{ folderId: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  return crmRoute(request, "/api/crm/[folderId]", async (userId) => {
    const { folderId } = await params;
    const snapshot = await loadCrmWorkspace(folderId, userId);
    return snapshot ? crmOk(snapshot) : crmNotFound();
  });
}
