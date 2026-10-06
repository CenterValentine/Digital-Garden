/**
 * Sort ONE level of the tree — POST /api/content/content/reorder
 *
 *   body: { parentId: string | null, mode: "float-folders" | "float-nested" | "name" }
 *     → reorders the items directly inside `parentId` (null = the top level)
 *       and stores it as their order. Nothing inside them is touched, and
 *       nothing about the sort is remembered (owner, 2026-10-06): it is a
 *       one-time rearrangement, like dragging every row into place.
 *       `name` goes A→Z, or Z→A when the level is already A→Z (the toggle).
 *     ← { changed, direction?, previous: [{ id, displayOrder }] }
 *
 *   body: { parentId, restore: [{ id, displayOrder }] }
 *     → puts those numbers back (the toast's Undo). Only live items directly
 *       inside `parentId` are accepted.
 *
 * Both run under the level's order lock (sibling-slot.ts), like a drag.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import { isUuid } from "@/lib/domain/content/uuid";
import {
  compareSiblings,
  isFolderLike,
  renumbering,
  sortLevel,
  type LevelSortMode,
  type LevelSortRow,
} from "@/lib/domain/content/sibling-order";
import { applyRenumbering, lockSiblingOrder } from "@/lib/domain/content/sibling-slot";

const ROUTE_PATH = "/api/content/content/reorder";
const MODES: readonly LevelSortMode[] = ["float-folders", "float-nested", "name"];

function badRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const ownerId = session.user.id;
      const body = (await request.json()) as {
        parentId?: unknown;
        mode?: unknown;
        restore?: unknown;
      };

      // Required, so a request that forgot it can't sort the top level.
      let parentId: string | null = null;
      if (body.parentId !== null) {
        if (typeof body.parentId !== "string" || !isUuid(body.parentId)) {
          return badRequest("`parentId` must be a folder id or null");
        }
        parentId = body.parentId;
      }
      if (parentId !== null) {
        const parent = await prisma.contentNode.findFirst({
          where: { id: parentId, ownerId, deletedAt: null },
          select: { id: true },
        });
        if (!parent) {
          return NextResponse.json({ success: false, error: "Folder not found" }, { status: 404 });
        }
      }

      // ── Undo: put the previous numbers back ──────────────────────────────
      if (body.restore !== undefined) {
        if (!Array.isArray(body.restore)) return badRequest("`restore` must be a list");
        const restore = body.restore.filter(
          (entry): entry is { id: string; displayOrder: number } =>
            !!entry &&
            typeof entry === "object" &&
            typeof (entry as { id?: unknown }).id === "string" &&
            isUuid((entry as { id: string }).id) &&
            Number.isInteger((entry as { displayOrder?: unknown }).displayOrder),
        );
        const restored = await prisma.$transaction(async (tx) => {
          await lockSiblingOrder(tx, ownerId, [parentId]);
          const live = await tx.contentNode.findMany({
            where: { id: { in: restore.map((entry) => entry.id) }, parentId, ownerId, deletedAt: null },
            select: { id: true },
          });
          const allowed = new Set(live.map((row) => row.id));
          const changes = restore.filter((entry) => allowed.has(entry.id));
          await applyRenumbering(tx, changes);
          return changes.length;
        });
        return NextResponse.json({ success: true, data: { restored } });
      }

      // ── Sort ─────────────────────────────────────────────────────────────
      if (typeof body.mode !== "string" || !MODES.includes(body.mode as LevelSortMode)) {
        return badRequest("`mode` must be float-folders, float-nested or name");
      }
      const mode = body.mode as LevelSortMode;

      const result = await prisma.$transaction(async (tx) => {
        await lockSiblingOrder(tx, ownerId, [parentId]);
        const siblings = await tx.contentNode.findMany({
          where: { parentId, ownerId, deletedAt: null },
          select: {
            id: true,
            title: true,
            displayOrder: true,
            contentType: true,
            shortcutPayload: {
              select: {
                targetContentId: true,
                target: { select: { contentType: true, deletedAt: true } },
              },
            },
            _count: { select: { children: { where: { deletedAt: null, role: "primary" } } } },
          },
        });
        siblings.sort(compareSiblings);
        const rows: LevelSortRow[] = siblings.map((sibling) => ({
          id: sibling.id,
          title: sibling.title,
          displayOrder: sibling.displayOrder,
          folderLike: isFolderLike({
            contentType: sibling.contentType,
            shortcut: sibling.shortcutPayload
              ? {
                  targetId: sibling.shortcutPayload.targetContentId,
                  targetDeleted: Boolean(sibling.shortcutPayload.target?.deletedAt),
                  targetContentType: sibling.shortcutPayload.target?.contentType ?? null,
                }
              : null,
          }),
          nested: sibling._count.children > 0,
        }));
        const { ordered, direction } = sortLevel(rows, mode);
        // Rows already at their new position are left alone, and no row's
        // `updatedAt` moves: sorting is not editing.
        const changes = renumbering(ordered, "");
        await applyRenumbering(tx, changes);
        return {
          changed: changes.length,
          direction,
          previous: siblings.map((sibling) => ({ id: sibling.id, displayOrder: sibling.displayOrder })),
        };
      });

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "tree_reorder:caught",
        summary: `POST ${ROUTE_PATH} caught — 500`,
        error,
      });
      return NextResponse.json({ success: false, error: "Sort failed" }, { status: 500 });
    }
  });
}
