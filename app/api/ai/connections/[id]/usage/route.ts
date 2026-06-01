/**
 * GET /api/ai/connections/[id]/usage
 *   query: ?from=ISO&to=ISO  (optional; default = current calendar month)
 *
 * Returns the composed `UsageReport` for a Connection. Provider-API
 * adapters (OpenRouter, Vercel AI Gateway) supply official totals
 * when available; telemetry fills in the per-model breakdown. UI
 * surfaces the `source` field so users know what's official vs.
 * estimated.
 *
 *   200 { success: true, data: UsageReport }
 *   401 unauthorized
 *   404 connection not found
 *   500 server error
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  ConnectionNotFoundError,
  getConnectionUsage,
} from "@/lib/features/ai-connections";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/ai/connections/[id]/usage";

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
      const url = new URL(request.url);
      const fromStr = url.searchParams.get("from");
      const toStr = url.searchParams.get("to");
      const from = fromStr ? new Date(fromStr) : undefined;
      const to = toStr ? new Date(toStr) : undefined;

      const report = await getConnectionUsage({
        userId: session.user.id,
        connectionId: id,
        from,
        to,
      });

      return NextResponse.json({ success: true, data: report });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Authentication required"
      ) {
        return NextResponse.json(
          { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
          { status: 401 },
        );
      }
      if (error instanceof ConnectionNotFoundError) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: error.message } },
          { status: 404 },
        );
      }
      logger.error({
        layer: "ai",
        event: "connection.usage:caught",
        summary: "GET /api/ai/connections/[id]/usage caught — 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: { code: "SERVER_ERROR", message: "Usage request failed" },
        },
        { status: 500 },
      );
    }
  });
}
