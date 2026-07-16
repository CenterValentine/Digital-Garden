/**
 * Studio agentic metadata — read + human-owned writes.
 *
 * GET  /api/studio/metadata/:nodeId
 *   → { success, data: MetadataView }
 * PUT  /api/studio/metadata/:nodeId
 *   body: { directives?: string; roleStrategyAction?: "accept" | "dismiss" }
 *   → { success, data: MetadataView }
 *
 * Last-write-wins by design (this surface is deliberately not collaborative).
 * Only human-ownable operations go through PUT: directives text, and
 * accepting/dismissing the pending Role & Strategy proposal. AI sections are
 * written exclusively by the generate route.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { logger, withRouteTrace } from "@/lib/core/logger";
import {
  getMetadataForNode,
  resolveRoleStrategyProposal,
  saveDirectives,
} from "@/extensions/studio/server/metadata";

const ROUTE_PATH = "/api/studio/metadata/[nodeId]";

interface PutBody {
  directives?: string;
  roleStrategyAction?: "accept" | "dismiss";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { nodeId } = await params;
      const view = await getMetadataForNode(session.user.id, nodeId);
      if (!view) {
        return NextResponse.json(
          { success: false, error: "Content not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: view });
    } catch (error) {
      return handleError(error, "get");
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { nodeId } = await params;
      const body = (await request.json()) as PutBody;

      let view = null;
      if (typeof body.directives === "string") {
        view = await saveDirectives(session.user.id, nodeId, body.directives);
      }
      if (body.roleStrategyAction === "accept" || body.roleStrategyAction === "dismiss") {
        view = await resolveRoleStrategyProposal(
          session.user.id,
          nodeId,
          body.roleStrategyAction
        );
      }
      if (view === null && typeof body.directives !== "string") {
        return NextResponse.json(
          { success: false, error: "No supported operation in body" },
          { status: 400 }
        );
      }
      if (!view) {
        return NextResponse.json(
          { success: false, error: "Content not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: view });
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
    event: `studio:metadata:${op}:caught`,
    summary: `${op.toUpperCase()} ${ROUTE_PATH} caught`,
    error,
  });
  return NextResponse.json(
    { success: false, error: "Internal error" },
    { status: 500 }
  );
}
