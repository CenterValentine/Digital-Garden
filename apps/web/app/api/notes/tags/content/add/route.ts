/**
 * Add Tag to Content API
 *
 * POST /api/notes/tags/content/add
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
import { prisma } from "@/lib/db/prisma";

interface AddTagRequest {
  contentId: string;
  tagId: string;
  positions: Array<{ offset: number; context: string }>;
}

export async function POST(request: NextRequest) {
  try {
    const body: AddTagRequest = await request.json();
    const { contentId, tagId, positions } = body;

    // Validate required fields
    if (!contentId || !tagId) {
      return NextResponse.json(
        { error: "contentId and tagId are required" },
        { status: 400 }
      );
    }

    // Verify content exists
    const content = await prisma.contentNode.findUnique({
      where: { id: contentId },
      select: { id: true },
    });

    if (!content) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    // Verify tag exists
    const tag = await prisma.tag.findUnique({
      where: { id: tagId },
      select: { id: true },
    });

    if (!tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    // Create or update ContentTag (upsert to handle duplicates)
    const contentTag = await prisma.contentTag.upsert({
      where: {
        contentId_tagId: {
          contentId,
          tagId,
        },
      },
      update: {
        positions: positions || [],
      },
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
    });

    return NextResponse.json({
      id: contentTag.id,
      tag: contentTag.tag,
      positions: contentTag.positions,
      createdAt: contentTag.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Add tag to content error:", error);
    return NextResponse.json(
      {
        error: "Failed to add tag to content",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
