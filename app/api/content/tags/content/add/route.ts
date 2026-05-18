/**
 * Add Tag to Content API
 *
 * POST /api/content/tags/content/add
 * Links a tag to a content node with position tracking
 *
 * Request body:
 * {
 *   contentId: string;
 *   tagId: string;
 *   positions: Array<{ offset: number; context: string }>;
 * }
 *
 * M6: Search & Knowledge Features - Tags
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/tags/content/add";

interface AddTagRequest {
  contentId: string;
  tagId: string;
  positions: Array<{ offset: number; context: string }>;
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const body: AddTagRequest = await request.json();
      const { contentId, tagId, positions } = body;

      if (!contentId || !tagId) {
        return NextResponse.json(
          { error: "contentId and tagId are required" },
          { status: 400 }
        );
      }

      const content = await prisma.contentNode.findUnique({
        where: { id: contentId },
        select: { id: true },
      });

      if (!content) {
        return NextResponse.json({ error: "Content not found" }, { status: 404 });
      }

      const tag = await prisma.tag.findUnique({
        where: { id: tagId },
        select: { id: true },
      });

      if (!tag) {
        return NextResponse.json({ error: "Tag not found" }, { status: 404 });
      }

      const contentTag = await withSpan(
        { layer: "content", name: "tag_attach" },
        {
          attrs: {
            content_id: contentId,
            tag_id: tagId,
            position_count: (positions || []).length,
          },
        },
        async () =>
          prisma.contentTag.upsert({
            where: { contentId_tagId: { contentId, tagId } },
            update: { positions: positions || [] },
            create: {
              contentId,
              tagId,
              positions: positions || [],
            },
            include: {
              tag: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  color: true,
                },
              },
            },
          }),
      );

      return NextResponse.json({
        id: contentTag.id,
        tag: contentTag.tag,
        positions: contentTag.positions,
        createdAt: contentTag.createdAt.toISOString(),
      });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "tag_attach:caught",
        summary: "attach failed — 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to add tag to content",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}
