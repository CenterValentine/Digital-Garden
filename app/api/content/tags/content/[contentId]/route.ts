/**
 * Content Tags API - Get Tags for Content
 *
 * GET /api/content/tags/content/[contentId]
 * Returns all tags associated with a specific content node
 *
 * M6: Search & Knowledge Features - Tags
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/tags/content/[contentId]";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const { contentId } = await params;

      const contentTags = await withSpan(
        { layer: "content", name: "tags_for_content" },
        { attrs: { content_id: contentId } },
        async (span) => {
          const result = await prisma.contentTag.findMany({
            where: { contentId },
            select: {
              id: true,
              positions: true,
              createdAt: true,
              tag: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  color: true,
                },
              },
            },
            orderBy: { tag: { name: "asc" } },
          });
          span.attr("count", result.length).summary(`${result.length} tags`);
          return result;
        },
      );

      const results = contentTags.map((ct) => ({
        id: ct.tag.id,
        name: ct.tag.name,
        slug: ct.tag.slug,
        color: ct.tag.color,
        positions: ct.positions,
        linkedAt: ct.createdAt.toISOString(),
      }));

      return NextResponse.json(results);
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      logger.error({
        layer: "content",
        event: "tags_for_content:caught",
        summary: "load failed — 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to get content tags",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}
