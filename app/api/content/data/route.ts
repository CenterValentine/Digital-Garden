/**
 * Databases list — what the left-panel rail renders (plan B8 surface 6).
 *
 * GET /api/content/data
 *
 * The caller's databases with their views. Views are personal-filtered the
 * same way loadTable filters them (plan O14) — someone else's personal view
 * never appears in your rail. Scoping is exactly the file tree's (plan O17):
 * owned content, no database-specific scoping of its own.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/data";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();

      const nodes = await withSpan(
        { layer: "content", name: "data_rail_list" },
        { summary: "list databases for the rail" },
        async (span) => {
          const result = await prisma.contentNode.findMany({
            where: {
              ownerId: session.user.id,
              contentType: "data",
              deletedAt: null,
            },
            orderBy: { title: "asc" },
            select: {
              id: true,
              title: true,
              dataPayload: {
                select: {
                  rowCount: true,
                  defaultViewId: true,
                  views: {
                    where: {
                      OR: [
                        { access: { not: "personal" } },
                        { ownerId: session.user.id },
                      ],
                    },
                    orderBy: { position: "asc" },
                    select: { id: true, name: true, mode: true, access: true },
                  },
                },
              },
            },
          });
          span.attr("count", result.length);
          return result;
        }
      );

      return NextResponse.json({
        success: true,
        data: {
          databases: nodes
            .filter((n) => n.dataPayload)
            .map((n) => ({
              id: n.id,
              title: n.title,
              rowCount: n.dataPayload!.rowCount,
              defaultViewId: n.dataPayload!.defaultViewId,
              views: n.dataPayload!.views,
            })),
        },
      });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:rail_list:caught",
        summary: "failed to list databases",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to list databases" } },
        { status: 500 }
      );
    }
  });
}
