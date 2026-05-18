/**
 * Content Template Usage Tracking
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/templates/[id]/use";

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

      const template = await prisma.contentTemplate.findFirst({
        where: { id, userId: session.user.id },
      });

      if (!template) {
        return NextResponse.json({ error: "Content template not found" }, { status: 404 });
      }

      await prisma.contentTemplate.update({
        where: { id },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "template_use:caught",
        summary: "track failed — 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to track template usage",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}
