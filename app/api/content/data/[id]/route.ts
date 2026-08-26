/**
 * Database table API — schema + first page.
 *
 * GET /api/content/data/[id]?view=<viewId>
 *
 * Returns the table's schema (columns, views) and one page of rows for the
 * resolved view. One round trip opens a database.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import {
  canRead,
  resolveDataTableAccess,
} from "@/lib/domain/data/server/access";
import {
  loadRowPage,
  loadTable,
  resolveView,
} from "@/lib/domain/data/server/queries";
import {
  buildQueryColumns,
  loadQueryRows,
  parseContentQuery,
} from "@/lib/domain/data/server/query-mode";
import { prisma } from "@/lib/database/client";
import { after } from "next/server";
import { markContextDirty } from "@/lib/domain/ai-context/context-dirty";
import { canAlterSchema } from "@/lib/domain/data/server/access";
import { Prisma } from "@/lib/database/generated/prisma";

const ROUTE_PATH = "/api/content/data/[id]";

type Params = Promise<{ id: string }>;

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth()
      );
      const { id } = await params;
      const requestedViewId = request.nextUrl.searchParams.get("view");

      const level = await resolveDataTableAccess(id, session.user.id);
      if (!canRead(level)) {
        // 404 rather than 403: confirming a table exists is itself a
        // disclosure when the caller has no business knowing.
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Database not found" } },
          { status: 404 }
        );
      }

      const table = await withSpan(
        { layer: "content", name: "data_table_load" },
        { attrs: { content_id: id } },
        async () => loadTable(id, session.user.id)
      );

      if (!table) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Database not found" } },
          { status: 404 }
        );
      }

      const view = resolveView(table, requestedViewId);

      // Query mode (plan Phase 3): rows ARE ContentNodes. The response
      // keeps the inline shape exactly, so the whole Phase 2 view stack
      // renders it unchanged — synthesized columns, node-backed rows,
      // and the saved query alongside for the editor.
      if (table.mode === "query") {
        const payload = await prisma.dataPayload.findUnique({
          where: { contentId: id },
          select: { source: true, content: { select: { ownerId: true } } },
        });
        const query = parseContentQuery(payload?.source);
        const rows = await loadQueryRows(
          payload?.content.ownerId ?? session.user.id,
          session.user.id,
          query
        );
        return NextResponse.json({
          success: true,
          data: {
            table: { ...table, columns: buildQueryColumns(), query },
            view,
            rows,
            nextCursor: null,
            total: rows.length,
            accessLevel: level,
            serverTime: new Date().toISOString(),
          },
        });
      }

      const page = await withSpan(
        { layer: "content", name: "data_rows_first_page" },
        { attrs: { view_id: view?.id ?? "none" } },
        async (span) => {
          const result = await loadRowPage({
            tableId: id,
            view,
            columns: table.columns,
            viewerId: session.user.id,
          });
          span.attr("rows", result.rows.length).attr("total", result.total);
          return result;
        }
      );

      return NextResponse.json({
        success: true,
        data: {
          table,
          view,
          rows: page.rows,
          nextCursor: page.nextCursor,
          total: page.total,
          accessLevel: level,
          /** Poller baseline — the client sends this back as `since`. */
          serverTime: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:table_get:caught",
        summary: "failed to load database table",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to load database" } },
        { status: 500 }
      );
    }
  });
}

// ── PATCH — edit the saved query (query-mode tables only) ────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;

      const level = await resolveDataTableAccess(id, session.user.id);
      if (!canRead(level)) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Database not found" } },
          { status: 404 }
        );
      }
      // The query defines what the table SHOWS — schema-tier, not cell-tier.
      if (!canAlterSchema(level)) {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "Only the owner can change the query" } },
          { status: 403 }
        );
      }

      const payload = await prisma.dataPayload.findUnique({
        where: { contentId: id },
        select: { mode: true },
      });
      if (!payload) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Database not found" } },
          { status: 404 }
        );
      }
      if (payload.mode !== "query") {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Only query databases have a saved query" } },
          { status: 400 }
        );
      }

      const body = (await request.json()) as { query?: unknown };
      const query = parseContentQuery(body.query);

      await prisma.dataPayload.update({
        where: { contentId: id },
        data: { source: query as unknown as Prisma.InputJsonValue },
      });

      // The query IS the table's semantics — the AI digest must follow.
      after(() => markContextDirty([id]));

      return NextResponse.json({ success: true, data: { query } });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:query_patch:caught",
        summary: "failed to update saved query",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to update the query" } },
        { status: 500 }
      );
    }
  });
}
