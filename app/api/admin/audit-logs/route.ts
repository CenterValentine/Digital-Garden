/**
 * Admin API - Audit Logs (List)
 *
 * GET /api/admin/audit-logs - List audit log entries
 *
 * Owner role required.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireRole } from "@/lib/auth/middleware";
import { logAuditAction, handleApiError } from "@/lib/admin/audit";
import { AUDIT_ACTIONS, type AuditLogEntry } from "@/lib/admin/api-types";
import type { Prisma } from "@/lib/database/generated/prisma";

// ============================================================
// GET /api/admin/audit-logs - List Logs
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("owner");
    const { searchParams } = new URL(request.url);

    // Parse query params
    const userId = searchParams.get("userId");
    const action = searchParams.get("action");
    const targetUserId = searchParams.get("targetUserId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 500);
    const offset = Number(searchParams.get("offset") || "0");

    // Build where clause
    const where: Prisma.AuditLogWhereInput = {};

    if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = action;
    }

    if (targetUserId) {
      where.targetUserId = targetUserId;
    }

    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(endDate) } : {}),
      };
    }

    // Query logs
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { username: true } },
          targetUser: { select: { username: true } },
          targetContent: { select: { title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Format response
    const formatted: AuditLogEntry[] = logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      username: log.user.username,
      action: log.action,
      targetUserId: log.targetUserId,
      targetUsername: log.targetUser?.username || null,
      targetContentId: log.targetContentId,
      targetContentTitle: log.targetContent?.title || null,
      details: log.details as Record<string, unknown>,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
    }));

    // Log this view (meta-logging!)
    await logAuditAction(
      session.user.id,
      AUDIT_ACTIONS.VIEW_AUDIT_LOGS,
      {
        filters: {
          userId,
          action,
          targetUserId,
          startDate,
          endDate,
        },
        resultCount: formatted.length,
      },
      request
    );

    return NextResponse.json({
      success: true,
      data: {
        logs: formatted,
        total,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
