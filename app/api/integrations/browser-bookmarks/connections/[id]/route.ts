import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  deleteBookmarkSyncConnection,
  listBookmarkSyncConnections,
  updateBookmarkSyncConnection,
} from "@/lib/domain/browser-bookmarks";

type Params = Promise<{ id: string }>;

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const all = await listBookmarkSyncConnections(session.user.id);
    const data = all.find((connection) => connection.id === id);
    if (!data) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Bookmark sync connection not found" },
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserBookmarks Connections] GET by id error:", error);
    return errorResponse(error, "Failed to load bookmark sync connection");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const data = await updateBookmarkSyncConnection(session.user.id, id, {
      name: typeof body.name === "string" ? body.name : undefined,
      tokenId:
        body.tokenId === null || typeof body.tokenId === "string"
          ? body.tokenId
          : undefined,
      chromeRootTitle:
        typeof body.chromeRootTitle === "string" ? body.chromeRootTitle : undefined,
      appRootId: typeof body.appRootId === "string" ? body.appRootId : undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserBookmarks Connections] PATCH error:", error);
    return errorResponse(error, "Failed to update bookmark sync connection");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const data = await deleteBookmarkSyncConnection(session.user.id, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserBookmarks Connections] DELETE error:", error);
    return errorResponse(error, "Failed to delete bookmark sync connection");
  }
}
