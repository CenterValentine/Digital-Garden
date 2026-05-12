import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  createBrowserExtensionTokenRecord,
  listBrowserExtensionTokens,
} from "@/lib/domain/browser-bookmarks";

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const isAuthError = message.toLowerCase().includes("auth");
  return NextResponse.json(
    {
      success: false,
      error: {
        code: isAuthError ? "UNAUTHORIZED" : "INTERNAL_ERROR",
        message: isAuthError ? "Authentication required" : fallback,
      },
    },
    { status: isAuthError ? 401 : 500 }
  );
}

export async function GET() {
  try {
    const session = await requireAuth();
    const data = await listBrowserExtensionTokens(session.user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserBookmarks Tokens] GET error:", error);
    return errorResponse(error, "Failed to load browser extension tokens");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const data = await createBrowserExtensionTokenRecord(session.user.id, {
      name: typeof body.name === "string" ? body.name : "Browser Bookmarks",
      expiresAt:
        body.expiresAt === null || typeof body.expiresAt === "string"
          ? body.expiresAt
          : undefined,
      scopes: Array.isArray(body.scopes)
        ? body.scopes.filter((scope): scope is string => typeof scope === "string")
        : undefined,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("[BrowserBookmarks Tokens] POST error:", error);
    return errorResponse(error, "Failed to create browser extension token");
  }
}
