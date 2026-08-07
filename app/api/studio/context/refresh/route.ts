/**
 * POST /api/studio/context/refresh  body: { nodeId }
 *
 * Explicit human command (file-tree right-click → "Update AI context"):
 * drains dirty/uncovered context in the node's subtree NOW. Bypasses the
 * settle debounce and the autoContextMode gate — a direct order beats both
 * (the recovery path for failed ripples) — but never the model gate: no
 * configured route is a 409, not silence. Runs behind the response via
 * after(); the drain itself keeps its usual per-run spend caps.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { prisma } from "@/lib/database/client";
import { logger, withRouteTrace } from "@/lib/core/logger";
import { resolvePrimaryRoute } from "@/lib/domain/ai/features/router";
import { getUserSettings } from "@/lib/features/settings";
import { getStudioSettings } from "@/extensions/studio/settings";
import { refreshScope } from "@/lib/domain/ai-context/context-refresh";
import { getTodaySpend } from "@/lib/domain/ai-context/context-spend";

const ROUTE_PATH = "/api/studio/context/refresh";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const body = (await request.json()) as { nodeId?: string };
      if (!body.nodeId || typeof body.nodeId !== "string") {
        return NextResponse.json(
          { success: false, error: "nodeId is required" },
          { status: 400 }
        );
      }
      const nodeId = body.nodeId;

      const node = await prisma.contentNode.findFirst({
        where: { id: nodeId, ownerId: session.user.id, deletedAt: null },
        select: { id: true },
      });
      if (!node) {
        return NextResponse.json(
          { success: false, error: "Content not found" },
          { status: 404 }
        );
      }

      const route = await resolvePrimaryRoute(session.user.id, "studio-metadata");
      if (!route) {
        return NextResponse.json(
          {
            success: false,
            error:
              "No model available for Studio Context Generation. Configure one under Settings → AI → Feature Routing.",
          },
          { status: 409 }
        );
      }

      // Honest 409 instead of a silent post-202 no-op: the engine would
      // refuse the drain anyway (daily ceiling is in its gate stack), but an
      // explicit click deserves to know why nothing will happen.
      const cap = getStudioSettings(
        await getUserSettings(session.user.id)
      ).dailyCallCap;
      const used = await getTodaySpend(session.user.id);
      if (used >= cap) {
        return NextResponse.json(
          {
            success: false,
            error: `Daily AI-context budget reached (${cap} calls). Raise it in Folder Studio settings, or try again after midnight UTC.`,
          },
          { status: 409 }
        );
      }

      after(() =>
        refreshScope(session.user.id, nodeId, { bypassSettle: true })
      );
      return NextResponse.json({ success: true }, { status: 202 });
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
        event: "studio:context_refresh_route:caught",
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
