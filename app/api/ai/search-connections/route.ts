/**
 * Search Connections API (AI v3.1) — BYOK web-search backend keys.
 *   GET  → list the user's search connections (no keys)
 *   POST → create/update a backend key (encrypted server-side)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  listSearchConnections,
  upsertSearchConnection,
} from "@/lib/features/search-connections";
import { withRouteTrace } from "@/lib/core/logger";

const ROUTE_PATH = "/api/ai/search-connections";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const data = await listSearchConnections(session.user.id);
      return NextResponse.json({ success: true, data });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: (error as Error).message },
        { status: 500 },
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const body = (await request.json()) as {
        provider?: unknown;
        apiKey?: unknown;
        label?: unknown;
        makeDefault?: unknown;
      };
      if (typeof body.provider !== "string" || typeof body.apiKey !== "string") {
        return NextResponse.json(
          { success: false, error: "provider and apiKey are required." },
          { status: 400 },
        );
      }
      const view = await upsertSearchConnection(session.user.id, {
        provider: body.provider,
        apiKey: body.apiKey,
        label: typeof body.label === "string" ? body.label : undefined,
        makeDefault:
          typeof body.makeDefault === "boolean" ? body.makeDefault : undefined,
      });
      return NextResponse.json({ success: true, data: view });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: (error as Error).message },
        { status: 400 },
      );
    }
  });
}
