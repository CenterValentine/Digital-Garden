/**
 * Database columns API — the schema surface.
 *
 * POST   /api/content/data/[id]/columns  — add a column
 * PATCH  /api/content/data/[id]/columns  — rename / describe / reconfigure
 * DELETE /api/content/data/[id]/columns  — soft-delete or restore
 *
 * Guarded by `canAlterSchema`, which is deliberately STRICTER than the write
 * permission used for cells (plan Phase 6). A bad cell write damages one
 * value; a bad column change can invalidate every row in the table. They are
 * not the same permission and should not share a gate.
 *
 * Changing a column's TYPE is not offered at all (plan O4) — create a new
 * column and migrate.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/database/client";
import { markContextDirty } from "@/lib/domain/ai-context/context-dirty";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import {
  canAlterSchema,
  canRead,
  resolveDataTableAccess,
} from "@/lib/domain/data/server/access";
import {
  createColumn,
  createRelationPair,
  restoreColumn,
  softDeleteColumn,
  updateColumn,
} from "@/lib/domain/data/server/mutations";
import {
  IMPLEMENTED_COLUMN_TYPES,
  type DataColumnConfig,
  type DataColumnType,
} from "@/lib/domain/data";

const ROUTE_PATH = "/api/content/data/[id]/columns";

type Params = Promise<{ id: string }>;

const notFound = () =>
  NextResponse.json(
    { success: false, error: { code: "NOT_FOUND", message: "Database not found" } },
    { status: 404 }
  );

const forbidden = (message = "You cannot change this database's columns") =>
  NextResponse.json(
    { success: false, error: { code: "FORBIDDEN", message } },
    { status: 403 }
  );

const badRequest = (message: string) =>
  NextResponse.json(
    { success: false, error: { code: "VALIDATION_ERROR", message } },
    { status: 400 }
  );

/** Gate shared by all three verbs. */
async function authorize(id: string) {
  const session = await requireAuth();
  const level = await resolveDataTableAccess(id, session.user.id);
  if (!canRead(level)) return { error: notFound() } as const;
  if (!canAlterSchema(level)) return { error: forbidden() } as const;
  const payload = await prisma.dataPayload.findUnique({
    where: { contentId: id },
    select: { mode: true },
  });
  // Query tables have no DataColumn rows — their "columns" are synthesized
  // node projections (plan Phase 3), so the schema surface is sealed.
  if (payload?.mode === "query") {
    return {
      error: badRequest("Query databases project note fields — they have no editable columns"),
    } as const;
  }
  return { session } as const;
}

// ── POST ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, { params }: { params: Params }) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { id } = await params;
      const gate = await authorize(id);
      if ("error" in gate) return gate.error;

      const body = (await request.json()) as {
        name?: string;
        type?: string;
        description?: string | null;
        config?: DataColumnConfig;
        /** Relation only: also create the mirrored column on the target. */
        createBacklink?: boolean;
      };

      const name = body.name?.trim();
      if (!name) return badRequest("A column needs a name");

      // Only offer what is actually implemented — the enum declares far more
      // (plan D11), and letting a caller pick an unimplemented type would
      // create a column no renderer can display.
      if (
        !body.type ||
        !IMPLEMENTED_COLUMN_TYPES.includes(body.type as DataColumnType)
      ) {
        return badRequest(
          `Unsupported column type. Available: ${IMPLEMENTED_COLUMN_TYPES.join(", ")}`
        );
      }

      // Relation columns must point at a real database the creator can
      // read (plan Phase 4) — validated here so the renderer's assumption
      // ("config.relationTableId is a data table") holds by construction.
      if (body.type === "relation") {
        const targetId = body.config?.relationTableId;
        if (!targetId) {
          return badRequest("A relation column needs a target database");
        }
        const targetLevel = await resolveDataTableAccess(
          targetId,
          gate.session.user.id
        );
        if (!canRead(targetLevel)) {
          return badRequest("Relation target database not found");
        }
      }

      // Backlink pair (plan Phase 4, appendix): one transaction creates the
      // forward column here and its mirror on the target — which needs
      // SCHEMA rights over there too. Named after THIS table, the way the
      // reverse direction reads from the other side.
      if (body.type === "relation" && body.createBacklink) {
        const targetId = body.config!.relationTableId!;
        const targetLevel = await resolveDataTableAccess(
          targetId,
          gate.session.user.id
        );
        if (!canAlterSchema(targetLevel)) {
          return forbidden(
            "Creating a linked column on the target needs schema access there"
          );
        }
        const sourceNode = await prisma.contentNode.findUnique({
          where: { id },
          select: { title: true },
        });
        const pair = await withSpan(
          { layer: "content", name: "data_relation_pair_create" },
          { attrs: { target: targetId } },
          async () =>
            createRelationPair(
              id,
              targetId,
              { name, description: body.description ?? null },
              sourceNode?.title ?? "Linked"
            )
        );
        after(() => markContextDirty([id, targetId]));
        return NextResponse.json({
          success: true,
          data: { columnId: pair.forwardId, backlinkId: pair.backlinkId },
        });
      }

      const columnId = await withSpan(
        { layer: "content", name: "data_column_create" },
        { attrs: { column_type: body.type } },
        async () =>
          createColumn(id, {
            name,
            type: body.type as DataColumnType,
            description: body.description ?? null,
            config: body.config,
          })
      );

      // Schema changed → the AI digest changed (plan B1 route discipline).
      after(() => markContextDirty([id]));
      return NextResponse.json({ success: true, data: { columnId } });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:column_post:caught",
        summary: "failed to create column",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to add column" } },
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

      const body = (await request.json()) as {
        columnId?: string;
        name?: string;
        description?: string | null;
        config?: DataColumnConfig;
        position?: string;
      };

      if (!body.columnId) return badRequest("`columnId` is required");
      if (
        body.name === undefined &&
        body.description === undefined &&
        body.config === undefined &&
        body.position === undefined
      ) {
        return badRequest("Nothing to update");
      }
      if (
        body.position !== undefined &&
        (typeof body.position !== "string" ||
          body.position.length === 0 ||
          body.position.length > 64)
      ) {
        return badRequest("`position` must be a fractional key");
      }
      if (body.name !== undefined && !body.name.trim()) {
        return badRequest("A column needs a name");
      }
      if (body.description && body.description.length > 280) {
        // Capped so a description cannot become prose that blows the AI
        // capsule's budget (plan D9).
        return badRequest("Description is limited to 280 characters");
      }

      // A relation's TARGET is set once (same doctrine as O4's frozen
      // types). Retargeting would leave existing DataRowLinks pointing into
      // the old table while new links go to the new one — a mixed bag no
      // renderer or rollup can make sense of — and purging them instead
      // would be mass link destruction with no undo op. New target = new
      // column; the old one soft-deletes recoverably.
      if (body.config !== undefined) {
        const existing = await prisma.dataColumn.findFirst({
          where: { id: body.columnId, tableId: id },
          select: { type: true, config: true },
        });
        if (existing?.type === "relation") {
          const currentTarget = (
            existing.config as { relationTableId?: string } | null
          )?.relationTableId;
          if (
            body.config.relationTableId !== undefined &&
            body.config.relationTableId !== currentTarget
          ) {
            return badRequest(
              "A relation's target database is set once — create a new column to relate to a different database"
            );
          }
        }
      }

      await updateColumn(body.columnId, {
        name: body.name?.trim(),
        description: body.description,
        config: body.config,
        position: body.position,
      });

      // Name/description/config are semantic; a position-only PATCH is a
      // drag-reorder and deliberately does NOT dirty context (plan B1).
      if (
        body.name !== undefined ||
        body.description !== undefined ||
        body.config !== undefined
      ) {
        after(() => markContextDirty([id]));
      }
      return NextResponse.json({ success: true, data: { columnId: body.columnId } });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:column_patch:caught",
        summary: "failed to update column",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to update column" } },
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

      const body = (await request.json()) as {
        columnId?: string;
        restore?: boolean;
      };
      if (!body.columnId) return badRequest("`columnId` is required");

      // Restore is undo's path, and it is idempotent — cell data was never
      // removed, so this is a metadata flip (plan B4.5).
      if (body.restore) {
        await restoreColumn(body.columnId);
        after(() => markContextDirty([id]));
        return NextResponse.json({ success: true, data: { restored: true } });
      }

      const result = await softDeleteColumn(body.columnId);
      if (!result.ok) return forbidden(result.reason ?? "Cannot delete column");

      after(() => markContextDirty([id]));
      return NextResponse.json({ success: true, data: { deleted: true } });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:column_delete:caught",
        summary: "failed to delete column",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to delete column" } },
        { status: 500 }
      );
    }
  });
}
