import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  refreshBrowserExtensionInstall,
  revokeBrowserExtensionInstall,
} from "@/lib/domain/browser-bookmarks";
import { logger } from "@/lib/core/logger";

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
        message: isAuthError ? "Authentication required" : message,
      },
    },
    { status: isAuthError ? 401 : isNotFound ? 404 : 500 }
  );
}

type Params = Promise<{ id: string }>;

export async function PATCH(_request: NextRequest, { params }: { params: Params }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const data = await refreshBrowserExtensionInstall(session.user.id, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error({ layer: "browser_ext", event: "install_refresh:caught", summary: "PATCH caught", error });
    return errorResponse(error, "Failed to refresh trusted browser install");
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const data = await revokeBrowserExtensionInstall(session.user.id, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error({ layer: "browser_ext", event: "install_revoke:caught", summary: "DELETE caught", error });
    return errorResponse(error, "Failed to revoke trusted browser install");
  }
}
