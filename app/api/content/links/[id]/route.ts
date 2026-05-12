import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getOptionalBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import { listLinksPanelData } from "@/lib/domain/browser-extension";

type Params = Promise<{ id: string }>;

export async function GET(
  _request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const extensionAuth = await getOptionalBrowserExtensionBearerAuth(_request);
    const userId = extensionAuth?.user?.id ?? (await requireAuth()).user.id;
    const { id } = await params;
    const data = await listLinksPanelData(userId, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Content Links] GET error:", error);
    const message = error instanceof Error ? error.message : "Failed to load links";
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
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
}
