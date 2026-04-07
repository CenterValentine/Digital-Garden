import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { resolveOpenIntent } from "@/lib/domain/workspaces";

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

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    if (typeof body.workspaceId !== "string" || typeof body.contentId !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "workspaceId and contentId are required",
          },
        },
        { status: 400 }
      );
    }

    const data = await resolveOpenIntent(
      session.user.id,
      body.workspaceId,
      body.contentId
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Workspace Open Intent API] POST error:", error);
    return errorResponse(error, "Failed to resolve workspace open intent");
  }
}
