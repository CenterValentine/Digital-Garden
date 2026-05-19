/**
 * AI Feature Routes API — collection endpoint.
 *
 * GET  /api/ai/feature-routes                  — all routes grouped by feature
 * POST /api/ai/feature-routes                  — set the entire ordered list
 *   body: { featureId: string, entries: [{ connectionId, modelId }, ...] }
 *
 * Position 0 in `entries` is primary; 1+ are ordered backups. Pass an
 * empty `entries` array to clear the routes for that feature.
 *
 * Individual route mutations (add one, remove one, reorder) are done
 * client-side by reading the current list, modifying it, and POSTing
 * the new state. This keeps the API minimal and the (ownerId,
 * featureId, position) uniqueness invariant honored atomically.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  listAllUserRoutes,
  setFeatureRoutes,
  type FeatureRouteEntry,
} from "@/lib/features/ai-feature-routes";
import { lookupFeature } from "@/lib/domain/ai/features";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/ai/feature-routes";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const grouped = await listAllUserRoutes(session.user.id);
      return NextResponse.json({ success: true, data: { byFeature: grouped } });
    } catch (error) {
      return handleError("GET", error);
    }
  });
}

interface SetRoutesBody {
  featureId?: string;
  entries?: Array<{ connectionId?: string; modelId?: string }>;
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const body = (await request.json()) as SetRoutesBody;
      const featureId = body.featureId;
      if (!featureId || typeof featureId !== "string") {
        return NextResponse.json(
          { success: false, error: "`featureId` is required" },
          { status: 400 },
        );
      }
      if (!lookupFeature(featureId)) {
        return NextResponse.json(
          { success: false, error: `Unknown featureId: ${featureId}` },
          { status: 400 },
        );
      }
      if (!Array.isArray(body.entries)) {
        return NextResponse.json(
          { success: false, error: "`entries` must be an array" },
          { status: 400 },
        );
      }

      const entries: Array<Omit<FeatureRouteEntry, "position">> = [];
      for (const e of body.entries) {
        if (typeof e?.connectionId !== "string" || typeof e?.modelId !== "string") {
          continue;
        }
        entries.push({ connectionId: e.connectionId, modelId: e.modelId });
      }

      const updated = await setFeatureRoutes(session.user.id, featureId, entries);
      return NextResponse.json({ success: true, data: { entries: updated } });
    } catch (error) {
      return handleError("POST", error);
    }
  });
}

function handleError(method: "GET" | "POST", error: unknown): NextResponse {
  if (error instanceof Error && error.message === "Authentication required") {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  logger.error({
    layer: "ai",
    event: `feature_routes:${method.toLowerCase()}:caught`,
    summary: `${method} ${ROUTE_PATH} caught — 500`,
    error,
  });
  return NextResponse.json(
    {
      success: false,
      error: "Feature route request failed",
      details: error instanceof Error ? error.message : "Unknown error",
    },
    { status: 500 },
  );
}
