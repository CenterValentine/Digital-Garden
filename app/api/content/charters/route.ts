/**
 * Charter registry API (AI v3.2 T3).
 *
 * GET /api/content/charters — list the current user's charter notes for the
 * /charter picker (id, title, description, phaseCount). See
 * lib/domain/ai/charters/registry.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { listCharters } from "@/lib/domain/ai/charters/registry";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/charters";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const charters = await listCharters(session.user.id);
      return NextResponse.json({ success: true, data: { charters } });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json(
          { success: false, error: { message: "Unauthorized" } },
          { status: 401 },
        );
      }
      logger.error({
        layer: "ai",
        event: "charters_list:caught",
        summary: "failed to list charters",
        error,
      });
      return NextResponse.json(
        { success: false, error: { message: "Failed to list charters" } },
        { status: 500 },
      );
    }
  });
}
