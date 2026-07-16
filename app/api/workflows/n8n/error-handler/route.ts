import { NextRequest, NextResponse } from "next/server";

import { withRouteTrace } from "@/lib/core/logger";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  ensureN8nErrorHandler,
  getStoredN8nErrorHandler,
} from "@/extensions/workflows/server/engines/n8n/error-handler";
import { handleRouteError } from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/workflows/n8n/error-handler";

/** Current DG Error Handler status (no create). */
export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const handler = await getStoredN8nErrorHandler(session.user.id);
      return NextResponse.json({
        success: true,
        data: { configured: Boolean(handler), ...(handler ?? {}) },
      });
    } catch (error) {
      return handleRouteError(error, "Failed to load error handler status");
    }
  });
}

/** Get-or-create the owner's DG Error Handler (idempotent). */
export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const result = await ensureN8nErrorHandler(session.user.id);
      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      return handleRouteError(error, "Failed to set up error handler");
    }
  });
}
