/**
 * Restore a soft-deleted item — POST /api/trash/restore
 *   body: { kind: "chat" | "content", id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { restoreTrashItem, type TrashItemKind } from "@/lib/features/trash";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/trash/restore";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const body = (await request.json()) as {
        kind?: TrashItemKind;
        id?: string;
      };
      if (
        (body.kind !== "chat" && body.kind !== "content") ||
        typeof body.id !== "string"
      ) {
        return NextResponse.json(
          { success: false, error: "`kind` and `id` are required" },
          { status: 400 },
        );
      }
      const ok = await restoreTrashItem(session.user.id, body.kind, body.id);
      if (!ok) {
        return NextResponse.json(
          { success: false, error: "Item not found in trash" },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }
      logger.error({
        layer: "ai",
        event: "trash_restore:caught",
        summary: `POST ${ROUTE_PATH} caught — 500`,
        error,
      });
      return NextResponse.json(
        { success: false, error: "Restore failed" },
        { status: 500 },
      );
    }
  });
}
