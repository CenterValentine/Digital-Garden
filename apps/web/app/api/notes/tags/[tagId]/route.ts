/**
 * Delete Tag API
 *
 * DELETE /api/notes/tags/[tagId]
 * Deletes a tag and all its content associations
 * Uses CASCADE to automatically remove ContentTag relationships
 *
 * M6: Search & Knowledge Features - Tags
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tagId: string }> }
) {
  try {
    const { tagId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    // Get tag with usage count before deletion
    const tag = await prisma.tag.findUnique({
      where: { id: tagId },
      select: {
        id: true,
        userId: true,
        name: true,
        _count: {
          select: {
            contentTags: true,
          },
        },
      },
    });

    if (!tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    // Verify tag belongs to user
    if (tag.userId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized - tag belongs to another user" },
        { status: 403 }
      );
    }

    // Delete tag (CASCADE will automatically delete ContentTag relationships)
    await prisma.tag.delete({
      where: { id: tagId },
    });

    return NextResponse.json({
      success: true,
      message: `Tag "${tag.name}" deleted`,
      affectedDocuments: tag._count.contentTags,
    });
  } catch (error) {
    console.error("Delete tag error:", error);
    return NextResponse.json(
      {
        error: "Failed to delete tag",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
