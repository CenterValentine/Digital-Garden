/**
 * Admin Audit Logging Utilities
 *
 * Helper functions for tracking admin actions and managing audit logs.
 */

import { prisma } from "@/lib/database/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { AuditAction } from "./api-types";

/**
 * Log an admin action to the audit trail
 *
 * @param userId - ID of admin performing the action
 * @param action - Action being performed (from AUDIT_ACTIONS)
 * @param details - Additional context (old/new values, filters, etc.)
 * @param request - Next.js request object for IP and user agent
 */
export async function logAuditAction(
  userId: string,
  action: AuditAction,
  details: Record<string, unknown>,
  request: NextRequest
): Promise<void> {
  try {
    // Extract client info
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      null;
    const userAgent = request.headers.get("user-agent") || null;

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        targetUserId: (details.targetUserId as string) || null,
        targetContentId: (details.targetContentId as string) || null,
        details: details as any,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    console.error("[AuditLog] Failed to log action:", error);
    // Don't throw - audit failure shouldn't break the request
  }
}

/**
 * Decide whether to log this action based on the action type
 *
 * TODO: Implement audit logging strategy
 *
 * Some actions are logged selectively to avoid log spam:
 * - VIEW_USER_LIST: Only log if filters are applied
 * - VIEW_CONTENT_LIST: Only log if filters are applied
 * - VIEW_AUDIT_LOGS: Always log (meta-logging)
 * - VIEW_SYSTEM_STATS: Always log
 * - VIEW_USER_DETAIL: Always log
 * - VIEW_CONTENT_DETAIL: Always log
 * - CHANGE_USER_ROLE: Always log
 * - DELETE_USER: Always log
 * - EXPORT_AUDIT_LOGS: Always log
 *
 * @param action - The action being performed
 * @param hasFilters - Whether search/filter params were used
 * @returns true if action should be logged
 */
export function shouldLogAction(action: AuditAction, hasFilters: boolean): boolean {
  // TODO: Implement your logging strategy here
  // Consider:
  // - Too much logging = noisy audit trail, hard to find important events
  // - Too little logging = missed security events, incomplete audit
  // - Balance: Log all mutations and filtered views, skip simple list views

  // Example strategy (you can modify):
  const alwaysLog = [
    "VIEW_USER_DETAIL",
    "VIEW_CONTENT_DETAIL",
    "CHANGE_USER_ROLE",
    "DELETE_USER",
    "VIEW_SYSTEM_STATS",
    "VIEW_AUDIT_LOGS",
    "EXPORT_AUDIT_LOGS",
  ];

  const logIfFiltered = ["VIEW_USER_LIST", "VIEW_CONTENT_LIST"];

  if (alwaysLog.includes(action)) {
    return true;
  }

  if (logIfFiltered.includes(action) && hasFilters) {
    return true;
  }

  return false;
}

/**
 * Format bytes to human-readable string
 *
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.23 GB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Calculate total storage used by a user
 *
 * @param userId - User ID to calculate storage for
 * @returns Total bytes used
 */
export async function calculateUserStorage(userId: string): Promise<number> {
  const result = await prisma.filePayload.aggregate({
    where: {
      content: { ownerId: userId },
    },
    _sum: {
      fileSize: true,
    },
  });

  return Number(result._sum.fileSize || 0);
}


/**
 * Generate CSV from audit logs
 *
 * @param logs - Array of audit log entries with relations
 * @returns CSV string
 */
export function generateCSV(
  logs: Array<{
    id: string;
    action: string;
    createdAt: Date;
    ipAddress: string | null;
    details: unknown;
    user: { username: string };
    targetUser?: { username: string } | null;
    targetContent?: { title: string } | null;
  }>
): string {
  const headers = [
    "Timestamp",
    "Admin",
    "Action",
    "Target User",
    "Target Content",
    "IP Address",
    "Details",
  ];

  const rows = logs.map((log) => [
    log.createdAt.toISOString(),
    log.user.username,
    log.action,
    log.targetUser?.username || "",
    log.targetContent?.title || "",
    log.ipAddress || "",
    JSON.stringify(log.details),
  ]);

  // CSV escape: wrap in quotes and escape internal quotes
  const escapeCSV = (cell: string) => `"${cell.replace(/"/g, '""')}"`;

  return [
    headers.join(","),
    ...rows.map((row) => row.map(escapeCSV).join(",")),
  ].join("\n");
}

/**
 * Handle API errors consistently across admin routes
 *
 * @param error - Error object
 * @returns NextResponse with formatted error
 */
export function handleApiError(error: unknown): NextResponse {
  console.error("[Admin API Error]:", error);

  if (error instanceof Error) {
    // Authentication/Authorization errors
    if (error.message.includes("Authentication required")) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        { status: 401 }
      );
    }

    if (
      error.message.includes("Insufficient permissions") ||
      error.message.includes("Owner role required")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "Owner role required" },
        },
        { status: 403 }
      );
    }

    // Validation errors
    if (error.message.includes("Invalid") || error.message.includes("required")) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: error.message },
        },
        { status: 400 }
      );
    }
  }

  // Generic internal error
  return NextResponse.json(
    {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    },
    { status: 500 }
  );
}
