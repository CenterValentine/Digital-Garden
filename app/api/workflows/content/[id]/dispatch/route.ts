import { NextRequest, NextResponse } from "next/server";
import { withRouteTrace } from "@/lib/core/logger";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  DISPATCH_ERROR_STATUS,
  dispatchWorkflowFromContent,
  isDispatchFailure,
} from "@/extensions/workflows/server/dispatch";
import {
  errorResponse,
  handleRouteError,
} from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/workflows/content/[id]/dispatch";

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
        input?: unknown;
      };
      const input = body.input === undefined ? {} : body.input;
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          "Workflow input must be an object."
        );
      }
      const result = await dispatchWorkflowFromContent(
        session.user.id,
        id,
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
        data: { runId: result.run.id, status: result.run.status },
      });
    } catch (error) {
      return handleRouteError(error, "Failed to dispatch workflow");
    }
  });
}
