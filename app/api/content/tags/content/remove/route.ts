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

interface RemoveTagRequest {
  contentId: string;
  tagId: string;
}

export async function DELETE(request: NextRequest) {
  try {
    const body: RemoveTagRequest = await request.json();
    const { contentId, tagId } = body;

    // Validate required fields
    if (!contentId || !tagId) {
      return NextResponse.json(
        { error: "contentId and tagId are required" },
        { status: 400 }
      );
    }

    // Delete the ContentTag relationship
    const deleted = await prisma.contentTag.deleteMany({
      where: {
        contentId,
        tagId,
      },
    });

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
    console.error("Remove tag from content error:", error);
    return NextResponse.json(
      {
        error: "Failed to remove tag from content",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
