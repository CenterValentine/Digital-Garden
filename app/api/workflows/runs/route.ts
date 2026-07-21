import { NextRequest, NextResponse } from "next/server";
import { withRouteTrace } from "@/lib/core/logger";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { WorkflowRunStatus } from "@/lib/database/generated/prisma";
import { listRunsForOwner } from "@/extensions/workflows/server/runs";
import {
  errorResponse,
  handleRouteError,
} from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/workflows/runs";

function isWorkflowRunStatus(value: string): value is WorkflowRunStatus {
  return (Object.values(WorkflowRunStatus) as string[]).includes(value);
}

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
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
      const runs = await listRunsForOwner(session.user.id, {
        status,
        limit,
      });
      return NextResponse.json({ success: true, data: { runs } });
    } catch (error) {
      return handleRouteError(error, "Failed to list workflow runs");
    }
  });
}
