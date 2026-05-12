import { NextRequest, NextResponse } from "next/server";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import {
  getWebResourceContext,
  getWebResourceContextById,
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

    const { searchParams } = request.nextUrl;
    const resourceId = searchParams.get("resourceId");
    if (resourceId) {
      const data = await getWebResourceContextById(token.user.id, installId, resourceId);
      return NextResponse.json({ success: true, data });
    }

    const url = searchParams.get("url");
    if (!url) {
      throw new Error("Resource URL is required");
    }
    const data = await getWebResourceContext(token.user.id, installId, {
      url,
      canonicalUrl: searchParams.get("canonicalUrl"),
      title: searchParams.get("title"),
      faviconUrl: searchParams.get("faviconUrl"),
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserExtension ResourceContext] GET error:", error);
    return errorResponse(error, "Failed to load resource context");
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const installId = token.install?.id;
    if (!installId) {
      throw new Error("Trusted browser install required");
    }
    const body = await request.json();
    if (typeof body.url !== "string" || body.url.trim().length === 0) {
      throw new Error("Resource URL is required");
    }
    const data = await getWebResourceContext(token.user.id, installId, {
      url: body.url,
      canonicalUrl:
        body.canonicalUrl === null || typeof body.canonicalUrl === "string"
          ? body.canonicalUrl
          : undefined,
      title: typeof body.title === "string" ? body.title : undefined,
      faviconUrl: typeof body.faviconUrl === "string" ? body.faviconUrl : undefined,
      metadata:
        body.metadata && typeof body.metadata === "object"
          ? body.metadata
          : undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserExtension ResourceContext] POST error:", error);
    return errorResponse(error, "Failed to resolve resource context");
  }
}
