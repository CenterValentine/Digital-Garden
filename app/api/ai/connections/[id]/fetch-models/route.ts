/**
 * POST /api/ai/connections/[id]/fetch-models
 *
 * Calls the upstream provider's "list models" endpoint using the
 * Connection's decrypted API key and returns a normalized list the
 * client can render as a dropdown. Gates typo entry by replacing
 * free-text Model ID with selection from the live upstream list.
 *
 * Returns:
 *   200 { success: true, data: { items: Array<{ id, name }> } }
 *   401 { success: false, error: { code, message } }     — auth
 *   404 { success: false, error: { code, message } }     — connection
 *   502 { success: false, error: { code, message } }     — upstream
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  ConnectionNotFoundError,
  getConnectionWithKey,
  fetchUpstreamModels,
  ModelFetchError,
} from "@/lib/features/ai-connections";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/ai/connections/[id]/fetch-models";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const { id } = await context.params;
      const conn = await getConnectionWithKey(session.user.id, id);
      const items = await fetchUpstreamModels(conn);

      return NextResponse.json({
        success: true,
        data: { items },
      });
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
      if (error instanceof ModelFetchError) {
        // Upstream-side failure (network, auth, malformed) — surface as
        // 502 so the client can distinguish from local errors.
        logger.info({
          layer: "ai",
          event: "connection.fetch_models.upstream_failed",
          summary: "upstream model list fetch failed",
          attrs: { upstream_status: error.status ?? null },
        });
        return NextResponse.json(
          {
            success: false,
            error: { code: "UPSTREAM_ERROR", message: error.message },
          },
          { status: 502 },
        );
      }
      logger.error({
        layer: "ai",
        event: "connection.fetch_models:caught",
        summary: "POST /api/ai/connections/[id]/fetch-models caught — 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: { code: "SERVER_ERROR", message: "Model fetch failed" },
        },
        { status: 500 },
      );
    }
  });
}
