/**
 * Shared HTTP error mapping for the folder-assist routes. Kept out of the
 * route files so it isn't mistaken for a Next.js route handler export.
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/core/logger";

export function handleFolderAssistError(
  routePath: string,
  error: unknown,
): NextResponse {
  if (error instanceof Error && error.message === "Authentication required") {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  logger.error({
    layer: "ai",
    event: "folder_assist:caught",
    summary: `POST ${routePath} caught — 500`,
    error,
  });
  return NextResponse.json(
    {
      success: false,
      error: error instanceof Error ? error.message : "Folder Assistant failed",
    },
    { status: 500 },
  );
}
