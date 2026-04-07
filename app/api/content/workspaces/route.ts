import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { createWorkspace, listWorkspaces } from "@/lib/domain/workspaces";

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

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get("includeArchived") === "true";
    const data = await listWorkspaces(session.user.id, includeArchived);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Workspaces API] GET error:", error);
    return errorResponse(error, "Failed to fetch workspaces");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name : "Untitled Workspace";
    const data = await createWorkspace(session.user.id, name);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("[Workspaces API] POST error:", error);
    return errorResponse(error, "Failed to create workspace");
  }
}
