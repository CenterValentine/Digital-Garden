import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { assignContentToWorkspace } from "@/lib/domain/workspaces";
import type {
  ContentWorkspaceItemAssignmentType,
  ContentWorkspaceItemScope,
} from "@/lib/database/generated/prisma";

type Params = Promise<{ id: string }>;

const ASSIGNMENT_TYPES = new Set(["primary", "shared", "borrowed"]);
const SCOPES = new Set(["item", "recursive"]);

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
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();

    if (typeof body.contentId !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_REQUEST", message: "contentId is required" },
        },
        { status: 400 }
      );
    }

    const assignmentType = ASSIGNMENT_TYPES.has(body.assignmentType)
      ? (body.assignmentType as ContentWorkspaceItemAssignmentType)
      : "primary";
    const scope = SCOPES.has(body.scope)
      ? (body.scope as ContentWorkspaceItemScope)
      : "item";

    const data = await assignContentToWorkspace(session.user.id, id, body.contentId, {
      assignmentType,
      scope,
      expiresAt:
        body.expiresAt === null || typeof body.expiresAt === "string"
          ? body.expiresAt
          : undefined,
      moveFromWorkspaceId:
        typeof body.moveFromWorkspaceId === "string"
          ? body.moveFromWorkspaceId
          : null,
    });

    if (!data) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Workspace or content not found" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Workspace Assignments API] POST error:", error);
    return errorResponse(error, "Failed to assign content to workspace");
  }
}
