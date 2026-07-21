import { NextRequest, NextResponse } from "next/server";
import { withRouteTrace } from "@/lib/core/logger";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getRunDetailForOwner } from "@/extensions/workflows/server/runs";
import {
  errorResponse,
  handleRouteError,
} from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/workflows/runs/[id]";

type Params = Promise<{ id: string }>;

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;
      const run = await getRunDetailForOwner(id, session.user.id);
      if (!run) {
        return errorResponse(404, "NOT_FOUND", "Workflow run not found.");
      }
      return NextResponse.json({ success: true, data: { run } });
    } catch (error) {
      return handleRouteError(error, "Failed to load workflow run");
    }
  });
}
