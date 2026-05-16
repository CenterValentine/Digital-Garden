/**
 * Delete Tag API
 *
 * DELETE /api/content/tags/[tagId]
 * Deletes a tag and all its content associations
 * Uses CASCADE to automatically remove ContentTag relationships
 *
 * M6: Search & Knowledge Features - Tags
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/tags/[tagId]";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tagId: string }> }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { tagId } = await params;
      const { searchParams } = new URL(request.url);
      const userId = searchParams.get("userId");

      if (!userId) {
        return NextResponse.json({ error: "User ID required" }, { status: 400 });
      }

      const tag = await prisma.tag.findUnique({
        where: { id: tagId },
        select: {
          id: true,
          userId: true,
          name: true,
          _count: { select: { contentTags: true } },
        },
      });

      if (!tag) {
        return NextResponse.json({ error: "Tag not found" }, { status: 404 });
      }

      if (tag.userId !== userId) {
        return NextResponse.json(
          { error: "Unauthorized - tag belongs to another user" },
          { status: 403 }
        );
      }

      await withSpan(
        { layer: "content", name: "tag_delete" },
        {
          attrs: { tag_id: tagId, affected_docs: tag._count.contentTags },
          summary: `${tag._count.contentTags} docs affected`,
        },
        async () => prisma.tag.delete({ where: { id: tagId } }),
      );

      return NextResponse.json({
        success: true,
        message: `Tag "${tag.name}" deleted`,
        affectedDocuments: tag._count.contentTags,
      });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "tag_delete:caught",
        summary: "delete failed — 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to delete tag",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}
