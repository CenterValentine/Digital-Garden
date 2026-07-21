import { NextRequest, NextResponse } from "next/server";

import { withRouteTrace } from "@/lib/core/logger";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { pushWorkflowToN8n } from "@/extensions/workflows/server/engines/n8n/push";
import { handleRouteError } from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/workflows/content/[id]/push-n8n";

type Params = Promise<{ id: string }>;

/**
 * Compile this workflow's graph → n8n and push it (create/update + activate),
 * flipping the workflow to the n8n engine. Session-authed; owner-scoped inside
 * pushWorkflowToN8n. Returns the n8n workflow id + a deep link to view it.
 * (Until the S4 engine selector lands, this is how a workflow becomes n8n.)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;
      const result = await pushWorkflowToN8n(session.user.id, id);
      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      return handleRouteError(error, "Failed to push workflow to n8n");
    }
  });
}
