/**
 * Tag Search API - Autocomplete
 *
 * GET /api/content/tags/search?query=react
 * Returns tags matching search query for autocomplete
 *
 * M6: Search & Knowledge Features - Tags
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/tags/search";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const query = searchParams.get("query") || "";
      const userId = searchParams.get("userId");

      if (!userId) {
        return NextResponse.json({ error: "User ID required" }, { status: 400 });
      }

      const tags = await withSpan(
        { layer: "content", name: "tags_search" },
        { attrs: { query_chars: query.length } },
        async (span) => {
          const result = await prisma.tag.findMany({
            where: {
              userId,
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { slug: { contains: query.toLowerCase() } },
              ],
            },
            select: {
              id: true,
              name: true,
              slug: true,
              color: true,
              _count: { select: { contentTags: true } },
            },
            orderBy: [
              { contentTags: { _count: "desc" } },
              { name: "asc" },
            ],
            take: 10,
          });
          span.attr("hits", result.length).summary(`${result.length} hits`);
          return result;
        },
      );

      const results = tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        color: tag.color,
        usageCount: tag._count.contentTags,
      }));

      return NextResponse.json(results);
    } catch (error) {
      logger.error({
        layer: "content",
        event: "tags_search:caught",
        summary: "search failed — 500",
        error,
      });
      return NextResponse.json(
        { error: "Failed to search tags", details: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 }
      );
    }
  });
}
