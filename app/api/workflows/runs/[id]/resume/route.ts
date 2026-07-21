import { NextRequest, NextResponse } from "next/server";
import { logger, withRouteTrace } from "@/lib/core/logger";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getEngineAdapter } from "@/extensions/workflows/server/engines/registry";
import { getRunForOwner } from "@/extensions/workflows/server/runs";
import {
  errorResponse,
  handleRouteError,
} from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/workflows/runs/[id]/resume";

type Params = Promise<{ id: string }>;

export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;
      const body = (await request.json().catch(() => ({}))) as {
        token?: unknown;
        payload?: unknown;
      };
      if (typeof body.token !== "string" || body.token.length === 0) {
        return errorResponse(400, "VALIDATION_ERROR", "Body requires a gate token.");
      }
      const payload = body.payload === undefined ? {} : body.payload;
      if (
        typeof payload !== "object" ||
        payload === null ||
        Array.isArray(payload)
      ) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          "Resume payload must be an object."
        );
      }

      const run = await getRunForOwner(id, session.user.id);
      if (!run) {
        return errorResponse(404, "NOT_FOUND", "Workflow run not found.");
      }
      if (run.status !== "waiting" || run.gateToken !== body.token) {
        return errorResponse(
          409,
          "GATE_MISMATCH",
          "Run is not waiting on this gate."
        );
      }

      const adapter = getEngineAdapter(run.engine);
      if (!adapter) {
        return errorResponse(
          502,
          "ENGINE_ERROR",
          `No engine adapter registered for "${run.engine}".`
        );
      }
      try {
        await adapter.resumeGate(
          run,
          body.token,
          payload as Record<string, unknown>
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Engine resume failed.";
        logger.error({
          layer: "route",
          event: "workflows_resume:engine_resume_failed",
          summary: message,
          attrs: { runId: run.id, engine: run.engine },
        });
        return errorResponse(502, "ENGINE_ERROR", message);
      }

      return NextResponse.json({
        success: true,
        data: { runId: run.id, accepted: true },
      });
    } catch (error) {
      return handleRouteError(error, "Failed to resume workflow run");
    }
  });
}
