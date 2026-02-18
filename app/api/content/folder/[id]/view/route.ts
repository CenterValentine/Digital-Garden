/**
 * Folder View API - View Mode Management
 *
 * GET   /api/content/folder/[id]/view - Get folder view settings
 * PATCH /api/content/folder/[id]/view - Update folder view mode
 *
 * Phase 2: Folder view mode persistence
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

type Params = Promise<{ id: string }>;

// ============================================================
// GET /api/content/folder/[id]/view - Get Folder View Settings
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Fetch folder with payload
    const folder = await prisma.contentNode.findUnique({
      where: { id },
      include: {
        folderPayload: true,
      },
    });

    if (!folder) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Folder not found",
          },
        },
        { status: 404 }
      );
    }

    // Check ownership
    if (folder.ownerId !== session.user.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Access denied",
          },
        },
        { status: 403 }
      );
    }

    // Verify it's actually a folder
    if (folder.contentType !== "folder") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_TYPE",
            message: "Content is not a folder",
          },
        },
        { status: 400 }
      );
    }

    // Return folder view settings
    return NextResponse.json({
      success: true,
      data: {
        viewMode: folder.folderPayload?.viewMode || "list",
        sortMode: folder.folderPayload?.sortMode || null,
        viewPrefs: folder.folderPayload?.viewPrefs || {},
        includeReferencedContent: folder.folderPayload?.includeReferencedContent || false,
      },
    });
  } catch (error) {
    console.error("[Folder View API] GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Internal server error",
        },
      },
      { status: 500 }
    );
  }
}

// ============================================================
// PATCH /api/content/folder/[id]/view - Update Folder View Mode
// ============================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();

    // Validate request body
    const { viewMode, sortMode, viewPrefs, includeReferencedContent } = body;

    // Validate viewMode if provided
    const validViewModes = ["list", "gallery", "kanban", "dashboard", "canvas"];
    if (viewMode && !validViewModes.includes(viewMode)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_VIEW_MODE",
            message: `Invalid view mode. Must be one of: ${validViewModes.join(", ")}`,
          },
        },
        { status: 400 }
      );
    }

    // Validate sortMode if provided
    const validSortModes = [null, "asc", "desc"];
    if (sortMode !== undefined && !validSortModes.includes(sortMode)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_SORT_MODE",
            message: "Invalid sort mode. Must be one of: null, asc, desc",
          },
        },
        { status: 400 }
      );
    }

    // Fetch folder to verify ownership and type
    const folder = await prisma.contentNode.findUnique({
      where: { id },
      include: {
        folderPayload: true,
      },
    });

    if (!folder) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Folder not found",
          },
        },
        { status: 404 }
      );
    }

    // Check ownership
    if (folder.ownerId !== session.user.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Access denied",
          },
        },
        { status: 403 }
      );
    }

    // Verify it's actually a folder
    if (folder.contentType !== "folder") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_TYPE",
            message: "Content is not a folder",
          },
        },
        { status: 400 }
      );
    }

    // Build update data (only include fields that were provided)
    const updateData: any = {};
    if (viewMode !== undefined) updateData.viewMode = viewMode;
    if (sortMode !== undefined) updateData.sortMode = sortMode;
    if (viewPrefs !== undefined) updateData.viewPrefs = viewPrefs;
    if (includeReferencedContent !== undefined) updateData.includeReferencedContent = includeReferencedContent;

    // Update folder payload
    const updatedPayload = await prisma.folderPayload.upsert({
      where: { contentId: id },
      update: updateData,
      create: {
        contentId: id,
        viewMode: viewMode || "list",
        sortMode: sortMode || null,
        viewPrefs: viewPrefs || {},
        includeReferencedContent: includeReferencedContent || false,
      },
    });

    console.log("[Folder View API] Updated folder view:", {
      folderId: id,
      viewMode: updatedPayload.viewMode,
      sortMode: updatedPayload.sortMode,
    });

    return NextResponse.json({
      success: true,
      data: {
        viewMode: updatedPayload.viewMode,
        sortMode: updatedPayload.sortMode,
        viewPrefs: updatedPayload.viewPrefs,
        includeReferencedContent: updatedPayload.includeReferencedContent,
      },
    });
  } catch (error) {
    console.error("[Folder View API] PATCH error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Internal server error",
        },
      },
      { status: 500 }
    );
  }
}
