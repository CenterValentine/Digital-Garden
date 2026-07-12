import { NextRequest, NextResponse } from "next/server";
import { withRouteTrace } from "@/lib/core/logger";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  dispatchWorkflow,
  isDispatchFailure,
  type DispatchErrorCode,
} from "@/extensions/workflows/server/dispatch";
import {
  errorResponse,
  handleRouteError,
} from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/workflows/dispatch";

const DISPATCH_ERROR_STATUS: Record<DispatchErrorCode, number> = {
  UNKNOWN_WORKFLOW: 404,
  WORKFLOW_DISABLED: 409,
  VALIDATION_ERROR: 400,
  ENGINE_ERROR: 502,
};

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const body = (await request.json().catch(() => ({}))) as {
        slug?: unknown;
        input?: unknown;
      };
      if (typeof body.slug !== "string" || body.slug.length === 0) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          "Body requires a workflow slug."
        );
      }
      const input = body.input === undefined ? {} : body.input;
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          "Workflow input must be an object."
        );
      }
      const result = await dispatchWorkflow(
        session.user.id,
        body.slug,
        input as Record<string, unknown>
      );
      if (isDispatchFailure(result)) {
        return errorResponse(
          DISPATCH_ERROR_STATUS[result.code],
          result.code,
          result.message
        );
      }
      return NextResponse.json({
        success: true,
        data: {
          runId: result.run.id,
          status: result.run.status,
          engine: result.run.engine,
        },
      });
    } catch (error) {
      return handleRouteError(error, "Failed to dispatch workflow");
    }
  });
}
