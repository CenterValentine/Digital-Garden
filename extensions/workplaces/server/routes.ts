import { NextRequest, NextResponse } from "next/server";
import {
  ContentWorkspaceItemAssignmentType,
  ContentWorkspaceItemScope,
} from "@/lib/database/generated/prisma";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  archiveWorkspace,
  assignContentToWorkspace,
  createWorkspace,
  duplicateWorkspace,
  getWorkspace,
  listWorkspaces,
  resetWorkspaces,
  resolveOpenIntent,
  saveWorkspaceState,
  unassignContentFromWorkspace,
  updateWorkspace,
} from "./service";

type WorkspaceParams = Promise<{ id: string }>;
type WorkspaceAssignmentParams = Promise<{ id: string; contentId: string }>;

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

export async function handleListWorkplaces(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get("includeArchived") === "true";
    const data = await listWorkspaces(session.user.id, includeArchived);
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[Workplaces API] GET error:", error);
    return errorResponse(error, "Failed to fetch workspaces");
  }
}

export async function handleCreateWorkplace(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name : "Untitled Workspace";
    const data = await createWorkspace(session.user.id, name);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("[Workplaces API] POST error:", error);
    return errorResponse(error, "Failed to create workspace");
  }
}

export async function handleResetWorkplaces() {
  try {
    const session = await requireAuth();
    const data = await resetWorkspaces(session.user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Workplaces API] RESET error:", error);
    return errorResponse(error, "Failed to reset workplaces");
  }
}

export async function handleResolveWorkplaceOpenIntent(request: NextRequest) {
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
    console.error("[Workplace Open Intent API] POST error:", error);
    return errorResponse(error, "Failed to resolve workplace open intent");
  }
}

export async function handleGetWorkplace(
  _request: NextRequest,
  { params }: { params: WorkspaceParams }
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
    console.error("[Workplace API] GET error:", error);
    return errorResponse(error, "Failed to fetch workspace");
  }
}

export async function handleUpdateWorkplace(
  request: NextRequest,
  { params }: { params: WorkspaceParams }
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
      viewRootContentId:
        body.viewRootContentId === null || typeof body.viewRootContentId === "string"
          ? body.viewRootContentId
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
    console.error("[Workplace API] PATCH error:", error);
    return errorResponse(error, "Failed to update workspace");
  }
}

export async function handleArchiveWorkplace(
  _request: NextRequest,
  { params }: { params: WorkspaceParams }
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
    console.error("[Workplace API] DELETE error:", error);
    return errorResponse(error, "Failed to archive workspace");
  }
}

export async function handleDuplicateWorkplace(
  request: Request,
  { params }: { params: WorkspaceParams }
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
    console.error("[Workplace Duplicate API] POST error:", error);
    return errorResponse(error, "Failed to duplicate workspace");
  }
}

export async function handleSaveWorkplaceState(
  request: NextRequest,
  { params }: { params: WorkspaceParams }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const data = await saveWorkspaceState(session.user.id, id, body);
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
    console.error("[Workplace State API] PATCH error:", error);
    return errorResponse(error, "Failed to save workspace state");
  }
}

export async function handleAssignContentToWorkplace(
  request: NextRequest,
  { params }: { params: WorkspaceParams }
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
    console.error("[Workplace Assignments API] POST error:", error);
    return errorResponse(error, "Failed to assign content to workspace");
  }
}

export async function handleUnassignContentFromWorkplace(
  _request: NextRequest,
  { params }: { params: WorkspaceAssignmentParams }
) {
  try {
    const session = await requireAuth();
    const { id, contentId } = await params;
    const data = await unassignContentFromWorkspace(session.user.id, id, contentId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Workplace Assignment API] DELETE error:", error);
    return errorResponse(error, "Failed to remove content from workspace");
  }
}
