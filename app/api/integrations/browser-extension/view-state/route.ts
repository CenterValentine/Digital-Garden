import { NextRequest, NextResponse } from "next/server";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import {
  getExtensionViewState,
  upsertExtensionViewState,
} from "@/lib/domain/browser-extension";

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const lowered = message.toLowerCase();
  const status = lowered.includes("token") || lowered.includes("auth") ? 401 : lowered.includes("not found") ? 404 : 500;
  return NextResponse.json(
    {
      success: false,
      error: {
        code: status === 401 ? "UNAUTHORIZED" : status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR",
        message,
      },
    },
    { status }
  );
}

export async function GET(request: NextRequest) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const installId = token.install?.id;
    if (!installId) {
      throw new Error("Trusted browser install required");
    }
    const resourceId = request.nextUrl.searchParams.get("resourceId");
    if (!resourceId) {
      throw new Error("resourceId is required");
    }
    const data = await getExtensionViewState(token.user.id, installId, resourceId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserExtension ViewState] GET error:", error);
    return errorResponse(error, "Failed to load view state");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const installId = token.install?.id;
    if (!installId) {
      throw new Error("Trusted browser install required");
    }
    const body = await request.json();
    const data = await upsertExtensionViewState(token.user.id, installId, {
      webResourceId: body.webResourceId,
      contentId: body.contentId,
      state: typeof body.state === "string" ? body.state : undefined,
      layoutMode: typeof body.layoutMode === "string" ? body.layoutMode : undefined,
      dockSide:
        body.dockSide === null || typeof body.dockSide === "string"
          ? body.dockSide
          : undefined,
      positionX: typeof body.positionX === "number" ? body.positionX : undefined,
      positionY: typeof body.positionY === "number" ? body.positionY : undefined,
      width: typeof body.width === "number" ? body.width : undefined,
      height: typeof body.height === "number" ? body.height : undefined,
      opacity: typeof body.opacity === "number" ? body.opacity : undefined,
      embeddedSelector:
        body.embeddedSelector === null || typeof body.embeddedSelector === "string"
          ? body.embeddedSelector
          : undefined,
      embeddedPlacement:
        body.embeddedPlacement === null ||
        typeof body.embeddedPlacement === "string"
          ? body.embeddedPlacement
          : undefined,
      metadata:
        body.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
      lastActiveAt:
        body.lastActiveAt === null || typeof body.lastActiveAt === "string"
          ? body.lastActiveAt
          : undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserExtension ViewState] PATCH error:", error);
    return errorResponse(error, "Failed to save view state");
  }
}
