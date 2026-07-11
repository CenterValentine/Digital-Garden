/**
 * Connections API.
 *
 * GET /api/connections — list the current user's active connections
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { listConnections } from "@/lib/domain/connections";
import { handleConnectionsRouteError } from "@/lib/domain/connections/route-errors";
import { withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/connections";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const connections = await listConnections(session.user.id);
      return NextResponse.json({ success: true, data: { connections } });
    } catch (error) {
      return handleConnectionsRouteError("connections_list", error);
    }
  });
}
