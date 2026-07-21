import { NextRequest, NextResponse } from "next/server";

import { withRouteTrace } from "@/lib/core/logger";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  createServiceTokenRecord,
  listServiceTokens,
} from "@/extensions/workflows/server/service-token";
import {
  errorResponse,
  handleRouteError,
} from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/workflows/tokens";

/**
 * Management surface for workflow service tokens (PATs). Session-authed —
 * only the signed-in owner can list/issue their own tokens. (The tokens
 * themselves authenticate the SEPARATE callback surface; they are never
 * accepted here.)
 */
export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const tokens = await listServiceTokens(session.user.id);
      return NextResponse.json({ success: true, data: { tokens } });
    } catch (error) {
      return handleRouteError(error, "Failed to list workflow service tokens");
    }
  });
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const body = await request.json().catch(() => ({}));

      const name = typeof body.name === "string" ? body.name : undefined;
      let expiresAt: string | null | undefined;
      if (body.expiresAt === null || typeof body.expiresAt === "string") {
        expiresAt = body.expiresAt;
      }
      if (typeof expiresAt === "string" && Number.isNaN(Date.parse(expiresAt))) {
        return errorResponse(400, "VALIDATION_ERROR", "expiresAt must be an ISO date string or null.");
      }

      const data = await createServiceTokenRecord(session.user.id, {
        name,
        expiresAt,
      });
      return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (error) {
      return handleRouteError(error, "Failed to create workflow service token");
    }
  });
}
