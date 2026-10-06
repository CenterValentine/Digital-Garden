/**
 * Sort ONE level of the tree — POST /api/content/content/reorder
 *
 *   body: { parentId: string | null, mode: "float-folders" | "float-nested" | "name" | "stop" }
 *     → sorts the items directly inside `parentId` and stores the result as
 *       their order; nothing inside them is touched.
 *       A FOLDER remembers its sort and stays sorted (owner, 2026-10-06 —
 *       FolderPayload.viewPrefs.treeSort): choosing a float toggles it, Name
 *       cycles A–Z / Z–A, "stop" forgets it. The order stored is the one the
 *       folder shows, so starting or stopping never makes rows jump.
 *       The TOP of the vault (parentId null) has no folder to remember on:
 *       there a sort happens once, and Name goes A–Z, or Z–A when the level
 *       is already A–Z.
 *     ← { changed, direction?, kept?, previous: [{ id, displayOrder }], previousKept? }
 *
 *   body: { parentId, restore: [{ id, displayOrder }], kept?: KeptSort | null }
 *     → puts those numbers (and the folder's previous sort) back — the
 *       toast's Undo. Only live items directly inside `parentId` are accepted.
 *
 * All of it under the level's order lock (sibling-slot.ts), like a drag.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import { isUuid } from "@/lib/domain/content/uuid";
import {
  applyKeptSort,
  nextKeptSort,
  parseKeptSort,
  renumbering,
  sortLevel,
  type LevelSortMode,
} from "@/lib/domain/content/sibling-order";
import {
  applyRenumbering,
  loadLevelRows,
  lockSiblingOrder,
  readKeptSort,
  writeKeptSort,
} from "@/lib/domain/content/sibling-slot";

const ROUTE_PATH = "/api/content/content/reorder";
const MODES: ReadonlyArray<LevelSortMode | "stop"> = ["float-folders", "float-nested", "name", "stop"];

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
        kept?: unknown;
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
          // The folder's sort as it was, too (absent = leave it alone).
          if (parentId && body.kept !== undefined) {
            await writeKeptSort(tx, parentId, parseKeptSort(body.kept));
          }
          return changes.length;
        });
        return NextResponse.json({ success: true, data: { restored } });
      }

      // ── Sort ─────────────────────────────────────────────────────────────
      if (typeof body.mode !== "string" || !MODES.includes(body.mode as LevelSortMode | "stop")) {
        return badRequest("`mode` must be float-folders, float-nested, name or stop");
      }
      const mode = body.mode as LevelSortMode | "stop";
      if (parentId === null && mode === "stop") {
        return badRequest("The top level has no remembered sort to stop");
      }

      const result = await prisma.$transaction(async (tx) => {
        await lockSiblingOrder(tx, ownerId, [parentId]);
        const rows = await loadLevelRows(tx, ownerId, parentId);
        const previous = rows.map((row) => ({ id: row.id, displayOrder: row.displayOrder }));

        // The top of the vault: sorted once, nothing remembered.
        if (parentId === null) {
          const { ordered, direction } = sortLevel(rows, mode as LevelSortMode);
          const changes = renumbering(ordered, "");
          await applyRenumbering(tx, changes);
          return { changed: changes.length, direction, previous };
        }

        // A folder: start from the order it SHOWS (its current sort, if any),
        // update its memory, and store the order the new sort gives — rows
        // already in place are left alone, and no row's `updatedAt` moves.
        const previousKept = await readKeptSort(tx, ownerId, parentId);
        const kept = nextKeptSort(previousKept, mode);
        const shown = previousKept ? applyKeptSort(rows, previousKept) : rows;
        const ordered = kept ? applyKeptSort(shown, kept) : shown;
        const changes = renumbering(ordered, "");
        await applyRenumbering(tx, changes);
        await writeKeptSort(tx, parentId, kept);
        return {
          changed: changes.length,
          direction: kept?.name,
          kept,
          previous,
          previousKept,
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
