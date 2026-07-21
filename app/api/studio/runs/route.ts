/**
 * Studio generation runs.
 *
 * GET  /api/studio/runs?folderId=…   → { success, data: RunDto[] }
 * POST /api/studio/runs              body: { toolId, variantId?, folderId }
 *   → 202 { success, data: { runId } }
 *
 * POST responds as soon as the run record exists; execution continues after
 * the response via next/server `after()` — that's what makes runs survive
 * tab close. Terminal state always lands in the table + inbox.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { logger, withRouteTrace } from "@/lib/core/logger";
import {
  executeRun,
  listRuns,
  startRun,
} from "@/extensions/studio/server/runs";

const ROUTE_PATH = "/api/studio/runs";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const folderId = request.nextUrl.searchParams.get("folderId");
      if (!folderId) {
        return NextResponse.json(
          { success: false, error: "folderId is required" },
          { status: 400 }
        );
      }
      const runs = await listRuns(session.user.id, folderId);
      return NextResponse.json({ success: true, data: runs });
    } catch (error) {
      return handleError(error, "get");
    }
  });
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const body = (await request.json()) as {
        toolId?: unknown;
        variantId?: unknown;
        folderId?: unknown;
      };
      if (typeof body.toolId !== "string" || typeof body.folderId !== "string") {
        return NextResponse.json(
          { success: false, error: "toolId and folderId are required" },
          { status: 400 }
        );
      }
      const started = await startRun(session.user.id, {
        toolId: body.toolId,
        variantId:
          typeof body.variantId === "string" ? body.variantId : undefined,
        folderId: body.folderId,
      });
      if (!started) {
        return NextResponse.json(
          { success: false, error: "Unknown job tool or folder" },
          { status: 404 }
        );
      }
      // Execute after the response is sent — the run outlives this request's
      // client connection (tab-close survival).
      after(() => executeRun(started.runId));
      return NextResponse.json(
        { success: true, data: { runId: started.runId } },
        { status: 202 }
      );
    } catch (error) {
      return handleError(error, "post");
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
    layer: "ai",
    event: `studio:runs:${op}:caught`,
    summary: `${op.toUpperCase()} ${ROUTE_PATH} caught`,
    error,
  });
  return NextResponse.json(
    { success: false, error: "Internal error" },
    { status: 500 }
  );
}
