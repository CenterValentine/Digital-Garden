/**
 * Relation links API (plan Phase 4).
 *
 * POST   /api/content/data/[id]/links  — link a row to a target row
 * DELETE /api/content/data/[id]/links  — remove a link
 *
 * Links live ONLY in DataRowLink (plan D4) — one source of truth, both
 * directions indexed, never mirrored into row JSON. Writes require write
 * access to THIS table plus the ability to SEE the target's table: you can
 * link only to rows you could open, which keeps a relation from becoming a
 * blind pointer into content you were never granted (plan V1-3).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace } from "@/lib/core/logger";
import {
  canRead,
  canWrite,
  resolveDataTableAccess,
} from "@/lib/domain/data/server/access";
import { keyAtEnd } from "@/lib/domain/data";

const ROUTE_PATH = "/api/content/data/[id]/links";

type Params = Promise<{ id: string }>;

const notFound = (what = "Database") =>
  NextResponse.json(
    { success: false, error: { code: "NOT_FOUND", message: `${what} not found` } },
    { status: 404 }
  );

const forbidden = (message: string) =>
  NextResponse.json(
    { success: false, error: { code: "FORBIDDEN", message } },
    { status: 403 }
  );

const badRequest = (message: string) =>
  NextResponse.json(
    { success: false, error: { code: "VALIDATION_ERROR", message } },
    { status: 400 }
  );

// ── POST ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, { params }: { params: Params }) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;

      const level = await resolveDataTableAccess(id, session.user.id);
      if (!canRead(level)) return notFound();
      if (!canWrite(level)) return forbidden("You cannot edit this database");

      const body = (await request.json()) as {
        columnId?: string;
        fromRowId?: string;
        toRowId?: string;
      };
      if (!body.columnId || !body.fromRowId || !body.toRowId) {
        return badRequest("columnId, fromRowId and toRowId are required");
      }

      // The column must be a live relation column ON THIS TABLE.
      const column = await prisma.dataColumn.findFirst({
        where: {
          id: body.columnId,
          tableId: id,
          type: "relation",
          deletedAt: null,
        },
        select: { config: true },
      });
      if (!column) return badRequest("Not a relation column on this database");
      const config = column.config as {
        relationTableId?: string;
        symmetricColumnId?: string;
        isBacklink?: boolean;
      } | null;
      // Backlink columns own no links — they read the forward column's rows
      // in reverse. Writing through them would create orphan links no
      // hydration path ever reads; the client writes to the FORWARD column
      // on the other table instead.
      if (config?.isBacklink) {
        return badRequest(
          "This column mirrors a relation on the other database — link from there"
        );
      }
      const relationTableId = config?.relationTableId;

      // Source row belongs here; target row belongs to the CONFIGURED table.
      const [fromRow, toRow] = await Promise.all([
        prisma.dataRow.findFirst({
          where: { id: body.fromRowId, tableId: id, deletedAt: null },
          select: { id: true },
        }),
        prisma.dataRow.findFirst({
          where: { id: body.toRowId, deletedAt: null },
          select: { id: true, tableId: true },
        }),
      ]);
      if (!fromRow) return notFound("Row");
      if (!toRow || (relationTableId && toRow.tableId !== relationTableId)) {
        return badRequest("Target row is not in this relation's database");
      }

      // Linking requires SEEING the target — read access on its table.
      const targetLevel = await resolveDataTableAccess(
        toRow.tableId,
        session.user.id
      );
      if (!canRead(targetLevel)) {
        return forbidden("You cannot link to rows you cannot see");
      }

      const last = await prisma.dataRowLink.findFirst({
        where: { columnId: body.columnId, fromRowId: body.fromRowId },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      // Unique (columnId, fromRowId, toRowId) makes re-linking idempotent.
      const link = await prisma.dataRowLink.upsert({
        where: {
          columnId_fromRowId_toRowId: {
            columnId: body.columnId,
            fromRowId: body.fromRowId,
            toRowId: body.toRowId,
          },
        },
        create: {
          columnId: body.columnId,
          fromRowId: body.fromRowId,
          toRowId: body.toRowId,
          position: keyAtEnd(last?.position ?? null),
        },
        update: {},
        select: { id: true },
      });

      return NextResponse.json({ success: true, data: { linkId: link.id } });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:link_post:caught",
        summary: "failed to create link",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to link rows" } },
        { status: 500 }
      );
    }
  });
}

// ── DELETE ───────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;

      const level = await resolveDataTableAccess(id, session.user.id);
      if (!canRead(level)) return notFound();
      if (!canWrite(level)) return forbidden("You cannot edit this database");

      const body = (await request.json()) as { linkId?: string };
      if (!body.linkId) return badRequest("`linkId` is required");

      // Scope the delete to links whose SOURCE row lives on this table —
      // holding write on some other table must not delete links here.
      const link = await prisma.dataRowLink.findFirst({
        where: { id: body.linkId, from: { tableId: id } },
        select: { id: true },
      });
      if (!link) return notFound("Link");

      await prisma.dataRowLink.delete({ where: { id: link.id } });
      return NextResponse.json({ success: true, data: { deleted: true } });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:link_delete:caught",
        summary: "failed to delete link",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to unlink rows" } },
        { status: 500 }
      );
    }
  });
}
