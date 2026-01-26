/**
 * Admin API - Change User Role
 *
 * PATCH /api/admin/users/[id]/role - Change user's role
 *
 * Owner role required.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/middleware";
import { logAuditAction, handleApiError } from "@/lib/admin/audit";
import {
  AUDIT_ACTIONS,
  type ChangeRoleRequest,
  type ChangeRoleResponse,
} from "@/lib/admin/api-types";

// Valid roles
const VALID_ROLES = ["owner", "admin", "member", "guest"] as const;

// ============================================================
// PATCH /api/admin/users/[id]/role - Change Role
// ============================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole("owner");
    const userId = params.id;

    // Parse request body
    const body: ChangeRoleRequest = await request.json();

    // Validate role
    if (!VALID_ROLES.includes(body.role as any)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`,
          },
        },
        { status: 400 }
      );
    }

    // Prevent changing your own role
    if (userId === session.user.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Cannot change your own role",
          },
        },
        { status: 403 }
      );
    }

    // Get current user
    const user = await prisma.user.findUnique({
      where: { id: userId },
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

    const oldRole = user.role;

    // Check if role is actually changing
    if (oldRole === body.role) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "User already has this role",
          },
        },
        { status: 400 }
      );
    }

    // Update role
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role: body.role },
    });

    // Log audit action
    await logAuditAction(
      session.user.id,
      AUDIT_ACTIONS.CHANGE_USER_ROLE,
      {
        targetUserId: userId,
        oldRole,
        newRole: body.role,
        reason: body.reason || null,
      },
      request
    );

    const response: ChangeRoleResponse = {
      userId: updated.id,
      oldRole,
      newRole: updated.role,
      changedAt: new Date(),
    };

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
