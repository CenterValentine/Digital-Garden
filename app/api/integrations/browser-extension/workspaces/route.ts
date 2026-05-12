import { NextRequest, NextResponse } from "next/server";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import { listWorkspaces } from "@/extensions/workplaces/server/service";

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const lowered = message.toLowerCase();
  const status = lowered.includes("token") || lowered.includes("auth") ? 401 : 500;
  return NextResponse.json({ success: false, error: { message } }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const workspaces = await listWorkspaces(token.user.id);
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
    console.error("[BrowserExtension Workspaces] GET error:", error);
    return errorResponse(error, "Failed to load workspaces");
  }
}
