/**
 * POST /api/content/data/[id]/digests — refresh a table's AI row digests
 * now (AI-BULK-ROW-READING-PLAN §5.3, manual trigger). Owner-only; the
 * table must have digests turned on (PATCH /api/content/data/[id] with
 * { rowDigests: true }). Returns the refresh outcome the schema rail shows.
 *
 * GET returns coverage (fresh / stale / none) without generating anything.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace } from "@/lib/core/logger";
import {
  canAlterSchema,
  canRead,
  resolveDataTableAccess,
} from "@/lib/domain/data/server/access";
import { loadRowPage, loadTable } from "@/lib/domain/data/server/queries";
import {
  describeRefresh,
  digestCoverageForRows,
  refreshRowDigests,
} from "@/lib/domain/data/server/digests";
import type { DataView } from "@/lib/domain/data";

const ROUTE_PATH = "/api/content/data/[id]/digests";
type Params = Promise<{ id: string }>;
const EMPTY_VIEW = { filters: { op: "and", children: [] }, sorts: [] } as unknown as DataView;

export async function GET(request: NextRequest, { params }: { params: Params }) {
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
      const table = await loadTable(id, session.user.id);
      if (!table) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Database not found" } },
          { status: 404 }
        );
      }
      const columns = table.columns.filter((c) => !c.deletedAt);
      const page = await loadRowPage({ tableId: id, view: EMPTY_VIEW, columns, cursor: null, limit: 5000, viewerId: session.user.id });
      const coverage = await digestCoverageForRows(page.rows, columns);
      return NextResponse.json({ success: true, data: { enabled: table.rowDigests, coverage } });
    } catch (error) {
      logger.error({ layer: "content", event: "data:digests_get:caught", summary: "digest coverage failed", error });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Could not read digest coverage" } },
        { status: 500 }
      );
    }
  });
}

export async function POST(request: NextRequest, { params }: { params: Params }) {
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
      if (!canAlterSchema(level)) {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "Only the owner can refresh digests" } },
          { status: 403 }
        );
      }
      const outcome = await refreshRowDigests(session.user.id, id, { trigger: "manual", maxRows: 200 });
      return NextResponse.json({
        success: true,
        data: { ...outcome, line: describeRefresh(outcome) },
      });
    } catch (error) {
      logger.error({ layer: "content", event: "data:digests_post:caught", summary: "digest refresh failed", error });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Could not refresh digests" } },
        { status: 500 }
      );
    }
  });
}
