/**
 * Admin API - User Management (Detail & Delete)
 *
 * GET    /api/admin/users/[id] - Get user details
 * DELETE /api/admin/users/[id] - Delete user
 *
 * Owner role required.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireRole } from "@/lib/auth/middleware";
import {
  logAuditAction,
  calculateUserStorage,
  formatBytes,
  handleApiError,
  deriveContentType,
} from "@/lib/admin/audit";
import { AUDIT_ACTIONS, type AdminUserDetail } from "@/lib/admin/api-types";

// ============================================================
// GET /api/admin/users/[id] - User Detail
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole("owner");
    const userId = params.id;

    // Fetch user with full details
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: {
          select: { provider: true, createdAt: true },
        },
        sessions: {
          select: { id: true, createdAt: true, expiresAt: true },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        contentNodes: {
          select: {
            id: true,
            title: true,
            updatedAt: true,
            notePayload: { select: { contentId: true } },
            filePayload: { select: { contentId: true } },
            htmlPayload: { select: { contentId: true } },
            codePayload: { select: { contentId: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 10,
          where: { deletedAt: null },
        },
        _count: {
          select: { contentNodes: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "User not found" },
        },
        { status: 404 }
      );
    }

    // Calculate storage
    const storageBytes = await calculateUserStorage(userId);

    // Format response
    const detail: AdminUserDetail = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      contentCount: user._count.contentNodes,
      storageUsage: formatBytes(storageBytes),
      lastActivity: user.sessions[0]?.createdAt || null,
      accounts: user.accounts.map((acc) => ({
        provider: acc.provider,
        createdAt: acc.createdAt,
      })),
      sessions: user.sessions.map((sess) => ({
        id: sess.id,
        createdAt: sess.createdAt,
        expiresAt: sess.expiresAt,
      })),
      recentContent: user.contentNodes.map((content) => ({
        id: content.id,
        title: content.title,
        contentType: deriveContentType(content),
        updatedAt: content.updatedAt,
      })),
      settings: user.settings as Record<string, unknown> | undefined,
    };

    // Log audit action
    await logAuditAction(
      session.user.id,
      AUDIT_ACTIONS.VIEW_USER_DETAIL,
      { targetUserId: userId },
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

// ============================================================
// DELETE /api/admin/users/[id] - Delete User
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole("owner");
    const userId = params.id;

    // Prevent self-deletion
    if (userId === session.user.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Cannot delete your own account",
          },
        },
        { status: 403 }
      );
    }

    // Get user info before deletion
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: { contentNodes: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "User not found" },
        },
        { status: 404 }
      );
    }

    const contentCount = user._count.contentNodes;

    // Delete user (cascade will delete content, sessions, etc.)
    await prisma.user.delete({ where: { id: userId } });

    // Log audit action
    await logAuditAction(
      session.user.id,
      AUDIT_ACTIONS.DELETE_USER,
      {
        targetUserId: userId,
        deletedUsername: user.username,
        deletedEmail: user.email,
        deletedRole: user.role,
        contentDeleted: contentCount,
      },
      request
    );

    return NextResponse.json({
      success: true,
      data: {
        deletedUserId: userId,
        contentDeleted: contentCount,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}