/**
 * Admin API - Content Detail (View Only)
 *
 * GET /api/admin/content/[id] - View content details
 *
 * Owner role required. Read-only access - no edit/delete.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/middleware";
import {
  logAuditAction,
  handleApiError,
  deriveContentType,
} from "@/lib/admin/audit";
import { AUDIT_ACTIONS, type AdminContentDetail } from "@/lib/admin/api-types";

// ============================================================
// GET /api/admin/content/[id] - Content Detail
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole("owner");
    const contentId = params.id;

    // Fetch content with full details (but truncate payload for security)
    const content = await prisma.contentNode.findUnique({
      where: { id: contentId },
      include: {
        owner: { select: { username: true } },
        notePayload: { select: { searchText: true, metadata: true } },
        filePayload: {
          select: {
            fileName: true,
            mimeType: true,
            fileSize: true,
            uploadStatus: true,
            storageProvider: true,
          },
        },
        htmlPayload: { select: { searchText: true, isTemplate: true } },
        codePayload: { select: { language: true, searchText: true } },
        contentPath: true,
      },
    });

    if (!content) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Content not found" },
        },
        { status: 404 }
      );
    }

    // Format response (with preview, not full content)
    const detail: AdminContentDetail = {
      id: content.id,
      ownerId: content.ownerId,
      ownerUsername: content.owner.username,
      title: content.title,
      slug: content.slug,
      contentType: deriveContentType(content),
      isPublished: content.isPublished,
      createdAt: content.createdAt,
      updatedAt: content.updatedAt,
      deletedAt: content.deletedAt,
      parentPath: content.contentPath?.path || null,
    };

    // Add payload preview (first 500 chars for security)
    if (content.notePayload) {
      detail.payloadPreview = {
        type: "note",
        preview: content.notePayload.searchText.substring(0, 500),
      };
    } else if (content.filePayload) {
      detail.payloadPreview = {
        type: "file",
        preview: `File: ${content.filePayload.fileName} (${content.filePayload.mimeType})`,
      };
    } else if (content.htmlPayload) {
      detail.payloadPreview = {
        type: "html",
        preview: content.htmlPayload.searchText.substring(0, 500),
      };
    } else if (content.codePayload) {
      detail.payloadPreview = {
        type: "code",
        preview: content.codePayload.searchText.substring(0, 500),
      };
    }

    // Log audit action
    await logAuditAction(
      session.user.id,
      AUDIT_ACTIONS.VIEW_CONTENT_DETAIL,
      {
        targetContentId: contentId,
        targetUserId: content.ownerId,
      },
      request
    );

    return NextResponse.json({
      success: true,
      data: detail,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
