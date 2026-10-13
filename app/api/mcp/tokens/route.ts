/**
 * MCP token management — session-authed, owner-scoped. The tokens
 * themselves authenticate the SEPARATE MCP route when it lands; they are
 * never accepted here. Mirrors /api/workflows/tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import { withRouteTrace, logger } from "@/lib/core/logger";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { createMcpTokenRecord, listMcpTokens } from "@/lib/domain/mcp/tokens";

const ROUTE_PATH = "/api/mcp/tokens";

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const tokens = await listMcpTokens(session.user.id);
      return NextResponse.json({ success: true, data: { tokens } });
    } catch (error) {
      logger.error({ layer: "auth", event: "mcp_tokens:list_caught", summary: "list failed", error });
      return fail(500, "INTERNAL_ERROR", "Failed to list MCP tokens");
    }
  });
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

      const name = typeof body.name === "string" ? body.name : undefined;
      let expiresAt: string | null | undefined;
      if (body.expiresAt === null || typeof body.expiresAt === "string") {
        expiresAt = body.expiresAt as string | null;
      }
      if (typeof expiresAt === "string" && Number.isNaN(Date.parse(expiresAt))) {
        return fail(400, "VALIDATION_ERROR", "expiresAt must be an ISO date string or null.");
      }
      const rootIds = Array.isArray(body.rootIds)
        ? body.rootIds.filter((x): x is string => typeof x === "string")
        : [];
      const cap = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : null);

      const data = await createMcpTokenRecord(session.user.id, {
        name,
        capabilities: body.capabilities,
        rootIds,
        allChats: body.allChats === true,
        readTokenCap: cap(body.readTokenCap),
        dailyCallCap: cap(body.dailyCallCap),
        expiresAt,
      });
      return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (error) {
      if (error instanceof Error && /capabilit|root/i.test(error.message)) {
        return fail(400, "VALIDATION_ERROR", error.message);
      }
      logger.error({ layer: "auth", event: "mcp_tokens:create_caught", summary: "create failed", error });
      return fail(500, "INTERNAL_ERROR", "Failed to create MCP token");
    }
  });
}
