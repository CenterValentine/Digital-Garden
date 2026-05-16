import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import { getPeopleTree } from "@/lib/domain/people";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/people/tree";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const tree = await withSpan(
        { layer: "content", name: "people_tree" },
        undefined,
        async () => getPeopleTree(prisma, session.user.id),
      );

      return NextResponse.json({
        success: true,
        data: tree,
      });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "people_tree:caught",
        summary: "fetch failed — 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to fetch People tree",
          },
        },
        { status: 500 }
      );
    }
  });
}
