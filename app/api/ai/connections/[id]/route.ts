/**
 * AI Connections API — single-resource endpoint.
 *
 * GET    /api/ai/connections/[id]   — fetch (key hidden)
 * PATCH  /api/ai/connections/[id]   — update label / models / pin / key / etc.
 * DELETE /api/ai/connections/[id]   — soft delete + cascade feature routes
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  ConnectionNotFoundError,
  deleteConnection,
  getConnection,
  updateConnection,
  type UpdateConnectionPatch,
} from "@/lib/features/ai-connections";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/ai/connections/[id]";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await context.params;
      const conn = await getConnection(session.user.id, id);
      return NextResponse.json({ success: true, data: conn });
    } catch (error) {
      return handleError("GET", error);
    }
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await context.params;
      const body = (await request.json()) as Partial<UpdateConnectionPatch>;

      const patch: UpdateConnectionPatch = {};
      if (body.label !== undefined) patch.label = body.label;
      if (body.baseURL !== undefined) patch.baseURL = body.baseURL;
      if (body.apiKey !== undefined && body.apiKey.length > 0) {
        patch.apiKey = body.apiKey;
      }
      if (body.models !== undefined) patch.models = body.models;
      if (body.isPinned !== undefined) patch.isPinned = body.isPinned;
      if (body.pinOrder !== undefined) patch.pinOrder = body.pinOrder;
      if (body.preferRouteVia !== undefined) {
        patch.preferRouteVia = body.preferRouteVia;
      }

      const updated = await updateConnection(session.user.id, id, patch);
      return NextResponse.json({ success: true, data: updated });
    } catch (error) {
      return handleError("PATCH", error);
    }
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await context.params;
      await deleteConnection(session.user.id, id);
      return NextResponse.json({ success: true });
    } catch (error) {
      return handleError("DELETE", error);
    }
  });
}

function handleError(
  method: "GET" | "PATCH" | "DELETE",
  error: unknown,
): NextResponse {
  if (error instanceof Error && error.message === "Authentication required") {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  if (error instanceof ConnectionNotFoundError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 404 },
    );
  }
  logger.error({
    layer: "ai",
    event: `connection:${method.toLowerCase()}:caught`,
    summary: `${method} ${ROUTE_PATH} caught — 500`,
    error,
  });
  return NextResponse.json(
    {
      success: false,
      error: "Connection request failed",
      details: error instanceof Error ? error.message : "Unknown error",
    },
    { status: 500 },
  );
}
