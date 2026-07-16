import { NextRequest, NextResponse } from "next/server";
import { withRouteTrace } from "@/lib/core/logger";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import {
  DISPATCH_ERROR_STATUS,
  dispatchCaptureToUserWorkflow,
  dispatchCaptureToWorkflowContent,
  isDispatchFailure,
} from "@/extensions/workflows/server/dispatch";
import {
  errorResponse,
  handleRouteError,
} from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/integrations/browser-extension/workflow-dispatch";

/**
 * Extension capture → the USER'S OWN workflow graph. Two paths:
 * - `workflowId` present (popup chooser): dispatch exactly that workflow
 *   content node.
 * - `workflowId` absent (one-click / legacy): auto-route by URL pattern to
 *   the best-matching page-capture workflow (most recently updated enabled
 *   one; first capture auto-creates one from the template).
 * Both persist the rendered pageText as a capture note. The legacy `slug`
 * field is accepted and ignored — no hardened recipes remain.
 * Proxy-not-share: the extension never learns engine details.
 */
export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const record = await requireBrowserExtensionBearerAuth(request);
      const body = (await request.json().catch(() => ({}))) as {
        input?: unknown;
        workflowId?: unknown;
      };
      const input = body.input === undefined ? {} : body.input;
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          "Workflow input must be an object."
        );
      }
      // strict:false — narrow `unknown` via a typed local, not control flow.
      const workflowId: string | undefined =
        typeof body.workflowId === "string" ? body.workflowId : undefined;
      if (body.workflowId !== undefined && workflowId === undefined) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          "workflowId must be a string."
        );
      }
      const capture = input as Record<string, unknown>;
      const capturePayload = {
        pageUrl:
          typeof capture.pageUrl === "string" ? capture.pageUrl : undefined,
        pageTitle:
          typeof capture.pageTitle === "string" ? capture.pageTitle : undefined,
        pageText:
          typeof capture.pageText === "string" ? capture.pageText : undefined,
      };
      const result = workflowId
        ? await dispatchCaptureToWorkflowContent(
            record.user.id,
            workflowId,
            capturePayload
          )
        : await dispatchCaptureToUserWorkflow(record.user.id, capturePayload);
      if (isDispatchFailure(result)) {
        return errorResponse(
          DISPATCH_ERROR_STATUS[result.code],
          result.code,
          result.message
        );
      }
      // workflowNodeId comes from the run's input snapshot (content runs carry
      // { graph, data, workflowNodeId }) — lets the pill's [View] deep-open the
      // workflow even for auto-routed dispatches where the caller sent no id.
      const runInput = result.run.input as Record<string, unknown> | null;
      const dispatchedNodeId =
        runInput && typeof runInput.workflowNodeId === "string"
          ? runInput.workflowNodeId
          : null;
      return NextResponse.json({
        success: true,
        data: {
          runId: result.run.id,
          status: result.run.status,
          workflowNodeId: dispatchedNodeId,
        },
      });
    } catch (error) {
      return handleRouteError(error, "Failed to dispatch workflow");
    }
  });
}
