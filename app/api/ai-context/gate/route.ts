/**
 * Folder-mention pre-flight gate (sweep B5, client stage).
 *
 * POST /api/ai-context/gate  body: { folderId }
 *   → { success, data: GateResult & { title } }
 *
 * Fires when a folder mention is INSERTED into the composer — the chip
 * animates while the user is still typing, so the send itself finds warm
 * context (settle-then-associate precedent). The chat route re-runs the
 * gate at send; that stage is authoritative and idempotent — a completed
 * pre-flight makes it a cheap coverage check.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { logger, withRouteTrace } from "@/lib/core/logger";
import { prisma } from "@/lib/database/client";
import { ensureFolderContextFresh } from "@/lib/domain/ai-context/gate";

const ROUTE_PATH = "/api/ai-context/gate";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const body = (await request.json()) as { folderId?: unknown };
      if (typeof body.folderId !== "string" || !body.folderId) {
        return NextResponse.json(
          { success: false, error: "folderId required" },
          { status: 400 }
        );
      }

      const folder = await prisma.contentNode.findFirst({
        where: {
          id: body.folderId,
          ownerId: session.user.id,
          deletedAt: null,
          contentType: "folder",
        },
        select: { id: true, title: true },
      });
      if (!folder) {
        return NextResponse.json(
          { success: false, error: "Folder not found" },
          { status: 404 }
        );
      }

      const gate = await ensureFolderContextFresh(session.user.id, folder.id);
      return NextResponse.json({
        success: true,
        data: { ...gate, title: folder.title },
      });
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
        event: "ai_context:gate:caught",
        summary: "folder-mention pre-flight gate caught",
        error,
      });
      return NextResponse.json(
        { success: false, error: "Internal error" },
        { status: 500 }
      );
    }
  });
}
