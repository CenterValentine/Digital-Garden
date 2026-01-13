/**
 * Content Move API
 *
 * POST /api/notes/content/move - Move content to new parent
 *
 * Handles drag-and-drop reorganization of content tree.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/middleware";
import { updateMaterializedPath } from "@/lib/content";

// ============================================================
// POST /api/notes/content/move - Move Content
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();

    const { contentId, targetParentId, newDisplayOrder } = body;

    if (!contentId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "contentId is required",
          },
        },
        { status: 400 }
      );
    }

    // Fetch content to move
    const content = await prisma.contentNode.findUnique({
      where: { id: contentId },
      select: {
        id: true,
        ownerId: true,
        parentId: true,
        children: {
          select: { id: true },
        },
      },
    });

    if (!content) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Content not found",
          },
        },
        { status: 404 }
      );
    }

    // Check ownership
    if (content.ownerId !== session.user.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Access denied",
          },
        },
        { status: 403 }
      );
    }

    // Validate target parent
    if (targetParentId !== null && targetParentId !== undefined) {
      const targetParent = await prisma.contentNode.findUnique({
        where: { id: targetParentId },
      });

      if (!targetParent) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Target parent not found",
            },
          },
          { status: 404 }
        );
      }

      if (targetParent.ownerId !== session.user.id) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Access denied to target parent",
            },
          },
          { status: 403 }
        );
      }

      // Prevent moving to self or descendant
      if (targetParentId === contentId) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Cannot move content to itself",
            },
          },
          { status: 400 }
        );
      }

      // Check if target is a descendant (would create cycle)
      const isDescendant = await checkIsDescendant(
        targetParentId,
        contentId
      );
      if (isDescendant) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Cannot move content to its own descendant",
            },
          },
          { status: 400 }
        );
      }
    }

    // Move content
    const updated = await prisma.contentNode.update({
      where: { id: contentId },
      data: {
        parentId: targetParentId === undefined ? content.parentId : targetParentId,
        displayOrder: newDisplayOrder ?? 0,
      },
    });

    // Update materialized path
    await updateMaterializedPath(contentId);

    // Update paths for all children (if folder)
    if (content.children.length > 0) {
      await updateChildrenPaths(contentId);
    }

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        parentId: updated.parentId,
        displayOrder: updated.displayOrder,
        message: "Content moved successfully",
      },
    });
  } catch (error) {
    console.error("POST /api/notes/content/move error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to move content",
        },
      },
      { status: 500 }
    );
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Check if potentialAncestor is an ancestor of nodeId
 */
async function checkIsDescendant(
  potentialAncestor: string,
  nodeId: string
): Promise<boolean> {
  let currentId: string | null = nodeId;
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) {
      // Cycle detected
      return false;
    }
    visited.add(currentId);

    if (currentId === potentialAncestor) {
      return true;
    }

    const node = await prisma.contentNode.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });

    if (!node) break;
    currentId = node.parentId;

    // Safety limit
    if (visited.size > 100) {
      throw new Error("Tree depth exceeds limit");
    }
  }

  return false;
}

/**
 * Recursively update materialized paths for all children
 */
async function updateChildrenPaths(parentId: string) {
  const children = await prisma.contentNode.findMany({
    where: { parentId },
    select: { id: true },
  });

  for (const child of children) {
    await updateMaterializedPath(child.id);
    await updateChildrenPaths(child.id);
  }
}

