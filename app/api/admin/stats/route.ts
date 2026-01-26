/**
 * Admin API - System Statistics
 *
 * GET /api/admin/stats - Get system-wide statistics
 *
 * Owner role required.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireRole } from "@/lib/infrastructure/auth/middleware";
import { logAuditAction, formatBytes, handleApiError } from "@/lib/domain/admin/audit";
import { AUDIT_ACTIONS, type SystemStats } from "@/lib/domain/admin/api-types";

// ============================================================
// GET /api/admin/stats - System Statistics
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("owner");

    // Calculate date ranges
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Aggregate stats in parallel
    const [
      totalUsers,
      usersByRole,
      totalContent,
      contentByPayload,
      publishedCount,
      deletedCount,
      totalStorage,
      storageByProvider,
      largestFilesData,
      activeUsersWeek,
      activeUsersMonth,
      contentToday,
      contentWeek,
      contentMonth,
    ] = await Promise.all([
      // User stats
      prisma.user.count(),
      prisma.user.groupBy({
        by: ["role"],
        _count: true,
      }),

      // Content stats
      prisma.contentNode.count(),
      Promise.all([
        prisma.contentNode.count({ where: { notePayload: { isNot: null } } }),
        prisma.contentNode.count({ where: { filePayload: { isNot: null } } }),
        prisma.contentNode.count({ where: { htmlPayload: { isNot: null } } }),
        prisma.contentNode.count({ where: { codePayload: { isNot: null } } }),
        prisma.contentNode.count({
          where: {
            notePayload: null,
            filePayload: null,
            htmlPayload: null,
            codePayload: null,
          },
        }),
      ]),
      prisma.contentNode.count({ where: { isPublished: true } }),
      prisma.contentNode.count({ where: { deletedAt: { not: null } } }),

      // Storage stats
      prisma.filePayload.aggregate({
        _sum: { fileSize: true },
      }),
      prisma.filePayload.groupBy({
        by: ["storageProvider"],
        _sum: { fileSize: true },
      }),
      prisma.filePayload.findMany({
        select: {
          fileSize: true,
          content: {
            select: {
              id: true,
              title: true,
              owner: {
                select: { username: true },
              },
            },
          },
        },
        orderBy: { fileSize: "desc" },
        take: 10,
      }),

      // Activity stats
      prisma.session.groupBy({
        by: ["userId"],
        where: {
          createdAt: { gte: weekAgo },
        },
        _count: true,
      }),
      prisma.session.groupBy({
        by: ["userId"],
        where: {
          createdAt: { gte: monthAgo },
        },
        _count: true,
      }),
      prisma.contentNode.count({
        where: { createdAt: { gte: today } },
      }),
      prisma.contentNode.count({
        where: { createdAt: { gte: weekAgo } },
      }),
      prisma.contentNode.count({
        where: { createdAt: { gte: monthAgo } },
      }),
    ]);

    // Format content by type
    const [noteCount, fileCount, htmlCount, codeCount, folderCount] = contentByPayload;
    const contentByType: Record<string, number> = {
      note: noteCount,
      file: fileCount,
      html: htmlCount,
      code: codeCount,
      folder: folderCount,
    };

    // Format users by role
    const usersByRoleMap: Record<string, number> = {};
    for (const item of usersByRole) {
      usersByRoleMap[item.role] = item._count;
    }

    // Format storage by provider
    const storageByProviderMap: Record<string, string> = {};
    for (const item of storageByProvider) {
      storageByProviderMap[item.storageProvider] = formatBytes(
        Number(item._sum.fileSize || 0)
      );
    }

    // Format largest files
    const largestFiles = largestFilesData.map((file) => ({
      id: file.content.id,
      title: file.content.title,
      ownerUsername: file.content.owner.username,
      size: formatBytes(Number(file.fileSize)),
    }));

    // Build stats response
    const stats: SystemStats = {
      users: {
        total: totalUsers,
        byRole: usersByRoleMap,
        activeLastWeek: activeUsersWeek.length,
        activeLastMonth: activeUsersMonth.length,
      },
      content: {
        total: totalContent,
        byType: contentByType,
        published: publishedCount,
        deleted: deletedCount,
      },
      storage: {
        totalBytes: formatBytes(Number(totalStorage._sum.fileSize || 0)),
        byProvider: storageByProviderMap,
        largestFiles,
      },
      activity: {
        contentCreatedToday: contentToday,
        contentCreatedThisWeek: contentWeek,
        contentCreatedThisMonth: contentMonth,
      },
    };

    // Log audit action
    await logAuditAction(
      session.user.id,
      AUDIT_ACTIONS.VIEW_SYSTEM_STATS,
      {},
      request
    );

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    return handleApiError(error);
  }
}