import { NextRequest, NextResponse } from "next/server";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import {
  createWebResourceAssociation,
  deleteWebResourceAssociation,
  getWebResourceContextById,
} from "@/lib/domain/browser-extension";

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const lowered = message.toLowerCase();
  const status = lowered.includes("token") || lowered.includes("auth") ? 401 : lowered.includes("not found") ? 404 : lowered.includes("folders cannot") ? 400 : 500;
  return NextResponse.json(
    {
      success: false,
      error: {
        code:
          status === 401
            ? "UNAUTHORIZED"
            : status === 404
              ? "NOT_FOUND"
              : status === 400
                ? "VALIDATION_ERROR"
                : "INTERNAL_ERROR",
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
    const data = await getWebResourceContextById(token.user.id, installId, resourceId);
    return NextResponse.json({ success: true, data: data.associations });
  } catch (error) {
    console.error("[BrowserExtension Associations] GET error:", error);
    return errorResponse(error, "Failed to load associations");
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const body = await request.json();
    const data = await createWebResourceAssociation(token.user.id, {
      webResourceId: body.webResourceId,
      contentId: body.contentId,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("[BrowserExtension Associations] POST error:", error);
    return errorResponse(error, "Failed to create association");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const body = await request.json();
    const data = await deleteWebResourceAssociation(token.user.id, {
      webResourceId: body.webResourceId,
      contentId: body.contentId,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserExtension Associations] DELETE error:", error);
    return errorResponse(error, "Failed to remove association");
  }
}
