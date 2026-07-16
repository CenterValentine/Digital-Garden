import { NextRequest, NextResponse } from "next/server";

import { withRouteTrace } from "@/lib/core/logger";
import { prisma } from "@/lib/database/client";
import { finishRun } from "@/extensions/workflows/server/runs";
import { isTerminalStatus } from "@/extensions/workflows/server/types";
import { errorResponse, handleRouteError } from "@/extensions/workflows/server/http";
import { requireServiceTokenAuth } from "@/extensions/workflows/server/service-token-http";
import { readJsonBody } from "@/extensions/workflows/server/callback";

const ROUTE_PATH = "/api/workflows/callback/error";

/**
 * Shared error-handler callback. The per-user "DG Error Handler" n8n workflow
 * POSTs here (Error Trigger → HTTP) with the failed n8n `engineExecutionId`.
 * We map it to the owner's run (whose `engineRunId` was stamped by the
 * "DG: Running" node) and mark it failed — the mechanism that un-sticks a run
 * whose n8n flow crashed. NOT per-run scoped (the handler has no runId), so it
 * PAT-auths at the user level, then owner-scopes the run lookup.
 */
export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { userId } = await requireServiceTokenAuth(request);
      const body = await readJsonBody(request);
      const engineExecutionId =
        typeof body.engineExecutionId === "string" ? body.engineExecutionId : "";
      if (!engineExecutionId) {
        return errorResponse(400, "VALIDATION_ERROR", "engineExecutionId is required.");
      }

      const run = await prisma.workflowRun.findFirst({
        where: { ownerId: userId, engineRunId: engineExecutionId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        // Nothing to fail (unknown execution, or the run was already reconciled).
        return NextResponse.json({ success: true, data: { matched: false } });
      }
      if (isTerminalStatus(run.status)) {
        return NextResponse.json({
          success: true,
          data: { matched: true, runId: run.id, alreadyTerminal: true },
        });
      }

      const message =
        typeof body.message === "string" && body.message
          ? body.message
          : "The n8n workflow errored.";
      await finishRun(run.id, { status: "failed", error: { message } });

      return NextResponse.json({
        success: true,
        data: { matched: true, runId: run.id, status: "failed" },
      });
    } catch (error) {
      return handleRouteError(error, "Failed to record workflow error");
    }
  });
}
