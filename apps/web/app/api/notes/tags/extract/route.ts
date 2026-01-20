/**
 * Tag Auto-Extraction API
 *
 * POST /api/notes/tags/extract
 * Extracts tags from TipTap JSON and syncs with database
 *
 * Request body:
 * {
 *   userId: string;
 *   contentId: string;
 *   tiptapJson: JSONContent;
 * }
 *
 * Returns: Array of tags with positions
 *
 * M6: Search & Knowledge Features - Tags
 */

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { extractTags } from "@/lib/content/tag-extractor";
import type { JSONContent } from "@tiptap/core";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface ExtractTagsRequest {
  userId: string;
  contentId: string;
  tiptapJson: JSONContent;
}

export async function POST(request: NextRequest) {
  try {
    const body: ExtractTagsRequest = await request.json();
    const { userId, contentId, tiptapJson } = body;

    // Validate required fields
    if (!userId || !contentId || !tiptapJson) {
      return NextResponse.json(
        { error: "userId, contentId, and tiptapJson are required" },
        { status: 400 }
      );
    }

    // Extract tags from content
    const extractedTags = extractTags(tiptapJson);

    // For each extracted tag:
    // 1. Create tag if it doesn't exist (upsert)
    // 2. Link tag to content with positions (upsert ContentTag)
    const results = [];

    for (const extractedTag of extractedTags) {
      // Create or get existing tag
      const tag = await prisma.tag.upsert({
        where: {
          userId_slug: {
            userId,
            slug: extractedTag.slug,
          },
        },
        update: {},
        create: {
          userId,
          name: extractedTag.name,
          slug: extractedTag.slug,
          // Auto-assign color based on hash of slug
          color: generateColorFromSlug(extractedTag.slug),
        },
      });

      // Link tag to content with positions
      const contentTag = await prisma.contentTag.upsert({
        where: {
          contentId_tagId: {
            contentId,
            tagId: tag.id,
          },
        },
        update: {
          positions: extractedTag.positions as any,
        },
        create: {
          contentId,
          tagId: tag.id,
          positions: extractedTag.positions as any,
        },
      });

      results.push({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        color: tag.color,
        positions: extractedTag.positions,
      });
    }

    // Remove tags that are no longer in the content
    // Get current tag IDs from extracted tags
    const currentTagIds = results.map((r) => r.id);

    // Delete ContentTag entries not in current list
    await prisma.contentTag.deleteMany({
      where: {
        contentId,
        tagId: {
          notIn: currentTagIds.length > 0 ? currentTagIds : ["__none__"], // Prevent empty array
        },
      },
    });

    return NextResponse.json({
      tags: results,
      extractedCount: extractedTags.length,
    });
  } catch (error) {
    console.error("Extract tags error:", error);
    return NextResponse.json(
      {
        error: "Failed to extract tags",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Generate a consistent color from a slug
 * Uses a simple hash to pick from predefined colors
 */
function generateColorFromSlug(slug: string): string {
  const colors = [
    "#3b82f6", // blue
    "#8b5cf6", // purple
    "#10b981", // green
    "#f59e0b", // amber
    "#ef4444", // red
    "#ec4899", // pink
    "#06b6d4", // cyan
    "#f97316", // orange
  ];

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % colors.length;
  return colors[index];
}
