/**
 * Trash listing — GET /api/trash
 *
 * Returns the authenticated user's soft-deleted chats + content (orphaned
 * documents), each with days-left before the 30-day auto-purge.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { listTrash, TRASH_RETENTION_DAYS } from "@/lib/features/trash";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/trash";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const items = await listTrash(session.user.id);
      return NextResponse.json({
        success: true,
        data: { items, retentionDays: TRASH_RETENTION_DAYS },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }
      logger.error({
        layer: "ai",
        event: "trash_list:caught",
        summary: `GET ${ROUTE_PATH} caught — 500`,
        error,
      });
      return NextResponse.json(
        { success: false, error: "Failed to load trash" },
        { status: 500 },
      );
    }
  });
}
