import { NextRequest, NextResponse } from "next/server";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import { getWebResourceContext } from "@/lib/domain/browser-extension";

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const lowered = message.toLowerCase();
  const status = lowered.includes("token") || lowered.includes("auth") ? 401 : 500;
  return NextResponse.json({ success: false, error: { message } }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const installId = token.install?.id;
    if (!installId) throw new Error("Trusted browser install required");

    const url = request.nextUrl.searchParams.get("url");
    if (!url) throw new Error("url query parameter is required");

    const context = await getWebResourceContext(token.user.id, installId, { url });
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
    console.error("[BrowserExtension UrlAssociation] GET error:", error);
    return errorResponse(error, "Failed to load URL association");
  }
}
