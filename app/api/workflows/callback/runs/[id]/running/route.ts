import { NextRequest, NextResponse } from "next/server";

import { withRouteTrace } from "@/lib/core/logger";
import { markRunning, setEngineRunId } from "@/extensions/workflows/server/runs";
import {
  handleCallbackError,
  readJsonBody,
  requireCallbackRun,
} from "@/extensions/workflows/server/callback";

const ROUTE_PATH = "/api/workflows/callback/runs/[id]/running";

type Params = Promise<{ id: string }>;

/**
 * Engine callback: mark a queued/waiting run as running. May also record the
 * engine-side execution id (`engineExecutionId`) — the seed's "DG: Running"
 * node sends n8n's `$execution.id` so the shared error handler can later map a
 * failed execution back to this run.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { id } = await params;
      const { run } = await requireCallbackRun(request, id);
      await markRunning(run.id);
      const body = await readJsonBody(request);
      if (typeof body.engineExecutionId === "string" && body.engineExecutionId) {
        await setEngineRunId(run.id, body.engineExecutionId);
      }
      return NextResponse.json({
        success: true,
        data: { runId: run.id, status: "running" },
      });
    } catch (error) {
      return handleCallbackError(error, "Failed to mark run running");
    }
  });
}
