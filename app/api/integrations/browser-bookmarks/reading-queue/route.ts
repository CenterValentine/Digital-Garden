import { NextRequest, NextResponse } from "next/server";
import { ExternalReadingStatus } from "@/lib/database/generated/prisma";
import { getBrowserReadingQueue } from "@/lib/domain/browser-bookmarks";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";

const VALID_STATUSES = new Set<ExternalReadingStatus>([
  "inbox",
  "queue",
  "reading",
  "read",
  "archived",
]);

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
    const connectionId = request.nextUrl.searchParams.get("connectionId");
    const statuses = (request.nextUrl.searchParams.get("statuses") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value): value is ExternalReadingStatus => VALID_STATUSES.has(value as ExternalReadingStatus));

    const data = await getBrowserReadingQueue(token.user.id, {
      connectionId,
      statuses,
      installId: token.install?.id ?? null,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserBookmarks Queue] GET error:", error);
    return errorResponse(error, "Failed to fetch reading queue");
  }
}
