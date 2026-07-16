import { NextRequest, NextResponse } from "next/server";

import { withRouteTrace } from "@/lib/core/logger";
import { finishRun } from "@/extensions/workflows/server/runs";
import {
  TERMINAL_RUN_STATUSES,
  isTerminalStatus,
} from "@/extensions/workflows/server/types";
import {
  CallbackError,
  asRecord,
  handleCallbackError,
  readJsonBody,
  requireCallbackRun,
} from "@/extensions/workflows/server/callback";

const ROUTE_PATH = "/api/workflows/callback/runs/[id]/finish";

type Params = Promise<{ id: string }>;

type TerminalStatus = (typeof TERMINAL_RUN_STATUSES)[number];

/**
 * Engine callback: transition a run to a terminal status. Rejects an
 * already-finished run (409) so a retrying engine can't re-fire the
 * "finished" notification or overwrite the recorded outcome.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { id } = await params;
      const { run } = await requireCallbackRun(request, id);

      if (isTerminalStatus(run.status)) {
        throw new CallbackError(
          409,
          "ALREADY_FINISHED",
          `Run already ${run.status}.`
        );
      }

      const body = await readJsonBody(request);
      const status = body.status;
      if (
        typeof status !== "string" ||
        !(TERMINAL_RUN_STATUSES as readonly string[]).includes(status)
      ) {
        throw new CallbackError(
          400,
          "VALIDATION_ERROR",
          `status must be one of: ${TERMINAL_RUN_STATUSES.join(", ")}`
        );
      }

      await finishRun(run.id, {
        status: status as TerminalStatus,
        output: asRecord(body.output),
        error: asRecord(body.error),
      });

      return NextResponse.json({
        success: true,
        data: { runId: run.id, status },
      });
    } catch (error) {
      return handleCallbackError(error, "Failed to finish run");
    }
  });
}
