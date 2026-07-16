import { NextRequest, NextResponse } from "next/server";

import { withRouteTrace } from "@/lib/core/logger";
import { openGate } from "@/extensions/workflows/server/runs";
import type { WorkflowGateSummary } from "@/extensions/workflows/server/types";
import {
  CallbackError,
  asRecord,
  handleCallbackError,
  readJsonBody,
  requireCallbackRun,
} from "@/extensions/workflows/server/callback";

const ROUTE_PATH = "/api/workflows/callback/runs/[id]/gate";

type Params = Promise<{ id: string }>;

/**
 * Engine callback: open a supervision gate. The run goes to `waiting`, an
 * inbox notification fires, and `engineGateRef` stores the engine-side resume
 * handle (e.g. an n8n Wait resume URL) so the app's resume path can wake it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { id } = await params;
      const { run } = await requireCallbackRun(request, id);
      const body = await readJsonBody(request);

      const token = body.token;
      const title = body.title;
      if (typeof token !== "string" || token.length === 0) {
        throw new CallbackError(400, "VALIDATION_ERROR", "token is required.");
      }
      if (typeof title !== "string" || title.length === 0) {
        throw new CallbackError(400, "VALIDATION_ERROR", "title is required.");
      }

      const summary: WorkflowGateSummary = {
        title,
        body: typeof body.body === "string" ? body.body : undefined,
        data: asRecord(body.data),
      };
      const engineGateRef =
        typeof body.engineGateRef === "string" ? body.engineGateRef : undefined;

      await openGate(run.id, token, summary, engineGateRef);

      return NextResponse.json({
        success: true,
        data: { runId: run.id, gateToken: token, status: "waiting" },
      });
    } catch (error) {
      return handleCallbackError(error, "Failed to open gate");
    }
  });
}
