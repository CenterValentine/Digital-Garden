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

      const page = await withSpan(
        { layer: "content", name: "data_rows_first_page" },
        { attrs: { view_id: view?.id ?? "none" } },
        async (span) => {
          const result = await loadRowPage({
            tableId: id,
            view,
            columns: table.columns,
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
