import { NextRequest, NextResponse } from "next/server";
import { logger, withRouteTrace } from "@/lib/core/logger";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getEngineAdapter } from "@/extensions/workflows/server/engines/registry";
import { finishRun, getRunForOwner } from "@/extensions/workflows/server/runs";
import { isTerminalStatus } from "@/extensions/workflows/server/types";
import {
  errorResponse,
  handleRouteError,
} from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/workflows/runs/[id]/cancel";

type Params = Promise<{ id: string }>;

export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;
      const run = await getRunForOwner(id, session.user.id);
      if (!run) {
        return errorResponse(404, "NOT_FOUND", "Workflow run not found.");
      }
      if (isTerminalStatus(run.status)) {
        return errorResponse(
          409,
          "ALREADY_FINISHED",
          `Run already ${run.status}.`
        );
      }

      // Engine-side cancel is best-effort; the run record is the truth.
      const adapter = getEngineAdapter(run.engine);
      if (adapter) {
        try {
          await adapter.cancel(run);
        } catch (error) {
          logger.warn({
            layer: "route",
            event: "workflows_cancel:engine_cancel_failed",
            summary: error instanceof Error ? error.message : String(error),
            attrs: { runId: run.id, engine: run.engine },
          });
        }
      }
      await finishRun(run.id, { status: "canceled" });

      return NextResponse.json({
        success: true,
        data: { runId: run.id, status: "canceled" },
      });
    } catch (error) {
      return handleRouteError(error, "Failed to cancel workflow run");
    }
  });
}
