/**
 * Playbook registry API (AI v3.2 T3).
 *
 * GET /api/content/playbooks — list the current user's playbook notes for the
 * /playbook picker (id, title, description, phaseCount). See
 * lib/domain/ai/playbooks/registry.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { listPlaybooks } from "@/lib/domain/ai/playbooks/registry";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/playbooks";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const playbooks = await listPlaybooks(session.user.id);
      return NextResponse.json({ success: true, data: { playbooks } });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json(
          { success: false, error: { message: "Unauthorized" } },
          { status: 401 },
        );
      }
      logger.error({
        layer: "ai",
        event: "playbooks_list:caught",
        summary: "failed to list playbooks",
        error,
      });
      return NextResponse.json(
        { success: false, error: { message: "Failed to list playbooks" } },
        { status: 500 },
      );
    }
  });
}
