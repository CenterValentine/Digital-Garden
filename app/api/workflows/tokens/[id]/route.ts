import { NextRequest, NextResponse } from "next/server";

import { withRouteTrace } from "@/lib/core/logger";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  deleteServiceToken,
  revokeServiceToken,
} from "@/extensions/workflows/server/service-token";
import {
  errorResponse,
  handleRouteError,
} from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/workflows/tokens/[id]";

type Params = Promise<{ id: string }>;

/**
 * Owner-scoped token teardown. Default = revoke (soft; stamps `revokedAt`,
 * kills auth immediately, keeps the audit row). `?purge=true` = hard-delete
 * the row (cleanup for already-revoked tokens).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;
      const purge = request.nextUrl.searchParams.get("purge") === "true";

      if (purge) {
        const data = await deleteServiceToken(session.user.id, id);
        return NextResponse.json({ success: true, data });
      }

      const record = await revokeServiceToken(session.user.id, id);
      return NextResponse.json({ success: true, data: { record } });
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return errorResponse(404, "NOT_FOUND", "Service token not found.");
      }
      return handleRouteError(error, "Failed to remove workflow service token");
    }
  });
}
