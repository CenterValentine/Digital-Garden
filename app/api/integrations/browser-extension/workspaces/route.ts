import { NextRequest, NextResponse } from "next/server";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import { listWorkspaces } from "@/extensions/workplaces/server/service";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/integrations/browser-extension/workspaces";

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const lowered = message.toLowerCase();
  const status = lowered.includes("token") || lowered.includes("auth") ? 401 : 500;
  return NextResponse.json({ success: false, error: { message } }, { status });
}

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const token = await withSpan(
        { layer: "auth", name: "browser_ext_token" },
        { summary: "extension bearer auth" },
        async () => requireBrowserExtensionBearerAuth(request),
      );
      const workspaces = await withSpan(
        { layer: "browser_ext", name: "workspaces_list" },
        undefined,
        async (span) => {
          const result = await listWorkspaces(token.user.id);
          span.attr("count", result.length);
          return result;
        },
      );
      const data = workspaces
        .filter((w) => w.status === "active")
        .map((w) => ({
          id: w.id,
          name: w.name,
          slug: w.slug,
          isMain: w.isMain,
          viewRootContentId: w.viewRootContentId,
        }));
      return NextResponse.json({ success: true, data });
    } catch (error) {
      logger.error({
        layer: "browser_ext",
        event: "workspaces_list:caught",
        summary: "list failed — 500",
        error,
      });
      return errorResponse(error, "Failed to load workspaces");
    }
  });
}
