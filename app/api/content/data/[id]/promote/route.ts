/**
 * Row promotion API (plan Phase 5).
 *
 * POST /api/content/data/[id]/promote  { rowId, role? }
 *
 * Promotes a row to a real ContentNode. `role` defaults to "primary" —
 * this endpoint's caller is the deliberate path (open-as-page); the
 * incidental path (wiki-links, mentions) will pass "referenced" when it
 * lands in the next slice.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { markContextDirty } from "@/lib/domain/ai-context/context-dirty";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import {
  canRead,
  canWrite,
  resolveDataTableAccess,
} from "@/lib/domain/data/server/access";
import { loadTable } from "@/lib/domain/data/server/queries";
import { promoteRow } from "@/lib/domain/data/server/promotion";

const ROUTE_PATH = "/api/content/data/[id]/promote";

type Params = Promise<{ id: string }>;

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
      if (!canWrite(level)) {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "You cannot edit this database" } },
          { status: 403 }
        );
      }

      const body = (await request.json()) as {
        rowId?: string;
        role?: string;
      };
      if (!body.rowId) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "`rowId` is required" } },
          { status: 400 }
        );
      }

      const table = await loadTable(id);
      if (!table) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Database not found" } },
          { status: 404 }
        );
      }
      if (table.mode === "query") {
        // Query rows ARE nodes already — there is nothing to promote.
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Query database rows are already pages" } },
          { status: 400 }
        );
      }

      const result = await withSpan(
        { layer: "content", name: "data_row_promote" },
        { attrs: { row_id: body.rowId } },
        async () =>
          promoteRow(
            id,
            body.rowId!,
            table.columns,
            body.role === "referenced" ? "referenced" : "primary"
          )
      );

      if ("error" in result) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: result.error } },
          { status: 404 }
        );
      }

      // A new child under the table changes its roll-up inputs.
      if (result.created) after(() => markContextDirty([id]));

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:promote:caught",
        summary: "failed to promote row",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to open the row as a page" } },
        { status: 500 }
      );
    }
  });
}
