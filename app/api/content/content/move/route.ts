/**
 * Content Move API
 *
 * POST /api/content/content/move - Move content to new parent
 *
 * Handles drag-and-drop reorganization of content tree.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { updateMaterializedPath } from "@/lib/domain/content";
import type { MoveContentRequest } from "@/lib/domain/content/api-types";

// ============================================================
// POST /api/content/content/move - Move Content
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
      // The function checks if potentialAncestor is an ancestor of nodeId
      // We want to check if targetParent is a descendant of content
      // So we check: is content an ancestor of targetParent?
      const isDescendant = await checkIsDescendant(contentId, targetParentId);
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

    // Move content with proper ordering
    const updated = await moveContentToPosition(contentId, finalParentId, newDisplayOrder ?? 0);

    if (!updated) {
      throw new Error('Failed to update content position');
    }

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
    console.error("POST /api/content/content/move error:", error);
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

    const node: { parentId: string | null } | null = await prisma.contentNode.findUnique({
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
 * Move content to a specific position within its parent
 *
 * This function properly handles the visual position by:
 * 1. Fetching all siblings and sorting them (folders-first, then by displayOrder)
 * 2. Removing the item being moved from the list
 * 3. Inserting it at the desired visual position
 * 4. Renumbering all siblings sequentially
 *
 * @param contentId - ID of the content to move
 * @param parentId - Target parent ID
 * @param visualIndex - Desired visual position (0-based)
 * @returns The updated content node
 */
async function moveContentToPosition(
  contentId: string,
  parentId: string | null,
  visualIndex: number
) {
  // Fetch all siblings in the target parent (including the moved item if same parent)
  const siblings = await prisma.contentNode.findMany({
    where: {
      parentId,
      deletedAt: null  // CRITICAL: Exclude soft-deleted items
    },
    include: {
      notePayload: true,
      filePayload: true,
      htmlPayload: true,
      codePayload: true,
    },
  });

  // Sort siblings by displayOrder only (WYSIWYG - visual order = database order)
  siblings.sort((a, b) => {
    // Primary: displayOrder
    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }

    // Tiebreaker: alphabetically
    return a.title.localeCompare(b.title);
  });

  // Remove the item being moved from the list
  const movedItemIndex = siblings.findIndex(s => s.id === contentId);
  let movedItem;
  if (movedItemIndex >= 0) {
    [movedItem] = siblings.splice(movedItemIndex, 1);
  }

  // Insert at the desired visual position
  const targetIndex = Math.max(0, Math.min(visualIndex, siblings.length));

  // If we removed the item, we need to fetch it to insert it
  if (!movedItem) {
    movedItem = await prisma.contentNode.findUnique({
      where: { id: contentId },
      include: {
        notePayload: true,
        filePayload: true,
        htmlPayload: true,
        codePayload: true,
      },
    });
    if (!movedItem) {
      throw new Error('Content not found');
    }
  }

  siblings.splice(targetIndex, 0, movedItem);

  // Update all siblings with new displayOrder and parentId for the moved item
  const updates = siblings.map((sibling, index) => {
    const updateData: any = { displayOrder: index };

    // Only update parentId for the moved item
    if (sibling.id === contentId) {
      updateData.parentId = parentId;
    }

    return prisma.contentNode.update({
      where: { id: sibling.id },
      data: updateData,
    });
  });

  // Debug logging: Show what we're about to save
  console.log('[Move API] Saving new order for parent:', parentId);
  siblings.forEach((sibling, index) => {
    console.log(`  - ${sibling.title} → displayOrder: ${index} ${sibling.id === contentId ? '(MOVED ITEM)' : ''}`);
  });

  // Execute all updates in a transaction
  await prisma.$transaction(updates);

  // Return the updated moved item
  const result = await prisma.contentNode.findUnique({
    where: { id: contentId },
    select: {
      id: true,
      parentId: true,
      displayOrder: true,
    },
  });

  console.log('[Move API] Move completed. Moved item now has displayOrder:', result?.displayOrder);

  return result;
}

