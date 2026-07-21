import { NextRequest, NextResponse } from "next/server";

import { withRouteTrace } from "@/lib/core/logger";
import { recordEvent } from "@/extensions/workflows/server/runs";
import type { WorkflowRunEventType } from "@/extensions/workflows/server/types";
import {
  CallbackError,
  asRecord,
  handleCallbackError,
  readJsonBody,
  requireCallbackRun,
} from "@/extensions/workflows/server/callback";

const ROUTE_PATH = "/api/workflows/callback/runs/[id]/events";

type Params = Promise<{ id: string }>;

/**
 * Progress vocabulary an engine may report. Structural events
 * (run.dispatched / gate.opened / gate.resumed / artifact.created /
 * run.finished) are emitted ONLY by their dedicated callbacks so their side
 * effects (status transitions, notifications) can't be forged out of band.
 */
const ENGINE_REPORTABLE: readonly WorkflowRunEventType[] = [
  "step.started",
  "step.completed",
  "log",
];

/** Engine callback: append a progress event to the run timeline (idempotent by `key`). */
export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { id } = await params;
      const { run } = await requireCallbackRun(request, id);
      const body = await readJsonBody(request);

      const type = body.type;
      if (
        typeof type !== "string" ||
        !ENGINE_REPORTABLE.includes(type as WorkflowRunEventType)
      ) {
        throw new CallbackError(
          400,
          "VALIDATION_ERROR",
          `type must be one of: ${ENGINE_REPORTABLE.join(", ")}`
        );
      }

      const event = await recordEvent({
        runId: run.id,
        type: type as WorkflowRunEventType,
        key: typeof body.key === "string" ? body.key : undefined,
        stepName: typeof body.stepName === "string" ? body.stepName : undefined,
        payload: asRecord(body.payload),
      });

      return NextResponse.json({
        success: true,
        data: { id: event.id, seq: event.seq, type: event.type },
      });
    } catch (error) {
      return handleCallbackError(error, "Failed to record event");
    }
  });
}
