/**
 * Studio folder source selection.
 *
 * GET /api/studio/sources/:folderId
 *   → { success, data: SelectionState }  (stored selection, or BFS default)
 * PUT /api/studio/sources/:folderId
 *   body: { includedNodeIds: string[]; tokenBudget?: number }
 *   → { success, data: SelectionState }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { logger, withRouteTrace } from "@/lib/core/logger";
import {
  getSelectionState,
  saveSelection,
} from "@/extensions/studio/server/source-selection";

const ROUTE_PATH = "/api/studio/sources/[folderId]";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ folderId: string }> }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { folderId } = await params;
      const state = await getSelectionState(session.user.id, folderId);
      if (!state) {
        return NextResponse.json(
          { success: false, error: "Folder not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: state });
    } catch (error) {
      return handleError(error, "get");
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ folderId: string }> }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { folderId } = await params;
      const body = (await request.json()) as {
        includedNodeIds?: unknown;
        tokenBudget?: unknown;
      };
      if (
        !Array.isArray(body.includedNodeIds) ||
        body.includedNodeIds.some((id) => typeof id !== "string")
      ) {
        return NextResponse.json(
          { success: false, error: "includedNodeIds must be a string array" },
          { status: 400 }
        );
      }
      const tokenBudget =
        typeof body.tokenBudget === "number" &&
        Number.isFinite(body.tokenBudget) &&
        body.tokenBudget >= 1_000
          ? Math.min(Math.floor(body.tokenBudget), 200_000)
          : undefined;

      const state = await saveSelection(
        session.user.id,
        folderId,
        body.includedNodeIds as string[],
        tokenBudget
      );
      if (!state) {
        return NextResponse.json(
          { success: false, error: "Folder not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: state });
    } catch (error) {
      return handleError(error, "put");
    }
  });
}

function handleError(error: unknown, op: string) {
  if (error instanceof Error && error.message === "Authentication required") {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  logger.error({
    layer: "content",
    event: `studio:sources:${op}:caught`,
    summary: `${op.toUpperCase()} ${ROUTE_PATH} caught`,
    error,
  });
  return NextResponse.json(
    { success: false, error: "Internal error" },
    { status: 500 }
  );
}
