import { NextRequest, NextResponse } from "next/server";
import { withRouteTrace } from "@/lib/core/logger";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import { getRunDetailForOwner } from "@/extensions/workflows/server/runs";
import {
  errorResponse,
  handleRouteError,
} from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/integrations/browser-extension/workflows/runs/[id]";

type Params = Promise<{ id: string }>;

/**
 * Full run detail for the extension (toast expansion / popup detail).
 * Read-only mirror of the session-authed /api/workflows/runs/[id] — gate
 * RESOLUTION stays session-only inside the embed surface by design.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const record = await requireBrowserExtensionBearerAuth(request);
      const { id } = await params;
      const run = await getRunDetailForOwner(id, record.user.id);
      if (!run) {
        return errorResponse(404, "NOT_FOUND", "Workflow run not found.");
      }
      return NextResponse.json({ success: true, data: { run } });
    } catch (error) {
      return handleRouteError(error, "Failed to load workflow run");
    }
  });
}
