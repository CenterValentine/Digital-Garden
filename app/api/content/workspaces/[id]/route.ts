import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  archiveWorkspace,
  getWorkspace,
  updateWorkspace,
} from "@/lib/domain/workspaces";

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

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const data = await getWorkspace(session.user.id, id);
    if (!data) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Workspace not found" },
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Workspace API] GET error:", error);
    return errorResponse(error, "Failed to fetch workspace");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const data = await updateWorkspace(session.user.id, id, {
      name: typeof body.name === "string" ? body.name : undefined,
      isLocked: typeof body.isLocked === "boolean" ? body.isLocked : undefined,
      expiresAt:
        body.expiresAt === null || typeof body.expiresAt === "string"
          ? body.expiresAt
          : undefined,
      settings:
        body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
          ? body.settings
          : undefined,
    });

    if (!data) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Workspace not found" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Workspace API] PATCH error:", error);
    return errorResponse(error, "Failed to update workspace");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const data = await archiveWorkspace(session.user.id, id);
    if (!data) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND_OR_MAIN",
            message: "Workspace not found or cannot be archived",
          },
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Workspace API] DELETE error:", error);
    return errorResponse(error, "Failed to archive workspace");
  }
}
