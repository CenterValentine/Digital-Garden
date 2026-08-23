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
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import {
  canAlterSchema,
  canRead,
  resolveDataTableAccess,
} from "@/lib/domain/data/server/access";
import {
  createColumn,
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
      };

      if (!body.columnId) return badRequest("`columnId` is required");
      if (
        body.name === undefined &&
        body.description === undefined &&
        body.config === undefined
      ) {
        return badRequest("Nothing to update");
      }
      if (body.name !== undefined && !body.name.trim()) {
        return badRequest("A column needs a name");
      }
      if (body.description && body.description.length > 280) {
        // Capped so a description cannot become prose that blows the AI
        // capsule's budget (plan D9).
        return badRequest("Description is limited to 280 characters");
      }

      await updateColumn(body.columnId, {
        name: body.name?.trim(),
        description: body.description,
        config: body.config,
      });

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
        return NextResponse.json({ success: true, data: { restored: true } });
      }

      const result = await softDeleteColumn(body.columnId);
      if (!result.ok) return forbidden(result.reason ?? "Cannot delete column");

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
