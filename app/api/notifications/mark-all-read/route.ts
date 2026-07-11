/**
 * Notifications API — bulk read.
 *
 * POST /api/notifications/mark-all-read
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { prisma } from "@/lib/database/client";
import { markAllRead } from "@/lib/domain/notifications";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/notifications/mark-all-read";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const count = await markAllRead(prisma, session.user.id);
      return NextResponse.json({ success: true, data: { markedRead: count } });
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
        event: "notifications_mark_all_read:caught",
        summary: "POST caught — translated to 500",
        error,
      });
      return NextResponse.json(
        { success: false, error: "Failed to mark notifications read" },
        { status: 500 },
      );
    }
  });
}
