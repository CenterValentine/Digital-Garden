import { NextRequest, NextResponse } from "next/server";

import { withRouteTrace } from "@/lib/core/logger";
import { prisma } from "@/lib/database/client";
import { recordEvent } from "@/extensions/workflows/server/runs";
import { getNodeExecutor } from "@/extensions/workflows/nodes/registry";
import {
  CallbackError,
  asRecord,
  handleCallbackError,
  readJsonBody,
  requireCallbackRun,
} from "@/extensions/workflows/server/callback";

const ROUTE_PATH = "/api/workflows/callback/runs/[id]/execute-node";

type Params = Promise<{ id: string }>;

const TEXT_OUTPUT_CAP = 16000;

/**
 * Execute one DG node's logic and return its outputs. This is the seam that
 * keeps "proxy-not-share" intact when n8n is the engine: n8n compiles each DG
 * node to an HTTP Request that calls here with the node's config already
 * resolved (via n8n expressions), the app runs the SAME executor the WDK
 * interpreter uses (BYOK AI, note/doc writes, etc.), and returns the outputs
 * for n8n to thread onward. Control nodes (gate/delay/branch) are NOT executed
 * here — n8n handles those natively (Wait/IF).
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

      const nodeId = body.nodeId;
      const nodeType = body.nodeType;
      if (typeof nodeId !== "string" || nodeId.length === 0) {
        throw new CallbackError(400, "VALIDATION_ERROR", "nodeId is required.");
      }
      if (typeof nodeType !== "string" || nodeType.length === 0) {
        throw new CallbackError(400, "VALIDATION_ERROR", "nodeType is required.");
      }

      const executor = getNodeExecutor(nodeType);
      if (!executor) {
        // Control/trigger types have no executor — reject rather than 500.
        throw new CallbackError(
          400,
          "VALIDATION_ERROR",
          `Node type "${nodeType}" has no server executor (control/trigger nodes run in the engine).`
        );
      }

      const definition = await prisma.workflowDefinition.findUnique({
        where: { id: run.definitionId },
        select: { name: true },
      });

      const outputs = await executor(
        {
          runId: run.id,
          ownerId: run.ownerId,
          workflowName: definition?.name ?? "Workflow",
          input: (run.input ?? {}) as Record<string, unknown>,
          // n8n already resolved interpolation into `config`, so prior-node
          // outputs aren't needed here (unlike the in-process interpreter).
          nodes: {},
        },
        asRecord(body.config) ?? {}
      );

      if (typeof outputs.text === "string" && outputs.text.length > TEXT_OUTPUT_CAP) {
        outputs.text = outputs.text.slice(0, TEXT_OUTPUT_CAP);
        outputs.textTruncated = true;
      }

      await recordEvent({
        runId: run.id,
        type: "step.completed",
        key: `node:${nodeId}`,
        stepName: nodeId,
        payload: {
          nodeType,
          outputKeys: Object.keys(outputs),
          engine: run.engine,
        },
      });

      return NextResponse.json({ success: true, data: { outputs } });
    } catch (error) {
      return handleCallbackError(error, "Failed to execute node");
    }
  });
}
