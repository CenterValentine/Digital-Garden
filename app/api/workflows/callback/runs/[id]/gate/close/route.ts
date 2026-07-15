import { NextRequest, NextResponse } from "next/server";

import { withRouteTrace } from "@/lib/core/logger";
import { closeGate } from "@/extensions/workflows/server/runs";
import {
  CallbackError,
  asRecord,
  handleCallbackError,
  readJsonBody,
  requireCallbackRun,
} from "@/extensions/workflows/server/callback";

const ROUTE_PATH = "/api/workflows/callback/runs/[id]/gate/close";

type Params = Promise<{ id: string }>;

/**
 * Engine callback: close a gate the engine resumed on its own (e.g. an n8n
 * auto-approval path). Human-approved gates normally resume through the app's
 * own resume route, which drives the engine; this is the inverse for
 * engine-initiated resumption. The run returns to `running`.
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
      if (typeof token !== "string" || token.length === 0) {
        throw new CallbackError(400, "VALIDATION_ERROR", "token is required.");
      }

      await closeGate(run.id, token, asRecord(body.resumePayload) ?? {});

      return NextResponse.json({
        success: true,
        data: { runId: run.id, status: "running" },
      });
    } catch (error) {
      return handleCallbackError(error, "Failed to close gate");
    }
  });
}
