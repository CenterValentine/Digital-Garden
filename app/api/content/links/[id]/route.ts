import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getOptionalBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import { listLinksPanelData } from "@/lib/domain/browser-extension";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/links/[id]";

type Params = Promise<{ id: string }>;

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const userId = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => {
          const extensionAuth = await getOptionalBrowserExtensionBearerAuth(request);
          return extensionAuth?.user?.id ?? (await requireAuth()).user.id;
        },
      );
      const { id } = await params;
      const data = await withSpan(
        { layer: "content", name: "links_panel" },
        { attrs: { content_id: id } },
        async () => listLinksPanelData(userId, id),
      );
      return NextResponse.json({ success: true, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load links";
      const status = message.toLowerCase().includes("not found") ? 404 : 500;
      if (status === 500) {
        logger.error({
          layer: "content",
          event: "links_panel:caught",
          summary: "load failed — 500",
          error,
        });
      }
      return NextResponse.json(
        {
          success: false,
          error: {
            code: status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR",
            message,
          },
        },
        { status }
      );
    }
  });
}
