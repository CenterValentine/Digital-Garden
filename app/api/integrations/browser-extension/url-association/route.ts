import { NextRequest, NextResponse } from "next/server";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import { getWebResourceContext } from "@/lib/domain/browser-extension";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/integrations/browser-extension/url-association";

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
      const installId = token.install?.id;
      if (!installId) throw new Error("Trusted browser install required");

      const url = request.nextUrl.searchParams.get("url");
      if (!url) throw new Error("url query parameter is required");

      const context = await withSpan(
        { layer: "browser_ext", name: "url_association_lookup" },
        { attrs: { install_id: installId } },
        async (span) => {
          const c = await getWebResourceContext(token.user.id, installId, { url });
          span
            .attr("associations", c.associations?.length ?? 0)
            .attr("external_contents", c.externalContents?.length ?? 0);
          return c;
        },
      );
      const associations = context.associations || [];
      const externalContents = context.externalContents || [];

      return NextResponse.json({
        success: true,
        data: {
          hasNote: associations.some((a) => a.content?.contentType === "note"),
          hasExternal: externalContents.length > 0,
          contentIds: [
            ...associations.map((a) => a.content?.id).filter(Boolean),
            ...externalContents.map((e) => e.id),
          ],
        },
      });
    } catch (error) {
      logger.error({
        layer: "browser_ext",
        event: "url_association_lookup:caught",
        summary: "lookup failed",
        error,
      });
      return errorResponse(error, "Failed to load URL association");
    }
  });
}
