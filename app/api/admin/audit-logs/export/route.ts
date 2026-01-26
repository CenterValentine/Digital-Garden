/**
 * Admin API - Audit Logs (CSV Export)
 *
 * GET /api/admin/audit-logs/export - Export audit logs as CSV
 *
 * Owner role required.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireRole } from "@/lib/infrastructure/auth/middleware";
import { logAuditAction, generateCSV, handleApiError } from "@/lib/domain/admin/audit";
import { AUDIT_ACTIONS } from "@/lib/domain/admin/api-types";

// ============================================================
// GET /api/admin/audit-logs/export - Export CSV
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("owner");

    // Get all logs (with reasonable limit to prevent timeout)
    const logs = await prisma.auditLog.findMany({
      include: {
        user: { select: { username: true } },
        targetUser: { select: { username: true } },
        targetContent: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10000, // Max export limit
    });

    // Generate CSV
    const csv = generateCSV(logs);

    // Log export action
    await logAuditAction(
      session.user.id,
      AUDIT_ACTIONS.EXPORT_AUDIT_LOGS,
      { recordCount: logs.length },
      request
    );

    // Return CSV file
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="audit-logs-${new Date().toISOString()}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
