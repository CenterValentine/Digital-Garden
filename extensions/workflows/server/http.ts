import { NextResponse } from "next/server";

/** Repo-convention error envelope: { success: false, error: { code, message } }. */
export function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status }
  );
}

/** Maps thrown auth errors to 401, everything else to 500 (matches existing routes). */
export function handleRouteError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const isAuthError =
    message === "Unauthorized" ||
    message === "Authentication required" ||
    message.toLowerCase().includes("auth");
  return errorResponse(
    isAuthError ? 401 : 500,
    isAuthError ? "UNAUTHORIZED" : "INTERNAL_ERROR",
    message
  );
}
