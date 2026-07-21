/**
 * Search Connection item API (AI v3.1).
 *   PATCH  { makeDefault: true } → set this backend as the active one
 *   DELETE → remove this backend key
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  setDefaultSearchConnection,
  deleteSearchConnection,
} from "@/lib/features/search-connections";
import { withRouteTrace } from "@/lib/core/logger";

const ROUTE_PATH = "/api/ai/search-connections/[id]";
type Params = Promise<{ id: string }>;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params },
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;
      const body = (await request.json()) as { makeDefault?: unknown };
      if (body.makeDefault === true) {
        await setDefaultSearchConnection(session.user.id, id);
      }
      return NextResponse.json({ success: true });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: (error as Error).message },
        { status: 400 },
      );
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params },
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;
      await deleteSearchConnection(session.user.id, id);
      return NextResponse.json({ success: true });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: (error as Error).message },
        { status: 400 },
      );
    }
  });
}
