/**
 * Studio tool prompt composition.
 *
 * POST /api/studio/tools/compose
 *   body: { toolId: string; variantId?: string; folderId: string }
 *   → { success, data: { prompt, suggestedTitle } }
 *
 * Deterministic assembly (no LLM call) — see server/tool-prompts.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { logger, withRouteTrace } from "@/lib/core/logger";
import { composeToolPrompt } from "@/extensions/studio/server/tool-prompts";

const ROUTE_PATH = "/api/studio/tools/compose";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const body = (await request.json()) as {
        toolId?: unknown;
        variantId?: unknown;
        folderId?: unknown;
      };
      if (typeof body.toolId !== "string" || typeof body.folderId !== "string") {
        return NextResponse.json(
          { success: false, error: "toolId and folderId are required" },
          { status: 400 }
        );
      }
      const composed = await composeToolPrompt(
        session.user.id,
        body.folderId,
        body.toolId,
        typeof body.variantId === "string" ? body.variantId : undefined
      );
      if (!composed) {
        return NextResponse.json(
          { success: false, error: "Unknown tool or folder" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: composed });
    } catch (error) {
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
        event: "studio:tools:compose:caught",
        summary: `POST ${ROUTE_PATH} caught`,
        error,
      });
      return NextResponse.json(
        { success: false, error: "Internal error" },
        { status: 500 }
      );
    }
  });
}
