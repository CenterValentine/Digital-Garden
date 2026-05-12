import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  listBrowserExtensionInstalls,
  trustBrowserExtensionInstall,
} from "@/lib/domain/browser-bookmarks";

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const lowered = message.toLowerCase();
  const isAuthError = lowered.includes("auth");
  const isNotFound = lowered.includes("not found");
  return NextResponse.json(
    {
      success: false,
      error: {
        code: isAuthError ? "UNAUTHORIZED" : isNotFound ? "NOT_FOUND" : "INTERNAL_ERROR",
        message: isAuthError ? "Authentication required" : fallback,
      },
    },
    { status: isAuthError ? 401 : isNotFound ? 404 : 500 }
  );
}

export async function GET() {
  try {
    const session = await requireAuth();
    const data = await listBrowserExtensionInstalls(session.user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserBookmarks Installs] GET error:", error);
    return errorResponse(error, "Failed to load trusted browser installs");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const data = await trustBrowserExtensionInstall(session.user.id, {
      installInstanceId:
        typeof body.installInstanceId === "string" ? body.installInstanceId : "",
      extensionId: typeof body.extensionId === "string" ? body.extensionId : "",
      extensionName:
        typeof body.extensionName === "string"
          ? body.extensionName
          : "Digital Garden Browser Bookmarks",
      extensionVersion:
        typeof body.extensionVersion === "string" ? body.extensionVersion : "0.1.0",
      browserName: typeof body.browserName === "string" ? body.browserName : "Chromium Browser",
      browserVersion:
        typeof body.browserVersion === "string" ? body.browserVersion : null,
      osName: typeof body.osName === "string" ? body.osName : "Unknown OS",
      osVersion: typeof body.osVersion === "string" ? body.osVersion : null,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("[BrowserBookmarks Installs] POST error:", error);
    return errorResponse(error, "Failed to trust browser extension");
  }
}
