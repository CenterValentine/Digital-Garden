/**
 * Bulk Vault Export API
 *
 * POST /api/content/export/vault
 * Export all notes (or filtered subset) as ZIP archive
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getUserSettings } from "@/lib/features/settings";
import { exportVault } from "@/lib/domain/export";
import type { ExportFormat, BulkExportFilters, ExportBackupSettings } from "@/lib/domain/export/types";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/export/vault";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      // Parse request body
      const body = await request.json();
      const format = (body.format || "markdown") as ExportFormat;
      const filters = (body.filters || {}) as BulkExportFilters;

      // Get user settings
      const settings = await withSpan(
        { layer: "content", name: "settings_read" },
        { summary: "user settings" },
        async () => getUserSettings(session.user.id),
      );

      if (!settings.exportBackup) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "SETTINGS_NOT_FOUND",
              message: "Export settings not configured",
            },
          },
          { status: 500 }
        );
      }

      const zipBuffer = await withSpan(
        { layer: "export", name: "vault" },
        { attrs: { format }, summary: `vault export (${format})` },
        async (span) => {
          // Note: previous template-string log of session.user.id removed —
          // identity stays in the auth:session span attrs, not in this layer.
          const result = await exportVault({
            userId: session.user.id,
            format,
            filters,
            settings: settings.exportBackup as ExportBackupSettings,
          });
          span
            .attr("bytes", result.length)
            .summary(`${format} ${result.length} bytes`);
          return result;
        },
      );

      // Return ZIP file
      const filename = `vault-export-${Date.now()}.zip`;

      // Response constructor requires Uint8Array, not Buffer
      const uint8Content = new Uint8Array(zipBuffer);

      return new Response(uint8Content, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": zipBuffer.length.toString(),
        },
      });
    } catch (error) {
      logger.error({
        layer: "export",
        event: "vault:caught",
        summary: "vault export failed — 500",
        error,
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVER_ERROR",
            message:
              error instanceof Error ? error.message : "Vault export failed",
          },
        },
        { status: 500 }
      );
    }
  });
}
