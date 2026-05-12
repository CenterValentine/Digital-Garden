import { NextRequest, NextResponse } from "next/server";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import {
  getExtensionExternalContent,
  updateExtensionExternalContent,
} from "@/lib/domain/browser-extension";

type Params = Promise<{ id: string }>;

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

export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const { id } = await params;
    const data = await getExtensionExternalContent(token.user.id, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserExtension ExternalContent] GET error:", error);
    return errorResponse(error, "Failed to load external content");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const { id } = await params;
    const body = await request.json();
    const data = await updateExtensionExternalContent(token.user.id, id, {
      title: typeof body.title === "string" ? body.title : undefined,
      url: typeof body.url === "string" ? body.url : undefined,
      canonicalUrl:
        body.canonicalUrl === null || typeof body.canonicalUrl === "string"
          ? body.canonicalUrl
          : undefined,
      description:
        body.description === null || typeof body.description === "string"
          ? body.description
          : undefined,
      resourceType:
        body.resourceType === null || typeof body.resourceType === "string"
          ? body.resourceType
          : undefined,
      resourceRelationship:
        body.resourceRelationship === null ||
        typeof body.resourceRelationship === "string"
          ? body.resourceRelationship
          : undefined,
      userIntent:
        body.userIntent === null || typeof body.userIntent === "string"
          ? body.userIntent
          : undefined,
      faviconUrl:
        body.faviconUrl === null || typeof body.faviconUrl === "string"
          ? body.faviconUrl
          : undefined,
      preview:
        body.preview && typeof body.preview === "object" ? body.preview : undefined,
      captureMetadata:
        body.captureMetadata && typeof body.captureMetadata === "object"
          ? body.captureMetadata
          : undefined,
      matchMetadata:
        body.matchMetadata && typeof body.matchMetadata === "object"
          ? body.matchMetadata
          : undefined,
      preserveHtml:
        typeof body.preserveHtml === "boolean" ? body.preserveHtml : undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserExtension ExternalContent] PATCH error:", error);
    return errorResponse(error, "Failed to save external content");
  }
}
