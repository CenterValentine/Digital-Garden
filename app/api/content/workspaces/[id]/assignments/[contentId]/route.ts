import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { unassignContentFromWorkspace } from "@/lib/domain/workspaces";

type Params = Promise<{ id: string; contentId: string }>;

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id, contentId } = await params;
    const data = await unassignContentFromWorkspace(session.user.id, id, contentId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Workspace Assignment API] DELETE error:", error);
    return errorResponse(error, "Failed to remove content from workspace");
  }
}
