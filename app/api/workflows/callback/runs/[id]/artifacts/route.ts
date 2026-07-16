import { NextRequest, NextResponse } from "next/server";

import { withRouteTrace } from "@/lib/core/logger";
import { prisma } from "@/lib/database/client";
import { attachArtifact } from "@/extensions/workflows/server/runs";
import type { WorkflowArtifactKind } from "@/extensions/workflows/server/types";
import {
  CallbackError,
  handleCallbackError,
  readJsonBody,
  requireCallbackRun,
} from "@/extensions/workflows/server/callback";

const ROUTE_PATH = "/api/workflows/callback/runs/[id]/artifacts";

type Params = Promise<{ id: string }>;

const ARTIFACT_KINDS: readonly WorkflowArtifactKind[] = [
  "document",
  "note",
  "file",
];

/**
 * Engine callback: attach a content node the run produced as an artifact.
 * The content node must belong to the token's owner — a "wide" token can't
 * attach another user's content into its own run.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { id } = await params;
      const { userId, run } = await requireCallbackRun(request, id);
      const body = await readJsonBody(request);

      const contentNodeId = body.contentNodeId;
      const kind = body.kind;
      const label = body.label;
      if (typeof contentNodeId !== "string" || contentNodeId.length === 0) {
        throw new CallbackError(
          400,
          "VALIDATION_ERROR",
          "contentNodeId is required."
        );
      }
      if (typeof kind !== "string" || !ARTIFACT_KINDS.includes(kind as WorkflowArtifactKind)) {
        throw new CallbackError(
          400,
          "VALIDATION_ERROR",
          `kind must be one of: ${ARTIFACT_KINDS.join(", ")}`
        );
      }

      const owned = await prisma.contentNode.findFirst({
        where: { id: contentNodeId, ownerId: userId },
        select: { id: true },
      });
      if (!owned) {
        throw new CallbackError(404, "NOT_FOUND", "Content node not found.");
      }

      await attachArtifact(
        run.id,
        contentNodeId,
        kind as WorkflowArtifactKind,
        typeof label === "string" && label.length > 0 ? label : "Artifact"
      );

      return NextResponse.json({
        success: true,
        data: { runId: run.id, contentNodeId },
      });
    } catch (error) {
      return handleCallbackError(error, "Failed to attach artifact");
    }
  });
}
