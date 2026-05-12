import { NextRequest, NextResponse } from "next/server";
import { getAppSyncDeltas } from "@/lib/domain/browser-bookmarks";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const lowered = message.toLowerCase();
  const isAuthError = lowered.includes("bearer") || lowered.includes("token");
  const isNotFound = lowered.includes("not found");
  return NextResponse.json(
    {
      success: false,
      error: {
        code: isAuthError ? "UNAUTHORIZED" : isNotFound ? "NOT_FOUND" : "INTERNAL_ERROR",
        message: isAuthError ? "Invalid browser extension token" : fallback,
      },
    },
    { status: isAuthError ? 401 : isNotFound ? 404 : 500 }
  );
}

export async function GET(request: NextRequest) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const connectionId = request.nextUrl.searchParams.get("connectionId");
    const since = request.nextUrl.searchParams.get("since");

    if (!connectionId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "connectionId is required",
          },
        },
        { status: 400 }
      );
    }

    const data = await getAppSyncDeltas(
      token.user.id,
      connectionId,
      since,
      token.install?.id ?? null
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserBookmarks Pull] GET error:", error);
    return errorResponse(error, "Failed to fetch app bookmark deltas");
  }
}
