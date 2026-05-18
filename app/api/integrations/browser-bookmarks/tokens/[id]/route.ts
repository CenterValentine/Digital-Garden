import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { revokeBrowserExtensionToken } from "@/lib/domain/browser-bookmarks";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/integrations/browser-bookmarks/tokens/[id]";

type Params = Promise<{ id: string }>;

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message.toLowerCase().includes("not found") ? 404 : 500;
  const isAuthError = message.toLowerCase().includes("auth");
  return NextResponse.json(
    {
      success: false,
      error: {
        code: isAuthError ? "UNAUTHORIZED" : status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR",
        message: isAuthError ? "Authentication required" : fallback,
      },
    },
    { status: isAuthError ? 401 : status }
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await params;
      const data = await withSpan(
        { layer: "browser_ext", name: "token_revoke" },
        { attrs: { token_id: id } },
        async () => revokeBrowserExtensionToken(session.user.id, id),
      );
      return NextResponse.json({ success: true, data });
    } catch (error) {
      logger.error({
        layer: "browser_ext",
        event: "token_revoke:caught",
        summary: "revoke failed — 500",
        error,
      });
      return errorResponse(error, "Failed to revoke browser extension token");
    }
  });
}
