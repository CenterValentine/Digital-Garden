/**
 * Admin API - Content Overview (List)
 *
 * GET /api/admin/content - List all content across users (read-only)
 *
 * Owner role required.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireRole } from "@/lib/infrastructure/auth/middleware";
import {
  logAuditAction,
  formatBytes,
  handleApiError,
  shouldLogAction,
} from "@/lib/domain/admin/audit";
import { AUDIT_ACTIONS, type AdminContentListItem } from "@/lib/domain/admin/api-types";
import type { Prisma } from "@/lib/database/generated/prisma";

// ============================================================
// GET /api/admin/content - List Content
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("owner");
    const { searchParams } = new URL(request.url);

    // Parse query params
    const userId = searchParams.get("userId");
    const type = searchParams.get("type");
    const search = searchParams.get("search");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);
    const offset = Number(searchParams.get("offset") || "0");

    // Build where clause
    const where: Prisma.ContentNodeWhereInput = {
      deletedAt: null, // Only show non-deleted content
    };

    if (userId) {
      where.ownerId = userId;
    }

    if (search) {
      where.title = { contains: search, mode: "insensitive" };
    }

    if (startDate || endDate) {
      where.updatedAt = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(endDate) } : {}),
      };
    }

    // Filter by content type
    if (type) {
      where.contentType = type as any;
    }

    // Query content
    const [items, total] = await Promise.all([
      prisma.contentNode.findMany({
        where,
        select: {
          id: true,
          ownerId: true,
          title: true,
          contentType: true,
          isPublished: true,
          createdAt: true,
          updatedAt: true,
          owner: { select: { username: true } },
          notePayload: { select: { contentId: true } },
          filePayload: {
            select: {
              contentId: true,
              fileName: true,
              fileSize: true,
              mimeType: true,
            },
          },
          htmlPayload: { select: { contentId: true } },
          codePayload: { select: { contentId: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.contentNode.count({ where }),
    ]);

    // Format response
    const formatted: AdminContentListItem[] = items.map((item) => ({
      id: item.id,
      ownerId: item.ownerId,
      ownerUsername: item.owner.username,
      title: item.title,
      contentType: item.contentType as AdminContentListItem['contentType'],
      isPublished: item.isPublished,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      fileSize: item.filePayload
        ? formatBytes(Number(item.filePayload.fileSize))
        : undefined,
    }));

    // Log audit (only if filters are used)
    const hasFilters = !!(userId || type || search || startDate || endDate);
    if (shouldLogAction(AUDIT_ACTIONS.VIEW_CONTENT_LIST, hasFilters)) {
      await logAuditAction(
        session.user.id,
        AUDIT_ACTIONS.VIEW_CONTENT_LIST,
        {
          filters: {
            userId,
            type,
            search,
            startDate,
            endDate,
          },
          resultCount: formatted.length,
        },
        request
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        items: formatted,
        total,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
