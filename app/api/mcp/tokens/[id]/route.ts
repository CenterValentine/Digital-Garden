/**
 * Owner-scoped MCP token teardown. Default = revoke (soft; kills auth at
 * once, keeps the audit row). `?purge=true` = hard-delete an already-revoked
 * row. Mirrors /api/workflows/tokens/[id].
 */

import { NextRequest, NextResponse } from "next/server";
import { withRouteTrace, logger } from "@/lib/core/logger";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { deleteMcpToken, revokeMcpToken } from "@/lib/domain/mcp/tokens";

const ROUTE_PATH = "/api/mcp/tokens/[id]";

type Params = Promise<{ id: string }>;

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;
      const purge = request.nextUrl.searchParams.get("purge") === "true";
      if (purge) {
        const data = await deleteMcpToken(session.user.id, id);
        return NextResponse.json({ success: true, data });
      }
      const record = await revokeMcpToken(session.user.id, id);
      return NextResponse.json({ success: true, data: { record } });
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "MCP token not found." } },
          { status: 404 }
        );
      }
      logger.error({ layer: "auth", event: "mcp_tokens:delete_caught", summary: "remove failed", error });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to remove MCP token" } },
        { status: 500 }
      );
    }
  });
}
