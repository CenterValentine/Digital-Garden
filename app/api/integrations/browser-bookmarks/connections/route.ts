import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  createBookmarkSyncConnection,
  listAuthorizedBookmarkSyncConnections,
  listBookmarkSyncConnections,
} from "@/lib/domain/browser-bookmarks";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const lowered = message.toLowerCase();
  const isAuthError =
    lowered.includes("auth") || lowered.includes("bearer") || lowered.includes("token");
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

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const token = await requireBrowserExtensionBearerAuth(request);
      const data = await listAuthorizedBookmarkSyncConnections(
        token.user.id,
        token.install?.id ?? null
      );
      return NextResponse.json({ success: true, data });
    }

    const session = await requireAuth();
    const data = await listBookmarkSyncConnections(session.user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserBookmarks Connections] GET error:", error);
    return errorResponse(error, "Failed to load bookmark sync connections");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const data = await createBookmarkSyncConnection(session.user.id, {
      name: typeof body.name === "string" ? body.name : "Bookmarks",
      tokenId:
        body.tokenId === null || typeof body.tokenId === "string"
          ? body.tokenId
          : undefined,
      appRootId: typeof body.appRootId === "string" ? body.appRootId : "",
      chromeRootId: typeof body.chromeRootId === "string" ? body.chromeRootId : "",
      chromeRootTitle:
        typeof body.chromeRootTitle === "string" ? body.chromeRootTitle : "Bookmarks",
      installIds: Array.isArray(body.installIds)
        ? body.installIds.filter((value: unknown): value is string => typeof value === "string")
        : undefined,
      currentInstallId:
        body.currentInstallId === null || typeof body.currentInstallId === "string"
          ? body.currentInstallId
          : undefined,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("[BrowserBookmarks Connections] POST error:", error);
    return errorResponse(error, "Failed to create bookmark sync connection");
  }
}
