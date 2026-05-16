/**
 * Remove Tag from Content API
 *
 * DELETE /api/content/tags/content/remove
 * Unlinks a tag from a content node
 *
 * Request body:
 * {
 *   contentId: string;
 *   tagId: string;
 * }
 *
 * M6: Search & Knowledge Features - Tags
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/tags/content/remove";

interface RemoveTagRequest {
  contentId: string;
  tagId: string;
}

export async function DELETE(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const body: RemoveTagRequest = await request.json();
      const { contentId, tagId } = body;

      if (!contentId || !tagId) {
        return NextResponse.json(
          { error: "contentId and tagId are required" },
          { status: 400 }
        );
      }

      const deleted = await withSpan(
        { layer: "content", name: "tag_detach" },
        { attrs: { content_id: contentId, tag_id: tagId } },
        async (span) => {
          const result = await prisma.contentTag.deleteMany({
            where: { contentId, tagId },
          });
          span.attr("removed", result.count).summary(`${result.count} removed`);
          return result;
        },
      );

      if (deleted.count === 0) {
        return NextResponse.json(
          { error: "Tag not linked to this content" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Tag removed from content",
      });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "tag_detach:caught",
        summary: "detach failed — 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to remove tag from content",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}
