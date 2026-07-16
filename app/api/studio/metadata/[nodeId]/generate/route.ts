/**
 * Studio agentic metadata — generation.
 *
 * POST /api/studio/metadata/:nodeId/generate
 *   → { success, data: MetadataView }
 *
 * Regenerates the AI-owned sections (summary, structure) and writes the Role
 * & Strategy PROPOSAL for human review. Directives are never written. Model
 * comes from Feature Routing (`studio-metadata`); a 409 with a clear message
 * is returned when no compatible connection exists.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { logger, withRouteTrace } from "@/lib/core/logger";
import {
  generateMetadataForNode,
  StudioModelUnavailableError,
} from "@/extensions/studio/server/metadata";

const ROUTE_PATH = "/api/studio/metadata/[nodeId]/generate";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { nodeId } = await params;
      const view = await generateMetadataForNode(session.user.id, nodeId);
      if (!view) {
        return NextResponse.json(
          { success: false, error: "Content not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: view });
    } catch (error) {
      if (error instanceof StudioModelUnavailableError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 409 }
        );
      }
      if (
        error instanceof Error &&
        error.message === "Authentication required"
      ) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 }
        );
      }
      logger.error({
        layer: "ai",
        event: "studio:metadata:generate:caught",
        summary: `POST ${ROUTE_PATH} caught`,
        error,
      });
      return NextResponse.json(
        { success: false, error: "Generation failed" },
        { status: 500 }
      );
    }
  });
}
