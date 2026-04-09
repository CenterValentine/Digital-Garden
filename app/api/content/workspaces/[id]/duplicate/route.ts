import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { duplicateWorkspace } from "@/lib/domain/workspaces";

type Params = Promise<{ id: string }>;

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

export async function POST(
  request: Request,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name : undefined;
    const data = await duplicateWorkspace(session.user.id, id, name);

    if (!data) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Workspace not found" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("[Workspace Duplicate API] POST error:", error);
    return errorResponse(error, "Failed to duplicate workspace");
  }
}
