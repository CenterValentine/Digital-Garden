/**
 * Content Move API
 *
 * POST /api/content/content/move - Move content to new parent
 *
 * Handles drag-and-drop reorganization of content tree.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { markContextDirty } from "@/extensions/studio/server/context-dirty";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { updateMaterializedPath } from "@/lib/domain/content";
import type { MoveContentRequest } from "@/lib/domain/content/api-types";
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/content/move";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
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

      const content = await withSpan(
        { layer: "tree", name: "lookup_source" },
        { attrs: { content_id: contentId } },
        async (span) => {
          const result = await prisma.contentNode.findUnique({
            where: { id: contentId },
            select: {
              id: true,
              ownerId: true,
              parentId: true,
              role: true,
              ownedByNoteId: true,
              children: { select: { id: true } },
            },
          });
          if (result) {
            span.attr("child_count", result.children.length);
          } else {
            span.attr("found", false);
          }
          return result;
        },
      );

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

      // References may re-home under a NOTE (display parentage via
      // ownedByNoteId; storage parentId follows the note's folder). Primary
      // content keeps the folder-only rule — deliberately not Notion.
      // `undefined` = leave ownership unchanged; null = detach from note.
      let ownerNoteUpdate: string | null | undefined = undefined;
      let storageTargetParentId = targetParentId;

      // Dropping a reference at ROOT detaches it from its note.
      if (targetParentId === null && content.role === "referenced") {
        ownerNoteUpdate = null;
      }

      // Validate target parent
      if (targetParentId !== null && targetParentId !== undefined) {
        const targetParent = await prisma.contentNode.findUnique({
          where: { id: targetParentId },
          select: {
            id: true,
            ownerId: true,
            contentType: true,
            parentId: true,
          },
        });

        if (!targetParent) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "NOT_FOUND", message: "Target parent not found" },
            },
            { status: 404 }
          );
        }

        if (targetParent.ownerId !== session.user.id) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "FORBIDDEN", message: "Access denied to target parent" },
            },
            { status: 403 }
          );
        }

        if (targetParent.contentType !== "folder") {
          const isReferenceToNote =
            content.role === "referenced" &&
            targetParent.contentType === "note";
          if (!isReferenceToNote) {
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
          // Re-home the reference under this note; its storage home is the
          // note's folder so parentId invariants (paths, cascades, folder
          // scans) stay intact.
          ownerNoteUpdate = targetParent.id;
          storageTargetParentId = targetParent.parentId;
        } else if (content.role === "referenced") {
          // Explicit drop into a folder detaches the reference from its
          // note — it becomes folder-level referenced content, adjacent to
          // primary content.
          ownerNoteUpdate = null;
        }

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

      // Determine the final parent (storage home — a reference dropped onto
      // a note stores under the note's folder, displays under the note)
      const finalParentId =
        storageTargetParentId === undefined
          ? content.parentId
          : storageTargetParentId;

      const updated = await withSpan(
        { layer: "tree", name: "move" },
        {
          attrs: {
            content_id: contentId,
            same_parent: finalParentId === content.parentId,
            child_count: content.children.length,
          },
          summary: `to parent ${finalParentId ?? "(root)"} @ order ${newDisplayOrder ?? 0}`,
        },
        async (span) => {
          // Per-row debug log of sibling order removed — too noisy.
          const result = await moveContentToPosition(contentId, finalParentId, newDisplayOrder ?? 0);
          if (!result) {
            throw new Error('Failed to update content position');
          }
          span.attr("new_order", result.displayOrder).summary(`order=${result.displayOrder}`);
          await spanPayload(span, "move_result", {
            content_id: contentId,
            target_parent_id: targetParentId,
            final_parent_id: finalParentId,
            new_display_order: result.displayOrder,
          });
          return result;
        },
      );

      // Apply the reference-ownership change decided above (re-home under a
      // note, or detach on an explicit folder/root drop).
      if (
        ownerNoteUpdate !== undefined &&
        ownerNoteUpdate !== content.ownedByNoteId
      ) {
        await prisma.contentNode.update({
          where: { id: contentId },
          data: { ownedByNoteId: ownerNoteUpdate },
        });
      }

      // Detached reference that is STILL EMBEDDED in a live note: the tree's
      // embed-graph ownership fallback will re-nest it under that note on the
      // next fetch. Tell the client so it can snap back visibly (short delay
      // + explanatory toast) instead of silently reverting on a later
      // refresh. Non-embedded references detach freely — this stays null.
      let stillReferencedBy: { id: string; title: string } | null = null;
      if (ownerNoteUpdate === null) {
        const liveEmbed = await prisma.contentLink.findFirst({
          where: {
            targetId: contentId,
            linkType: { in: ["image-ref", "audio-ref"] },
            source: { deletedAt: null },
          },
          orderBy: { createdAt: "asc" },
          select: { source: { select: { id: true, title: true } } },
        });
        if (liveEmbed) stillReferencedBy = liveEmbed.source;
      }

      // Update materialized path
      await updateMaterializedPath(contentId);

      // Update paths for all children (if folder)
      if (content.children.length > 0) {
        await updateChildrenPaths(contentId);
      }

      // Sprint 37: Cascade move for referenced images.
      if (finalParentId !== content.parentId) {
        await withSpan(
          { layer: "content", name: "image_refs_cascade" },
          { attrs: { content_id: contentId } },
          async (span) => {
            const imageLinks = await prisma.contentLink.findMany({
              where: {
                sourceId: contentId,
                linkType: "image-ref",
              },
              select: { targetId: true },
            });

            if (imageLinks.length > 0) {
              const imageIds = imageLinks.map((l) => l.targetId);
              await prisma.contentNode.updateMany({
                where: {
                  id: { in: imageIds },
                  role: "referenced",
                },
                data: { parentId: finalParentId },
              });
              for (const imageId of imageIds) {
                await updateMaterializedPath(imageId);
              }
              span.attr("moved", imageIds.length).summary(`${imageIds.length} image refs cascaded`);
            } else {
              span.attr("moved", 0).summary("no image refs");
            }
          },
        );
      }

      // Folder Studio auto-context: a cross-parent move changes BOTH
      // parents' roll-up inputs. Same-parent reorders don't — child order
      // isn't part of the folder source hash.
      if (finalParentId !== content.parentId) {
        after(() => markContextDirty([content.parentId, finalParentId]));
      }

      return NextResponse.json({
        success: true,
        data: {
          id: updated.id,
          parentId: updated.parentId,
          displayOrder: updated.displayOrder,
          stillReferencedBy,
          message: "Content moved successfully",
        },
      });
    } catch (error) {
      logger.error({
        layer: "tree",
        event: "move:caught",
        summary: "move failed — 500",
        error,
      });
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
  });
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
 */
async function moveContentToPosition(
  contentId: string,
  parentId: string | null,
  visualIndex: number
) {
  const siblings = await prisma.contentNode.findMany({
    where: {
      parentId,
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      displayOrder: true,
      contentType: true,
    },
  });

  siblings.sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }
    return a.title.localeCompare(b.title);
  });

  const movedItemIndex = siblings.findIndex(s => s.id === contentId);
  let movedItem;
  if (movedItemIndex >= 0) {
    [movedItem] = siblings.splice(movedItemIndex, 1);
  }

  const targetIndex = Math.max(0, Math.min(visualIndex, siblings.length));

  if (!movedItem) {
    movedItem = await prisma.contentNode.findUnique({
      where: { id: contentId },
      select: {
        id: true,
        title: true,
        displayOrder: true,
        contentType: true,
      },
    });
    if (!movedItem) {
      throw new Error('Content not found');
    }
  }

  siblings.splice(targetIndex, 0, movedItem);

  const updates = siblings.map((sibling, index) => {
    const updateData: { displayOrder: number; parentId?: string | null } = { displayOrder: index };

    if (sibling.id === contentId) {
      updateData.parentId = parentId;
    }

    return prisma.contentNode.update({
      where: { id: sibling.id },
      data: updateData,
    });
  });

  await prisma.$transaction(updates);

  return await prisma.contentNode.findUnique({
    where: { id: contentId },
    select: {
      id: true,
      parentId: true,
      displayOrder: true,
    },
  });
}
