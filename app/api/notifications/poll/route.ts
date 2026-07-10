/**
 * Notifications API — cheap badge poll.
 *
 * GET /api/notifications/poll?since=<ISO>
 *
 * Two indexed queries, no payload hydration. `hasNew` compares the newest
 * projection timestamp to the caller-provided `since` cursor so the client
 * can skip refetching the list when nothing changed.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { prisma } from "@/lib/database/client";
import { getUnreadSummary } from "@/lib/domain/notifications";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/notifications/poll";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const summary = await getUnreadSummary(prisma, session.user.id);

      const since = request.nextUrl.searchParams.get("since");
      const hasNew =
        summary.latestCreatedAt !== null &&
        (!since || summary.latestCreatedAt > since);

      return NextResponse.json({
        success: true,
        data: { ...summary, hasNew },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "Unauthorized" ||
          error.message === "Authentication required")
      ) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }
      logger.error({
        layer: "content",
        event: "notifications_poll:caught",
        summary: "GET caught — translated to 500",
        error,
      });
      return NextResponse.json(
        { success: false, error: "Failed to poll notifications" },
        { status: 500 },
      );
    }
  });
}
