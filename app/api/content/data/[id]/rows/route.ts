/**
 * Database rows API.
 *
 * GET    /api/content/data/[id]/rows?view=&cursor=&since=  — page, or changes
 * POST   /api/content/data/[id]/rows                        — append rows
 * PATCH  /api/content/data/[id]/rows                        — write cells (CAS)
 * DELETE /api/content/data/[id]/rows                        — soft-delete / restore
 *
 * Every path resolves access first (plan B3). Cell writes honour the
 * compare-and-swap preconditions undo relies on — a `stale` result is a
 * first-class outcome, not an error, and the client must surface it rather
 * than retrying (plan B4.2).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import {
  canRead,
  canWrite,
  resolveDataTableAccess,
} from "@/lib/domain/data/server/access";
import {
  loadRowChanges,
  loadRowPage,
  loadTable,
  resolveView,
} from "@/lib/domain/data/server/queries";
import {
  createRows,
  restoreRows,
  softDeleteRows,
  writeCells,
  type CellWrite,
} from "@/lib/domain/data/server/mutations";
import { DEFAULT_ROW_PAGE_SIZE } from "@/lib/domain/data";

const ROUTE_PATH = "/api/content/data/[id]/rows";

type Params = Promise<{ id: string }>;

const notFound = () =>
  NextResponse.json(
    { success: false, error: { code: "NOT_FOUND", message: "Database not found" } },
    { status: 404 }
  );

const forbidden = () =>
  NextResponse.json(
    { success: false, error: { code: "FORBIDDEN", message: "You cannot edit this database" } },
    { status: 403 }
  );

const badRequest = (message: string) =>
  NextResponse.json(
    { success: false, error: { code: "VALIDATION_ERROR", message } },
    { status: 400 }
  );

// ── GET ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, { params }: { params: Params }) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;
      const sp = request.nextUrl.searchParams;

      const level = await resolveDataTableAccess(id, session.user.id);
      if (!canRead(level)) return notFound();

      // `since` is the poller's path (plan B8d): return only what moved,
      // rather than re-sending a page the client already has.
      const since = sp.get("since");
      if (since) {
        const at = new Date(since);
        if (Number.isNaN(at.getTime())) return badRequest("Invalid `since` timestamp");
        const changes = await loadRowChanges(id, at);
        return NextResponse.json({
          success: true,
          data: { ...changes, serverTime: new Date().toISOString() },
        });
      }

      const table = await loadTable(id, session.user.id);
      if (!table) return notFound();

      const cursorSortKey = sp.get("cursorSortKey");
      const cursorId = sp.get("cursorId");
      const limit = Math.min(
        Number(sp.get("limit")) || DEFAULT_ROW_PAGE_SIZE,
        500
      );

      const page = await loadRowPage({
        tableId: id,
        view: resolveView(table, sp.get("view")),
        columns: table.columns,
        cursor:
          cursorSortKey && cursorId
            ? { sortKey: cursorSortKey, id: cursorId }
            : null,
        limit,
      });

      return NextResponse.json({
        success: true,
        data: { ...page, serverTime: new Date().toISOString() },
      });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:rows_get:caught",
        summary: "failed to load rows",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to load rows" } },
        { status: 500 }
      );
    }
  });
}

// ── POST ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, { params }: { params: Params }) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;

      const level = await resolveDataTableAccess(id, session.user.id);
      if (!canRead(level)) return notFound();
      if (!canWrite(level)) return forbidden();

      const body = (await request.json()) as {
        count?: number;
        afterSortKey?: string | null;
      };
      const count = Math.min(Math.max(body.count ?? 1, 1), 200);

      const table = await loadTable(id);
      if (!table) return notFound();
      if (table.mode === "query") {
        return badRequest("Query databases are read-only projections — create a note and it appears");
      }

      const rowIds = await withSpan(
        { layer: "content", name: "data_rows_create" },
        { attrs: { count } },
        async () =>
          createRows(
            id,
            table.columns,
            count,
            session.user.id,
            body.afterSortKey ?? null
          )
      );

      return NextResponse.json({ success: true, data: { rowIds } });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:rows_post:caught",
        summary: "failed to create rows",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to create rows" } },
        { status: 500 }
      );
    }
  });
}

// ── PATCH ────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;

      const level = await resolveDataTableAccess(id, session.user.id);
      if (!canRead(level)) return notFound();
      if (!canWrite(level)) return forbidden();

      const body = (await request.json()) as { writes?: CellWrite[] };
      if (!Array.isArray(body.writes) || body.writes.length === 0) {
        return badRequest("`writes` must be a non-empty list");
      }
      if (body.writes.length > 1000) {
        return badRequest("Too many cells in one request");
      }

      const table = await loadTable(id);
      if (!table) return notFound();
      if (table.mode === "query") {
        return badRequest("Query databases are read-only projections");
      }

      const { ok, results } = await withSpan(
        { layer: "content", name: "data_cells_write" },
        { attrs: { writes: body.writes.length } },
        async (span) => {
          const outcome = await writeCells(id, table.columns, body.writes!);
          span.attr("applied", outcome.ok);
          return outcome;
        }
      );

      // 409 for a stale batch: the request was well-formed and permitted, it
      // just lost a race. The client turns this into "skipped — someone else
      // changed this", never into a retry.
      const stale = results.some((r) => r.status === "stale");
      return NextResponse.json(
        { success: ok, data: { results } },
        { status: ok ? 200 : stale ? 409 : 400 }
      );
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:rows_patch:caught",
        summary: "failed to write cells",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to write cells" } },
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
      if (!canWrite(level)) return forbidden();

      const body = (await request.json()) as {
        rowIds?: string[];
        restore?: boolean;
      };
      if (!Array.isArray(body.rowIds) || body.rowIds.length === 0) {
        return badRequest("`rowIds` must be a non-empty list");
      }

      // `restore` is undo's path for a delete — idempotent, no CAS (B4.5).
      const affected = body.restore
        ? await restoreRows(id, body.rowIds)
        : await softDeleteRows(id, body.rowIds, session.user.id);

      return NextResponse.json({ success: true, data: { affected } });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:rows_delete:caught",
        summary: "failed to delete rows",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to delete rows" } },
        { status: 500 }
      );
    }
  });
}
