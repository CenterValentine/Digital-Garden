/**
 * Saved Block Usage Tracking
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/saved-blocks/[id]/use";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRouteTrace(_request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await params;

      const block = await prisma.savedBlock.findFirst({
        where: {
          id,
          OR: [{ userId: session.user.id }, { userId: null }],
        },
      });

      if (!block) {
        return NextResponse.json({ error: "Saved block not found" }, { status: 404 });
      }

      const updated = await prisma.savedBlock.update({
        where: { id },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });

      return NextResponse.json({
        id: updated.id,
        usageCount: updated.usageCount,
        lastUsedAt: updated.lastUsedAt?.toISOString(),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "saved_block_use:caught",
        summary: "track failed — 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to track usage",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}
