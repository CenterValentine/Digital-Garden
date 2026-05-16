/**
 * Tag Auto-Extraction API
 *
 * POST /api/content/tags/extract
 * Extracts tags from TipTap JSON and syncs with database
 *
 * M6: Search & Knowledge Features - Tags
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { extractTags } from "@/lib/domain/content/tag-extractor";
import type { JSONContent } from "@tiptap/core";
import type { Prisma } from "@/lib/database/generated/prisma";
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/tags/extract";

interface ExtractTagsRequest {
  userId: string;
  contentId: string;
  tiptapJson: JSONContent;
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const body: ExtractTagsRequest = await request.json();
      const { userId, contentId, tiptapJson } = body;

      if (!userId || !contentId || !tiptapJson) {
        return NextResponse.json(
          { error: "userId, contentId, and tiptapJson are required" },
          { status: 400 }
        );
      }

      const results = await withSpan(
        { layer: "content", name: "tags_extract_sync" },
        { attrs: { content_id: contentId } },
        async (span) => {
          const extractedTags = extractTags(tiptapJson);
          const out: Array<{
            id: string;
            name: string;
            slug: string;
            color: string | null;
            positions: unknown;
          }> = [];

          for (const extractedTag of extractedTags) {
            const tag = await prisma.tag.upsert({
              where: { userId_slug: { userId, slug: extractedTag.slug } },
              update: {},
              create: {
                userId,
                name: extractedTag.name,
                slug: extractedTag.slug,
                color: generateColorFromSlug(extractedTag.slug),
              },
            });

            await prisma.contentTag.upsert({
              where: { contentId_tagId: { contentId, tagId: tag.id } },
              update: {
                positions: extractedTag.positions as unknown as Prisma.InputJsonValue,
              },
              create: {
                contentId,
                tagId: tag.id,
                positions: extractedTag.positions as unknown as Prisma.InputJsonValue,
              },
            });

            out.push({
              id: tag.id,
              name: tag.name,
              slug: tag.slug,
              color: tag.color,
              positions: extractedTag.positions,
            });
          }

          const currentTagIds = out.map((r) => r.id);

          await prisma.contentTag.deleteMany({
            where: {
              contentId,
              tagId: {
                notIn: currentTagIds.length > 0 ? currentTagIds : ["__none__"],
              },
            },
          });

          span.attr("extracted", out.length).summary(`${out.length} tags`);
          await spanPayload(span, "extracted_tags", out);
          return out;
        },
      );

      return NextResponse.json({
        tags: results,
        extractedCount: results.length,
      });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "tags_extract_sync:caught",
        summary: "extract failed — 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to extract tags",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}

function generateColorFromSlug(slug: string): string {
  const colors = [
    "#3b82f6",
    "#8b5cf6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#ec4899",
    "#06b6d4",
    "#f97316",
  ];

  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % colors.length;
  return colors[index];
}
