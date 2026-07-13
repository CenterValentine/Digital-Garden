import { NextRequest, NextResponse } from "next/server";
import { withRouteTrace } from "@/lib/core/logger";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import {
  DISPATCH_ERROR_STATUS,
  dispatchCaptureToUserWorkflow,
  isDispatchFailure,
} from "@/extensions/workflows/server/dispatch";
import {
  errorResponse,
  handleRouteError,
} from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/integrations/browser-extension/workflow-dispatch";

/**
 * Extension capture → the USER'S OWN workflow graph (most recently updated
 * enabled one; first capture auto-creates one from the template). The
 * legacy `slug` field is accepted and ignored — no hardened recipes remain.
 * Proxy-not-share: the extension never learns engine details.
 */
export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const record = await requireBrowserExtensionBearerAuth(request);
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
      const capture = input as Record<string, unknown>;
      const result = await dispatchCaptureToUserWorkflow(record.user.id, {
        pageUrl:
          typeof capture.pageUrl === "string" ? capture.pageUrl : undefined,
        pageTitle:
          typeof capture.pageTitle === "string" ? capture.pageTitle : undefined,
        pageText:
          typeof capture.pageText === "string" ? capture.pageText : undefined,
      });
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
