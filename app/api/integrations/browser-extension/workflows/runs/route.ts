import { NextRequest, NextResponse } from "next/server";
import { withRouteTrace } from "@/lib/core/logger";
import { WorkflowRunStatus } from "@/lib/database/generated/prisma";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import { listRunsForOwner } from "@/extensions/workflows/server/runs";
import {
  errorResponse,
  handleRouteError,
} from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/integrations/browser-extension/workflows/runs";

function isWorkflowRunStatus(value: string): value is WorkflowRunStatus {
  return (Object.values(WorkflowRunStatus) as string[]).includes(value);
}

/**
 * Compact runs feed for the extension's badge poll and popup list. Returns
 * `ExtensionRunListItem[]` — a deliberate subset of WorkflowRunDto (no input,
 * output, events, or artifacts; the deep embed surface reads those with a
 * session). `needsReview` pre-computes the gate flag so the extension never
 * learns gate-token semantics.
 */
export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const record = await requireBrowserExtensionBearerAuth(request);
      const statusParam = request.nextUrl.searchParams.get("status");
      let status: WorkflowRunStatus | undefined;
      if (statusParam !== null) {
        if (!isWorkflowRunStatus(statusParam)) {
          return errorResponse(
            400,
            "VALIDATION_ERROR",
            `Unknown status "${statusParam}".`
          );
        }
        status = statusParam;
      }
      const limitParam = request.nextUrl.searchParams.get("limit");
      const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
      if (limit !== undefined && Number.isNaN(limit)) {
        return errorResponse(400, "VALIDATION_ERROR", "limit must be a number.");
      }

      const runs = await listRunsForOwner(record.user.id, { status, limit });
      return NextResponse.json({
        success: true,
        data: {
          runs: runs.map((run) => ({
            id: run.id,
            status: run.status,
            workflowName: run.definition.name,
            needsReview: run.status === "waiting" && run.gateToken !== null,
            createdAt: run.createdAt.toISOString(),
            finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
          })),
        },
      });
    } catch (error) {
      return handleRouteError(error, "Failed to list workflow runs");
    }
  });
}
