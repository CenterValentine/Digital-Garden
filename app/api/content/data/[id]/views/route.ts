/**
 * Database views API (plan Phase 2 / O14).
 *
 * POST   /api/content/data/[id]/views  — create a view
 * PATCH  /api/content/data/[id]/views  — rename / access / set default
 * DELETE /api/content/data/[id]/views  — delete (never the last one)
 *
 * The access model is Airtable's three states (plan O14):
 *  - collaborative — anyone with write access edits the config
 *  - personal      — only its owner sees or edits it (loadTable filters it
 *                    from everyone else's bar)
 *  - locked        — config frozen for EVERYONE, records stay editable;
 *                    the only permitted change is unlocking, by the view's
 *                    owner or the table's owner
 *
 * View config changes never call markContextDirty: views carry no semantics
 * the AI digest reads beyond their names, and name churn is not worth
 * regeneration (plan B1 route discipline).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace } from "@/lib/core/logger";
import {
  canWrite,
  resolveDataTableAccess,
} from "@/lib/domain/data/server/access";
import { keyAtEnd } from "@/lib/domain/data";

/** Modes with a renderer today. The enum-free VarChar means adding one
 * later is a UI change, never a migration (plan D11). */
const IMPLEMENTED_VIEW_MODES = ["grid", "board"] as const;

const ROUTE_PATH = "/api/content/data/[id]/views";

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

const VIEW_ACCESS = ["collaborative", "personal", "locked"] as const;

async function authorize(id: string) {
  const session = await requireAuth();
  const level = await resolveDataTableAccess(id, session.user.id);
  if (level === "none") return { error: notFound() } as const;
  if (!canWrite(level)) {
    return { error: forbidden("You cannot change this database's views") } as const;
  }
  return { session, level } as const;
}

// ── POST ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, { params }: { params: Params }) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { id } = await params;
      const gate = await authorize(id);
      if ("error" in gate) return gate.error;

      const body = (await request.json()) as { name?: string };

      const last = await prisma.dataView.findFirst({
        where: { tableId: id },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const count = await prisma.dataView.count({ where: { tableId: id } });

      const view = await prisma.dataView.create({
        data: {
          tableId: id,
          ownerId: gate.session.user.id,
          name: body.name?.trim().slice(0, 255) || `View ${count + 1}`,
          mode: "grid",
          access: "collaborative",
          filters: { op: "and", children: [] },
          sorts: [],
          columnPrefs: {},
          config: {},
          position: keyAtEnd(last?.position ?? null),
        },
        select: { id: true },
      });

      return NextResponse.json({ success: true, data: { viewId: view.id } });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:view_post:caught",
        summary: "failed to create view",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to create view" } },
        { status: 500 }
      );
    }
  });
}

// ── PATCH ────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { id } = await params;
      const gate = await authorize(id);
      if ("error" in gate) return gate.error;
      const userId = gate.session.user.id;

      const body = (await request.json()) as {
        viewId?: string;
        name?: string;
        access?: string;
        makeDefault?: boolean;
        mode?: string;
        groupByColumnId?: string | null;
      };
      if (!body.viewId) return badRequest("`viewId` is required");
      if (body.name !== undefined && !body.name.trim()) {
        return badRequest("A view needs a name");
      }
      if (
        body.access !== undefined &&
        !VIEW_ACCESS.includes(body.access as (typeof VIEW_ACCESS)[number])
      ) {
        return badRequest("access must be collaborative, personal, or locked");
      }
      if (
        body.mode !== undefined &&
        !IMPLEMENTED_VIEW_MODES.includes(
          body.mode as (typeof IMPLEMENTED_VIEW_MODES)[number]
        )
      ) {
        return badRequest(
          `That view mode is not built yet. Available: ${IMPLEMENTED_VIEW_MODES.join(", ")}`
        );
      }
      // A board groups by a single-value option column. Validating the
      // TYPE here keeps the renderer's assumption ("options exist, cells
      // hold one id") true by construction.
      if (body.groupByColumnId != null) {
        const column = await prisma.dataColumn.findFirst({
          where: {
            id: body.groupByColumnId,
            tableId: id,
            deletedAt: null,
            type: { in: ["status", "select"] },
          },
          select: { id: true },
        });
        if (!column) {
          return badRequest("Boards group by a Status or Select column");
        }
      }

      const view = await prisma.dataView.findFirst({
        where: { id: body.viewId, tableId: id },
        select: { ownerId: true, access: true },
      });
      if (!view) return notFound("View");

      const isViewOwner = view.ownerId === userId;
      const isTableOwner = gate.level === "owner";

      // Personal views belong to their owner alone — everyone else's bar
      // does not even show them, so a foreign PATCH is always an error.
      if (view.access === "personal" && !isViewOwner) {
        return forbidden("This is someone's personal view");
      }
      // Locked freezes config for EVERYONE including its creator; the one
      // legal change is unlocking (an access-only patch) by the view's
      // owner or the table's owner.
      if (view.access === "locked") {
        const accessOnly =
          body.access !== undefined &&
          body.name === undefined &&
          body.mode === undefined &&
          body.groupByColumnId === undefined &&
          !body.makeDefault;
        if (!accessOnly || !(isViewOwner || isTableOwner)) {
          return forbidden("This view is locked — unlock it first");
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.dataView.update({
          where: { id: body.viewId },
          data: {
            ...(body.name !== undefined
              ? { name: body.name.trim().slice(0, 255) }
              : {}),
            ...(body.access !== undefined ? { access: body.access } : {}),
            ...(body.mode !== undefined ? { mode: body.mode } : {}),
            ...(body.groupByColumnId !== undefined
              ? { groupByColumnId: body.groupByColumnId }
              : {}),
          },
        });
        if (body.makeDefault) {
          await tx.dataPayload.update({
            where: { contentId: id },
            data: { defaultViewId: body.viewId },
          });
        }
      });

      return NextResponse.json({ success: true, data: { viewId: body.viewId } });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:view_patch:caught",
        summary: "failed to update view",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to update view" } },
        { status: 500 }
      );
    }
  });
}

// ── DELETE ───────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { id } = await params;
      const gate = await authorize(id);
      if ("error" in gate) return gate.error;
      const userId = gate.session.user.id;

      const body = (await request.json()) as { viewId?: string };
      if (!body.viewId) return badRequest("`viewId` is required");

      const view = await prisma.dataView.findFirst({
        where: { id: body.viewId, tableId: id },
        select: { ownerId: true, access: true },
      });
      if (!view) return notFound("View");

      if (view.access === "personal" && view.ownerId !== userId) {
        return forbidden("This is someone's personal view");
      }
      if (view.access === "locked") {
        return forbidden("This view is locked — unlock it first");
      }

      const count = await prisma.dataView.count({ where: { tableId: id } });
      if (count <= 1) {
        // A table with zero views has no way to render. The last view is
        // renamed or reconfigured, never removed.
        return badRequest("A database keeps at least one view");
      }

      await prisma.$transaction(async (tx) => {
        await tx.dataView.delete({ where: { id: body.viewId } });
        // Repoint a dangling default at the first survivor. resolveView
        // would fall back anyway; this keeps the stored state honest.
        const payload = await tx.dataPayload.findUnique({
          where: { contentId: id },
          select: { defaultViewId: true },
        });
        if (payload?.defaultViewId === body.viewId) {
          const first = await tx.dataView.findFirst({
            where: { tableId: id },
            orderBy: { position: "asc" },
            select: { id: true },
          });
          await tx.dataPayload.update({
            where: { contentId: id },
            data: { defaultViewId: first?.id ?? null },
          });
        }
      });

      return NextResponse.json({ success: true, data: { deleted: true } });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:view_delete:caught",
        summary: "failed to delete view",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to delete view" } },
        { status: 500 }
      );
    }
  });
}
