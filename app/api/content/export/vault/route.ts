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
import type { ExportFormat, BulkExportFilters } from "@/lib/domain/export/types";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Parse request body
    const body = await request.json();
    const format = (body.format || "markdown") as ExportFormat;
    const filters = (body.filters || {}) as BulkExportFilters;

    // Get user settings
    const settings = await getUserSettings(session.user.id);

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

    console.log(`[Export] Starting vault export for user ${session.user.id}, format: ${format}`);

    // Export vault
    const zipBuffer = await exportVault({
      userId: session.user.id,
      format,
      filters,
      settings: settings.exportBackup as any,
    });

    console.log(`[Export] Vault export complete, size: ${zipBuffer.length} bytes`);

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
    console.error("[Export] Vault export failed:", error);

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
}
