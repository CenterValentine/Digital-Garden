/**
 * Single Document Export API
 *
 * POST /api/content/export/[id]
 * Export a single document to specified format
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getUserSettings } from "@/lib/features/settings";
import { exportSingleDocument } from "@/lib/domain/export";
import type { ExportFormat } from "@/lib/domain/export/types";

type Params = Promise<{ id: string }>;

export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Parse request body
    const body = await request.json();
    const format = (body.format || "markdown") as ExportFormat;

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

    // Export document
    const result = await exportSingleDocument(id, session.user.id, {
      format,
      settings: settings.exportBackup as any,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "EXPORT_FAILED",
            message: "Failed to export document",
            details: result.metadata?.warnings,
          },
        },
        { status: 500 }
      );
    }

    // Return file (first file in result)
    const file = result.files[0];

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NO_FILE_GENERATED",
            message: "No file was generated",
          },
        },
        { status: 500 }
      );
    }

    // Convert to Buffer if string, then to Uint8Array for Response
    const buffer =
      typeof file.content === "string"
        ? Buffer.from(file.content, "utf-8")
        : file.content;

    // Response constructor requires Uint8Array, not Buffer
    const uint8Content = new Uint8Array(buffer);

    return new Response(uint8Content, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${file.name}"`,
        "Content-Length": file.size.toString(),
      },
    });
  } catch (error) {
    console.error("[Export] Single document export failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Export failed",
        },
      },
      { status: 500 }
    );
  }
}
