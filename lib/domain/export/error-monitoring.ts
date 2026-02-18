/**
 * Error Monitoring & Discrepancy Detection
 *
 * Tracks export/import errors and detects schema discrepancies
 */

import type { ValidationResult, ValidationError, ValidationWarning } from "./validation";

export interface ExportErrorLog {
  id: string;
  timestamp: string;
  contentId: string;
  format: string;
  schemaVersion: string;
  errorType: "conversion" | "validation" | "unknown_node" | "system";
  errorCode: string;
  errorMessage: string;
  stackTrace?: string;
  context: Record<string, unknown>;
  userId: string;
}

export interface DiscrepancyReport {
  type: "schema_mismatch" | "unknown_node" | "missing_attribute" | "invalid_structure";
  severity: "critical" | "high" | "medium" | "low";
  detectedAt: string;
  schemaVersion: string;
  details: {
    expected?: unknown;
    actual?: unknown;
    location?: string;
    suggestion?: string;
  };
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
}

/**
 * In-memory error tracking (replace with database in production)
 */
class ErrorMonitor {
  private errors: ExportErrorLog[] = [];
  private discrepancies: Map<string, DiscrepancyReport> = new Map();
  private readonly MAX_ERRORS = 1000; // Keep last 1000 errors

  /**
   * Log an export error
   */
  logError(error: Omit<ExportErrorLog, "id" | "timestamp">): void {
    const log: ExportErrorLog = {
      id: `err_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      ...error,
    };

    this.errors.push(log);

    // Keep only last MAX_ERRORS
    if (this.errors.length > this.MAX_ERRORS) {
      this.errors = this.errors.slice(-this.MAX_ERRORS);
    }

    // Console log for development
    console.error(`[Export Error] ${log.errorCode}: ${log.errorMessage}`, {
      contentId: log.contentId,
      format: log.format,
      context: log.context,
    });

    // Check if this is a recurring issue
    this.detectRecurringIssue(log);
  }

  /**
   * Log validation errors and warnings
   */
  logValidation(
    contentId: string,
    format: string,
    userId: string,
    result: ValidationResult
  ): void {
    result.errors.forEach(err => {
      this.logError({
        contentId,
        format,
        userId,
        schemaVersion: result.metadata?.schemaVersion || "unknown",
        errorType: this.classifyError(err),
        errorCode: err.code,
        errorMessage: err.message,
        context: err.context || {},
      });

      // Track as discrepancy
      this.trackDiscrepancy(err, result.metadata?.schemaVersion || "unknown");
    });

    result.warnings.forEach(warn => {
      // Log warnings as low-severity errors
      this.trackDiscrepancy(
        {
          code: warn.code,
          message: warn.message,
          severity: "low",
        } as ValidationError,
        result.metadata?.schemaVersion || "unknown"
      );
    });
  }

  /**
   * Track discrepancy (aggregates similar issues)
   */
  private trackDiscrepancy(error: ValidationError, schemaVersion: string): void {
    const key = `${error.code}:${schemaVersion}`;
    const now = new Date().toISOString();

    const existing = this.discrepancies.get(key);

    if (existing) {
      // Update existing discrepancy
      existing.occurrences++;
      existing.lastSeen = now;
    } else {
      // Create new discrepancy report
      const report: DiscrepancyReport = {
        type: this.classifyDiscrepancy(error.code),
        severity: error.severity,
        detectedAt: now,
        schemaVersion,
        details: {
          location: (error.context?.path as string) || "unknown",
          suggestion: this.generateSuggestion(error),
        },
        occurrences: 1,
        firstSeen: now,
        lastSeen: now,
      };

      this.discrepancies.set(key, report);

      // Alert if critical
      if (error.severity === "critical") {
        this.alertCriticalIssue(report);
      }
    }
  }

  /**
   * Get error statistics
   */
  getStatistics(): {
    totalErrors: number;
    errorsByType: Record<string, number>;
    errorsByCode: Record<string, number>;
    recentErrors: ExportErrorLog[];
    topDiscrepancies: DiscrepancyReport[];
  } {
    const errorsByType: Record<string, number> = {};
    const errorsByCode: Record<string, number> = {};

    this.errors.forEach(err => {
      errorsByType[err.errorType] = (errorsByType[err.errorType] || 0) + 1;
      errorsByCode[err.errorCode] = (errorsByCode[err.errorCode] || 0) + 1;
    });

    // Get top discrepancies by occurrence count
    const topDiscrepancies = Array.from(this.discrepancies.values())
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 10);

    return {
      totalErrors: this.errors.length,
      errorsByType,
      errorsByCode,
      recentErrors: this.errors.slice(-10),
      topDiscrepancies,
    };
  }

  /**
   * Get discrepancy report
   */
  getDiscrepancies(filters?: {
    severity?: string;
    type?: string;
    since?: Date;
  }): DiscrepancyReport[] {
    let reports = Array.from(this.discrepancies.values());

    if (filters?.severity) {
      reports = reports.filter(r => r.severity === filters.severity);
    }

    if (filters?.type) {
      reports = reports.filter(r => r.type === filters.type);
    }

    if (filters?.since) {
      reports = reports.filter(r => new Date(r.firstSeen) >= filters.since!);
    }

    return reports.sort((a, b) => b.occurrences - a.occurrences);
  }

  /**
   * Clear old errors and discrepancies
   */
  cleanup(olderThan: Date): void {
    this.errors = this.errors.filter(
      err => new Date(err.timestamp) >= olderThan
    );

    // Clear discrepancies not seen recently
    for (const [key, report] of this.discrepancies.entries()) {
      if (new Date(report.lastSeen) < olderThan) {
        this.discrepancies.delete(key);
      }
    }
  }

  /**
   * Detect recurring issues
   */
  private detectRecurringIssue(error: ExportErrorLog): void {
    // Check if same error occurred multiple times recently
    const recentSimilar = this.errors
      .slice(-100) // Last 100 errors
      .filter(e => e.errorCode === error.errorCode);

    if (recentSimilar.length >= 10) {
      console.warn(
        `[Monitor] Recurring issue detected: ${error.errorCode} (${recentSimilar.length} occurrences)`
      );

      // TODO: Send alert to dev team
    }
  }

  /**
   * Alert critical issue
   */
  private alertCriticalIssue(report: DiscrepancyReport): void {
    console.error(
      `[CRITICAL] Schema discrepancy detected:`,
      report
    );

    // TODO: Send to error tracking service (Sentry, etc.)
    // TODO: Send Slack/email notification
  }

  /**
   * Classify error type
   */
  private classifyError(error: ValidationError): ExportErrorLog["errorType"] {
    if (error.code.includes("UNKNOWN_NODE") || error.code.includes("UNKNOWN_MARK")) {
      return "unknown_node";
    }

    if (error.code.includes("INVALID") || error.code.includes("MISSING")) {
      return "validation";
    }

    if (error.code.includes("CONVERSION") || error.code.includes("EXPORT")) {
      return "conversion";
    }

    return "system";
  }

  /**
   * Classify discrepancy type
   */
  private classifyDiscrepancy(code: string): DiscrepancyReport["type"] {
    if (code.includes("SCHEMA") || code.includes("VERSION")) {
      return "schema_mismatch";
    }

    if (code.includes("UNKNOWN_NODE") || code.includes("UNKNOWN_MARK")) {
      return "unknown_node";
    }

    if (code.includes("MISSING_")) {
      return "missing_attribute";
    }

    return "invalid_structure";
  }

  /**
   * Generate actionable suggestion
   */
  private generateSuggestion(error: ValidationError): string {
    const suggestions: Record<string, string> = {
      UNKNOWN_NODE_TYPE: "Add this node type to schema-version.ts and implement converter serialization",
      UNKNOWN_MARK_TYPE: "Add this mark type to schema-version.ts and implement converter serialization",
      MISSING_REQUIRED_ATTRIBUTE: "Ensure extension populates all required attributes",
      INVALID_STRUCTURE: "Check TipTap extension implementation",
      SCHEMA_VERSION_MISMATCH: "Run migration or update schema version",
      CIRCULAR_REFERENCE: "Fix extension to avoid circular references",
    };

    return suggestions[error.code] || "Review error details and schema documentation";
  }
}

/**
 * Global error monitor instance
 */
export const errorMonitor = new ErrorMonitor();

/**
 * Helper function to log export errors
 */
export function logExportError(
  error: Error | unknown,
  context: {
    contentId: string;
    format: string;
    userId: string;
    schemaVersion: string;
  }
): void {
  errorMonitor.logError({
    contentId: context.contentId,
    format: context.format,
    userId: context.userId,
    schemaVersion: context.schemaVersion,
    errorType: "system",
    errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
    errorMessage: error instanceof Error ? error.message : String(error),
    stackTrace: error instanceof Error ? error.stack : undefined,
    context: {},
  });
}

/**
 * Helper to check system health
 */
export function checkExportHealth(): {
  healthy: boolean;
  issues: string[];
  stats: ReturnType<typeof errorMonitor.getStatistics>;
} {
  const stats = errorMonitor.getStatistics();
  const issues: string[] = [];

  // Check error rate
  if (stats.totalErrors > 100) {
    issues.push(`High error count: ${stats.totalErrors} errors logged`);
  }

  // Check for critical discrepancies
  const criticalDiscrepancies = stats.topDiscrepancies.filter(
    d => d.severity === "critical"
  );
  if (criticalDiscrepancies.length > 0) {
    issues.push(`${criticalDiscrepancies.length} critical discrepancies detected`);
  }

  // Check for recurring unknown nodes
  const unknownNodeErrors = stats.errorsByType["unknown_node"] || 0;
  if (unknownNodeErrors > 10) {
    issues.push(`${unknownNodeErrors} unknown node type errors (schema may be outdated)`);
  }

  return {
    healthy: issues.length === 0,
    issues,
    stats,
  };
}
