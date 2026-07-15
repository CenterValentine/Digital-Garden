import { NextRequest, NextResponse } from "next/server";
import { logger, withRouteTrace } from "@/lib/core/logger";
import { prisma } from "@/lib/database/client";
import { Prisma } from "@/lib/database/generated/prisma";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { workflowGraphSchema } from "@/extensions/workflows/graph/schema";
import { validateGraph } from "@/extensions/workflows/graph/validate";
import { N8N_PAYLOAD_ENGINE } from "@/extensions/workflows/server/engines/n8n/meta";
import { pushWorkflowToN8n } from "@/extensions/workflows/server/engines/n8n/push";
import {
  errorResponse,
  handleRouteError,
} from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/workflows/content/[id]/graph";

type Params = Promise<{ id: string }>;

async function loadWorkflowNode(id: string, ownerId: string) {
  return prisma.contentNode.findFirst({
    where: { id, ownerId, contentType: "workflow", deletedAt: null },
    select: {
      id: true,
      title: true,
      workflowPayload: {
        select: { engine: true, definition: true, enabled: true },
      },
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;
      const node = await loadWorkflowNode(id, session.user.id);
      if (!node?.workflowPayload) {
        return errorResponse(404, "NOT_FOUND", "Workflow not found.");
      }
      return NextResponse.json({
        success: true,
        data: {
          id: node.id,
          title: node.title,
          engine: node.workflowPayload.engine,
          enabled: node.workflowPayload.enabled,
          graph: node.workflowPayload.definition,
        },
      });
    } catch (error) {
      return handleRouteError(error, "Failed to load workflow");
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;
      const node = await loadWorkflowNode(id, session.user.id);
      if (!node?.workflowPayload) {
        return errorResponse(404, "NOT_FOUND", "Workflow not found.");
      }
      const body = (await request.json().catch(() => ({}))) as {
        graph?: unknown;
      };
      const parsed = workflowGraphSchema.safeParse(body.graph);
      if (!parsed.success) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          `Graph is invalid: ${parsed.error.issues[0]?.message ?? "schema error"}`
        );
      }
      const structural = validateGraph(parsed.data);
      if (!structural.valid) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "GRAPH_INVALID",
              message: "Graph failed validation.",
              issues: structural.issues,
            },
          },
          { status: 400 }
        );
      }
      await prisma.workflowPayload.update({
        where: { contentId: node.id },
        data: {
          definition: parsed.data as unknown as Prisma.InputJsonValue,
        },
      });

      // Already an n8n workflow → keep n8n in sync on Save. Best-effort: a push
      // failure surfaces in the response but doesn't fail the save itself.
      let n8n: { pushed: boolean; error?: string } = { pushed: false };
      if (node.workflowPayload.engine === N8N_PAYLOAD_ENGINE) {
        try {
          await pushWorkflowToN8n(session.user.id, node.id);
          n8n = { pushed: true };
        } catch (error) {
          const message = error instanceof Error ? error.message : "push failed";
          logger.warn({
            layer: "route",
            event: "workflows_graph_save:n8n_push_failed",
            summary: message,
            attrs: { contentId: node.id },
          });
          n8n = { pushed: false, error: message };
        }
      }
      return NextResponse.json({ success: true, data: { saved: true, n8n } });
    } catch (error) {
      return handleRouteError(error, "Failed to save workflow");
    }
  });
}
