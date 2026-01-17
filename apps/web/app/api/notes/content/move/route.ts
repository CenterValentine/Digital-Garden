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
import type { MoveContentRequest } from "@/lib/content/api-types";

// ============================================================
// POST /api/notes/content/move - Move Content
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as MoveContentRequest;

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
        include: {
          notePayload: true,
          filePayload: true,
          htmlPayload: true,
          codePayload: true,
        },
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

      // Validate target is a folder (has no payload)
      const hasPayload =
        targetParent.notePayload ||
        targetParent.filePayload ||
        targetParent.htmlPayload ||
        targetParent.codePayload;

      if (hasPayload) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Cannot move content into a non-folder item",
            },
          },
          { status: 400 }
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
      const isDescendant = await checkIsDescendant(targetParentId, contentId);
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

    // Determine the final parent (either new parent or keep current)
    const finalParentId = targetParentId === undefined ? content.parentId : targetParentId;

    // Move content
    const updated = await prisma.contentNode.update({
      where: { id: contentId },
      data: {
        parentId: finalParentId,
        displayOrder: newDisplayOrder ?? 0,
      },
    });

    // Recalculate displayOrder for all siblings to maintain consistent ordering
    await reorderSiblings(finalParentId);

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

/**
 * Reorder siblings to maintain consistent displayOrder values
 *
 * After a move operation, siblings may have duplicate or inconsistent displayOrder values.
 * This function recalculates displayOrder for all siblings to ensure proper ordering.
 *
 * @param parentId - The parent whose children should be reordered (null for root items)
 */
async function reorderSiblings(parentId: string | null) {
  // Fetch all siblings with the same parentId, including payload relations
  const siblings = await prisma.contentNode.findMany({
    where: { parentId },
    include: {
      notePayload: true,
      filePayload: true,
      htmlPayload: true,
      codePayload: true,
    },
  });

  // Sort siblings using the same logic as tree API
  siblings.sort((a, b) => {
    const aIsFolder = !a.notePayload && !a.filePayload && !a.htmlPayload && !a.codePayload;
    const bIsFolder = !b.notePayload && !b.filePayload && !b.htmlPayload && !b.codePayload;

    // Rule 1: Folders first
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;

    // Rule 2: Then by displayOrder
    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }

    // Rule 3: Then alphabetically
    return a.title.localeCompare(b.title);
  });

  // Assign sequential displayOrder values (0, 1, 2, 3...)
  const updates = siblings.map((sibling, index) => {
    return prisma.contentNode.update({
      where: { id: sibling.id },
      data: { displayOrder: index },
    });
  });

  // Execute all updates in a transaction for atomicity
  await prisma.$transaction(updates);
}
