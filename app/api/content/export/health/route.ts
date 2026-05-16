/**
 * Export System Health Monitoring API
 *
 * GET /api/content/export/health
 * Returns error statistics and discrepancy reports
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/infrastructure/auth/middleware";
import { errorMonitor, checkExportHealth } from "@/lib/domain/export/error-monitoring";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/export/health";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup (admin)" },
        async () => requireRole("admin"),
      );

      const health = checkExportHealth();
      const stats = errorMonitor.getStatistics();

      const criticalDiscrepancies = errorMonitor.getDiscrepancies({
        severity: "critical",
      });
      const highDiscrepancies = errorMonitor.getDiscrepancies({
        severity: "high",
      });

      return NextResponse.json({
        success: true,
        data: {
          status: health.healthy ? "healthy" : "unhealthy",
          issues: health.issues,
          statistics: {
            totalErrors: stats.totalErrors,
            errorsByType: stats.errorsByType,
            errorsByCode: stats.errorsByCode,
            recentErrors: stats.recentErrors.slice(-5),
          },
          discrepancies: {
            critical: criticalDiscrepancies,
            high: highDiscrepancies,
            top10: stats.topDiscrepancies,
          },
          recommendations: generateRecommendations(health, stats),
        },
      });
    } catch (error) {
      logger.error({
        layer: "export",
        event: "health:caught",
        summary: "health check failed — 500",
        error,
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVER_ERROR",
            message: "Failed to retrieve health metrics",
          },
        },
        { status: 500 }
      );
    }
  });
}

function generateRecommendations(
  health: ReturnType<typeof checkExportHealth>,
  stats: ReturnType<typeof errorMonitor.getStatistics>
): string[] {
  const recommendations: string[] = [];

  if (stats.totalErrors > 100) {
    recommendations.push(
      "High error count detected. Review error logs and consider updating converters."
    );
  }

  const unknownNodeErrors = stats.errorsByType["unknown_node"] || 0;
  if (unknownNodeErrors > 10) {
    recommendations.push(
      `${unknownNodeErrors} unknown node type errors. Update schema-version.ts and add converter support.`
    );
  }

  const validationErrors = stats.errorsByType["validation"] || 0;
  if (validationErrors > 20) {
    recommendations.push(
      `${validationErrors} validation errors. Check TipTap extension implementations for required attributes.`
    );
  }

  if (stats.topDiscrepancies.length > 0) {
    const top = stats.topDiscrepancies[0];
    if (top.occurrences > 50) {
      recommendations.push(
        `Recurring issue: ${top.type} (${top.occurrences} occurrences). ${top.details.suggestion || "Review schema documentation."}`
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push("Export system is healthy. No actions needed.");
  }

  return recommendations;
}
