import { NextRequest, NextResponse } from "next/server";
import {
  getBrowserBookmarkPreferences,
  updateBrowserBookmarkPreferences,
} from "@/lib/domain/browser-bookmarks";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const lowered = message.toLowerCase();
  const isAuthError = lowered.includes("bearer") || lowered.includes("token");
  return NextResponse.json(
    {
      success: false,
      error: {
        code: isAuthError ? "UNAUTHORIZED" : "INTERNAL_ERROR",
        message: isAuthError ? "Invalid browser extension token" : fallback,
      },
    },
    { status: isAuthError ? 401 : 500 }
  );
}

export async function GET(request: NextRequest) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const data = await getBrowserBookmarkPreferences(token.user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserBookmarks Preferences] GET error:", error);
    return errorResponse(error, "Failed to load bookmark metadata preferences");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const body = await request.json();
    const data = await updateBrowserBookmarkPreferences(token.user.id, {
      resourceTypes: Array.isArray(body.resourceTypes)
        ? body.resourceTypes.filter((value: unknown) => typeof value === "string")
        : undefined,
      resourceRelationships: Array.isArray(body.resourceRelationships)
        ? body.resourceRelationships.filter((value: unknown) => typeof value === "string")
        : undefined,
      userIntents: Array.isArray(body.userIntents)
        ? body.userIntents.filter((value: unknown) => typeof value === "string")
        : undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserBookmarks Preferences] PATCH error:", error);
    return errorResponse(error, "Failed to save bookmark metadata preferences");
  }
}
