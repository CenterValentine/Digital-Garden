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
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/folder/[id]/view";

type Params = Promise<{ id: string }>;

// ============================================================
// GET /api/content/folder/[id]/view - Get Folder View Settings
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await params;

      const folder = await withSpan(
        { layer: "content", name: "folder_lookup" },
        { attrs: { content_id: id } },
        async (span) => {
          const result = await prisma.contentNode.findUnique({
            where: { id },
            include: { folderPayload: true },
          });
          if (result) {
            span.attr("kind", result.contentType);
          } else {
            span.attr("found", false);
          }
          return result;
        },
      );

      if (!folder) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "NOT_FOUND", message: "Folder not found" },
          },
          { status: 404 }
        );
      }

      if (folder.ownerId !== session.user.id) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "FORBIDDEN", message: "Access denied" },
          },
          { status: 403 }
        );
      }

      if (folder.contentType !== "folder") {
        return NextResponse.json(
          {
            success: false,
            error: { code: "INVALID_TYPE", message: "Content is not a folder" },
          },
          { status: 400 }
        );
      }

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
      logger.error({
        layer: "content",
        event: "folder_view_read:caught",
        summary: "GET caught — translated to 500",
        error,
      });
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
  });
}

// ============================================================
// PATCH /api/content/folder/[id]/view - Update Folder View Mode
// ============================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await params;
      const body = await request.json();

      const { viewMode, sortMode, viewPrefs, includeReferencedContent } = body;

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

      const folder = await prisma.contentNode.findUnique({
        where: { id },
        include: { folderPayload: true },
      });

      if (!folder) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "NOT_FOUND", message: "Folder not found" },
          },
          { status: 404 }
        );
      }

      if (folder.ownerId !== session.user.id) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "FORBIDDEN", message: "Access denied" },
          },
          { status: 403 }
        );
      }

      if (folder.contentType !== "folder") {
        return NextResponse.json(
          {
            success: false,
            error: { code: "INVALID_TYPE", message: "Content is not a folder" },
          },
          { status: 400 }
        );
      }

      const updateData: Record<string, unknown> = {};
      if (viewMode !== undefined) updateData.viewMode = viewMode;
      if (sortMode !== undefined) updateData.sortMode = sortMode;
      if (viewPrefs !== undefined) updateData.viewPrefs = viewPrefs;
      if (includeReferencedContent !== undefined) updateData.includeReferencedContent = includeReferencedContent;

      const updatedPayload = await withSpan(
        { layer: "content", name: "folder_view_write" },
        {
          attrs: { content_id: id, view_mode: viewMode ?? "(unchanged)" },
          summary: `view=${viewMode ?? "(unchanged)"}`,
        },
        async () => {
          return await prisma.folderPayload.upsert({
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
        },
      );

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
      logger.error({
        layer: "content",
        event: "folder_view_write:caught",
        summary: "PATCH caught — translated to 500",
        error,
      });
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
  });
}
