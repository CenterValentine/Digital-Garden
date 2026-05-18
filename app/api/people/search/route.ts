import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import { searchPeopleTargets } from "@/lib/domain/people";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/people/search";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { searchParams } = new URL(request.url);
      const query = searchParams.get("q") ?? "";
      const limit = Number.parseInt(searchParams.get("limit") ?? "25", 10);

      const results = await withSpan(
        { layer: "content", name: "people_search" },
        { attrs: { query_chars: query.length, limit } },
        async (span) => {
          const r = await searchPeopleTargets(prisma, session.user.id, query, limit);
          span.attr("hits", r.length);
          return r;
        },
      );

      return NextResponse.json({
        success: true,
        data: {
          results,
        },
      });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "people_search:caught",
        summary: "search failed — 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to search People records",
          },
        },
        { status: 500 }
      );
    }
  });
}
