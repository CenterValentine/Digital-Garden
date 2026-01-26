/**
 * Admin API - User Management (List)
 *
 * GET /api/admin/users - List all users with stats
 *
 * Owner role required for all admin endpoints.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireRole } from "@/lib/auth/middleware";
import {
  logAuditAction,
  calculateUserStorage,
  formatBytes,
  handleApiError,
  shouldLogAction,
} from "@/lib/domain/admin/audit";
import { AUDIT_ACTIONS, type AdminUserListItem } from "@/lib/domain/admin/api-types";
import type { Prisma } from "@/lib/database/generated/prisma";

// ============================================================
// GET /api/admin/users - List Users
// ============================================================

export async function GET(request: NextRequest) {
  try {
    // 1. Require owner role
    const session = await requireRole("owner");

    // 2. Parse query params
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const role = searchParams.get("role");
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = (searchParams.get("sortOrder") || "desc") as "asc" | "desc";
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);
    const offset = Number(searchParams.get("offset") || "0");

    // 3. Build where clause
    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        { username: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (role && ["owner", "admin", "member", "guest"].includes(role)) {
      where.role = role as any;
    }

    // 4. Build orderBy clause
    const orderBy: Prisma.UserOrderByWithRelationInput = {};
    if (sortBy === "username") {
      orderBy.username = sortOrder;
    } else if (sortBy === "email") {
      orderBy.email = sortOrder;
    } else if (sortBy === "contentCount") {
      orderBy.contentNodes = { _count: sortOrder };
    } else {
      orderBy.createdAt = sortOrder;
    }

    // 5. Query users with aggregated stats
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { contentNodes: true },
          },
          sessions: {
            select: { createdAt: true },
            where: {
              expiresAt: { gt: new Date() }, // Only non-expired sessions
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy,
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where }),
    ]);

    // 6. Calculate storage usage per user
    const userIds = users.map((u) => u.id);
    const storageResults = await prisma.filePayload.groupBy({
      by: ["contentId"],
      where: {
        content: {
          ownerId: { in: userIds },
        },
      },
      _sum: {
        fileSize: true,
      },
    });

    // Map content to owner for storage calculation
    const contentOwners = await prisma.contentNode.findMany({
      where: {
        id: { in: storageResults.map((r) => r.contentId) },
      },
      select: {
        id: true,
        ownerId: true,
      },
    });

    const storageByUser = new Map<string, number>();
    for (const result of storageResults) {
      const content = contentOwners.find((c) => c.id === result.contentId);
      if (content) {
        const current = storageByUser.get(content.ownerId) || 0;
        storageByUser.set(content.ownerId, current + Number(result._sum.fileSize || 0));
      }
    }

    // 7. Format response
    const formattedUsers: AdminUserListItem[] = users.map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      contentCount: user._count.contentNodes,
      storageUsage: formatBytes(storageByUser.get(user.id) || 0),
      lastActivity: user.sessions[0]?.createdAt || null,
    }));

    // 8. Log audit action (only if filters applied)
    const hasFilters = !!(search || role);
    if (shouldLogAction(AUDIT_ACTIONS.VIEW_USER_LIST, hasFilters)) {
      await logAuditAction(
        session.user.id,
        AUDIT_ACTIONS.VIEW_USER_LIST,
        {
          filters: { search, role, sortBy, sortOrder },
          resultCount: formattedUsers.length,
        },
        request
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        users: formattedUsers,
        total,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
