/**
 * Notifications API — inbox list.
 *
 * GET /api/notifications?filter=all|unread|archived&cursor=<id>&limit=15
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { prisma } from "@/lib/database/client";
import { listNotifications } from "@/lib/domain/notifications";
import type { NotificationListFilter } from "@/lib/domain/notifications";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/notifications";

const FILTERS: NotificationListFilter[] = ["all", "unread", "archived"];

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const params = request.nextUrl.searchParams;
      const filterParam = params.get("filter") ?? "all";
      const filter = FILTERS.includes(filterParam as NotificationListFilter)
        ? (filterParam as NotificationListFilter)
        : "all";
      const cursor = params.get("cursor") ?? undefined;
      const limitParam = Number.parseInt(params.get("limit") ?? "", 10);
      const limit = Number.isFinite(limitParam) ? limitParam : undefined;

      const data = await listNotifications(prisma, session.user.id, {
        filter,
        cursor,
        limit,
      });

      return NextResponse.json({ success: true, data });
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
        event: "notifications_list:caught",
        summary: "GET caught — translated to 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch notifications",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  });
}
