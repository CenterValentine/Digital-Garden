/**
 * Content Move API
 *
 * POST /api/content/content/move - Move content to new parent
 *
 * Handles drag-and-drop reorganization of content tree.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { markContextDirty } from "@/lib/domain/ai-context/context-dirty";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { updateMaterializedPath } from "@/lib/domain/content";
import type { MoveContentRequest } from "@/lib/domain/content/api-types";
import {
  applyKeptSort,
  compareSiblings,
  placeAmongSiblings,
  renumbering,
  type SiblingPlacement,
} from "@/lib/domain/content/sibling-order";
import {
  ORDER_TRANSACTION,
  applyRenumbering,
  loadLevelRows,
  lockSiblingOrder,
  readKeptSort,
  writeKeptSort,
} from "@/lib/domain/content/sibling-slot";
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
      // The row the item was dropped after (null = first). Preferred over
      // newDisplayOrder, which indexes the client's VISIBLE rows — a different
      // list from the sibling list below whenever a parent has referenced
      // media, hidden rows or an expanded reference block. Shape-checked only;
      // a name that isn't a sibling falls back to the index.
      const afterId =
        body.afterId === null || typeof body.afterId === "string"
          ? body.afterId
          : undefined;

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
              // Needed for the shortcut nesting rule: a shortcut may be stored
              // under content that accepts nothing else.
              contentType: true,
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
      // `undefined` = leave the role alone. Only database nesting moves it,
      // in both directions — a table hidden behind a folder's reference chip
      // because a nest was undone would be the "where did my table go?"
      // failure the reference drawer exists to avoid.
      let roleUpdate: "primary" | "referenced" | undefined = undefined;

      // Dropping a reference at ROOT detaches it from its note.
      if (targetParentId === null && content.role === "referenced") {
        ownerNoteUpdate = null;
        if (content.contentType === "data") roleUpdate = "primary";
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

        // Nothing is ever stored under a shortcut. A shortcut-folder does
        // display its target's contents, but those rows are a client-side
        // mirror of the real folder — the drop is forwarded to that folder's
        // id before it reaches this route, so a shortcut id arriving here as a
        // destination means something bypassed the mirror.
        if (targetParent.contentType === "shortcut") {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message:
                  "Cannot move content into a shortcut. Move it into the folder the shortcut points to.",
              },
            },
            { status: 400 }
          );
        }

        if (targetParent.contentType !== "folder") {
          const isReferenceToNote =
            content.role === "referenced" &&
            targetParent.contentType === "note";
          // A shortcut may live anywhere, including under content that hosts
          // nothing else — the whole point is to put a pointer where the user
          // already looks. It stores plainly under the target parent: no
          // ownedByNoteId re-homing, because a shortcut is not referenced
          // content and must not partition behind a reference chip.
          const isShortcutNesting = content.contentType === "shortcut";
          // A promoted row page may return to ITS database (plan Phase 5:
          // rows are freely movable in both directions — promotion nested
          // it here server-side, so the tree must be able to put it back).
          // Only a row of exactly this table qualifies; other content gets
          // the same refusal as any non-folder target.
          const isRowReturningHome =
            !isReferenceToNote &&
            targetParent.contentType === "data" &&
            !!(await prisma.dataRow.findFirst({
              where: {
                contentId,
                tableId: targetParent.id,
                deletedAt: null,
              },
              select: { id: true },
            }));
          // A database may nest under another database (owner, 2026-09-13):
          // a linked set of tables has a natural head, and the tree should be
          // able to say so. The nested table becomes a reference behind its
          // host's chip and detaches again on any folder drop.
          const isDatabaseNesting =
            content.contentType === "data" &&
            targetParent.contentType === "data" &&
            !isRowReturningHome;
          if (isDatabaseNesting) {
            // Reference ownership is not parentId, so the parentId cycle
            // check below cannot see a loop built out of ownedByNoteId.
            // Walk the host's own chain instead; a bounded walk, because a
            // corrupt chain must not hang the request.
            let cursor: string | null = targetParent.id;
            for (let hop = 0; cursor && hop < 32; hop++) {
              if (cursor === contentId) {
                return NextResponse.json(
                  {
                    success: false,
                    error: {
                      code: "VALIDATION_ERROR",
                      message:
                        "That database is already nested inside this one — move it out first.",
                    },
                  },
                  { status: 400 }
                );
              }
              const host: { ownedByNoteId: string | null } | null =
                await prisma.contentNode.findUnique({
                  where: { id: cursor },
                  select: { ownedByNoteId: true },
                });
              cursor = host?.ownedByNoteId ?? null;
            }
          }
          if (
            !isReferenceToNote &&
            !isRowReturningHome &&
            !isShortcutNesting &&
            !isDatabaseNesting
          ) {
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
          if (isShortcutNesting) {
            // Stores plainly under targetParent — no ownerNoteUpdate, no
            // storage redirection. Deliberately falls through.
          } else if (isDatabaseNesting) {
            // Same shape as a reference re-home: display parentage via
            // ownedByNoteId, storage in the host's folder so path and
            // cascade invariants hold.
            ownerNoteUpdate = targetParent.id;
            storageTargetParentId = targetParent.parentId;
            roleUpdate = "referenced";
          } else if (isRowReturningHome) {
            // Restore promotion's canonical ownership (ownedByNoteId = the
            // table) so a referenced row page partitions back behind the
            // database's reference chip instead of dangling.
            ownerNoteUpdate = targetParent.id;
          } else {
            // Re-home the reference under this note; its storage home is the
            // note's folder so parentId invariants (paths, cascades, folder
            // scans) stay intact.
            ownerNoteUpdate = targetParent.id;
            storageTargetParentId = targetParent.parentId;
          }
        } else if (content.role === "referenced") {
          // Explicit drop into a folder detaches the reference from its
          // note — it becomes folder-level referenced content, adjacent to
          // primary content.
          ownerNoteUpdate = null;
          // A database dropped into a folder is a first-class table again,
          // not something filed behind that folder's reference chip.
          if (content.contentType === "data") roleUpdate = "primary";
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
          const result = await moveContentToPosition(
            contentId,
            finalParentId,
            { afterId, index: newDisplayOrder ?? 0 },
            session.user.id,
          );
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
        (ownerNoteUpdate !== undefined &&
          ownerNoteUpdate !== content.ownedByNoteId) ||
        (roleUpdate !== undefined && roleUpdate !== content.role)
      ) {
        await prisma.contentNode.update({
          where: { id: contentId },
          data: {
            ...(ownerNoteUpdate !== undefined
              ? { ownedByNoteId: ownerNoteUpdate }
              : {}),
            ...(roleUpdate !== undefined ? { role: roleUpdate } : {}),
          },
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
          // The folder kept a sort and this drag reordered it: the sort is
          // off now, and the client says so.
          sortCleared: updated.sortCleared,
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
  placement: SiblingPlacement,
  ownerId: string,
) {
  // ONE transaction, holding the order lock of every list it changes. The
  // sibling read used to sit outside the write: two moves into one folder
  // made close together (two quick drags, a drag while a paste ran, another
  // tab) each read the same list, and the later write renumbered every row
  // from its stale read — undoing the earlier move. That is the "the drag
  // didn't stick" a refresh revealed.
  return prisma.$transaction(async (tx) => {
    const current = await tx.contentNode.findUnique({
      where: { id: contentId },
      select: { parentId: true },
    });
    if (!current) throw new Error("Content not found");

    // The destination's list, and the list the row leaves (a move within
    // that list renumbers the row too).
    await lockSiblingOrder(tx, ownerId, [parentId, current.parentId]);

    // ownerId: without it, a move at the ROOT treated every user's root items
    // as siblings — renumbering their displayOrder and offsetting the index by
    // however many of them there were.
    const siblings = await tx.contentNode.findMany({
      where: { parentId, ownerId, deletedAt: null },
      select: { id: true, title: true, displayOrder: true, contentType: true },
    });
    // The same order the tree shows (sibling-order.ts) — renumbering from any
    // other order would reshuffle rows the user never touched.
    siblings.sort(compareSiblings);

    // A drag WITHIN a folder that keeps a sort (owner, 2026-10-06): your
    // order wins. Start from the order the folder SHOWS — its sort, which the
    // stored numbers may not yet reflect for rows that arrived since — place
    // the row there, and forget the folder's sort, so nothing else moves.
    // A row arriving from elsewhere leaves the sort on: it takes its sorted
    // place wherever it was dropped.
    const kept =
      current.parentId === parentId ? await readKeptSort(tx, ownerId, parentId) : null;
    const base: Array<{ id: string; title: string; displayOrder: number }> = kept
      ? applyKeptSort(await loadLevelRows(tx, ownerId, parentId), kept)
      : siblings;

    const movedItem =
      base.find((s) => s.id === contentId) ??
      (await tx.contentNode.findUnique({
        where: { id: contentId },
        select: { id: true, title: true, displayOrder: true, contentType: true },
      }));
    if (!movedItem) throw new Error("Content not found");

    // The same placement the client's optimistic update uses, so the row
    // lands where it was shown.
    const ordered = placeAmongSiblings(base, movedItem, placement);

    // Only rows whose number changes, in one statement, and without
    // `updatedAt`: reordering is not editing (see `renumbering`).
    await applyRenumbering(tx, renumbering(ordered, contentId));
    if (kept && parentId) await writeKeptSort(tx, parentId, null);

    const moved = await tx.contentNode.update({
      where: { id: contentId },
      data: { parentId, displayOrder: ordered.findIndex((row) => row.id === contentId) },
      select: { id: true, parentId: true, displayOrder: true },
    });
    return { ...moved, sortCleared: Boolean(kept) };
  }, ORDER_TRANSACTION);
}
