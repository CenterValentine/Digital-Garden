import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { revokeBrowserExtensionToken } from "@/lib/domain/browser-bookmarks";

type Params = Promise<{ id: string }>;

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message.toLowerCase().includes("not found") ? 404 : 500;
  const isAuthError = message.toLowerCase().includes("auth");
  return NextResponse.json(
    {
      success: false,
      error: {
        code: isAuthError ? "UNAUTHORIZED" : status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR",
        message: isAuthError ? "Authentication required" : fallback,
      },
    },
    { status: isAuthError ? 401 : status }
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const data = await revokeBrowserExtensionToken(session.user.id, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserBookmarks Tokens] DELETE error:", error);
    return errorResponse(error, "Failed to revoke browser extension token");
  }
}
