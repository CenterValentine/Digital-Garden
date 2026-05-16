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
import type { ExportFormat, ExportBackupSettings } from "@/lib/domain/export/types";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/export/[id]";

type Params = Promise<{ id: string }>;

export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await params;

      const body = await request.json();
      const format = (body.format || "markdown") as ExportFormat;

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

      const result = await withSpan(
        { layer: "export", name: "single_document" },
        {
          attrs: { content_id: id, format },
          summary: `${format}`,
        },
        async (span) => {
          const r = await exportSingleDocument(id, session.user.id, {
            format,
            settings: settings.exportBackup as ExportBackupSettings,
          });
          span.attr("files", r.files?.length ?? 0).attr("ok", r.success);
          return r;
        },
      );

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

      const buffer =
        typeof file.content === "string"
          ? Buffer.from(file.content, "utf-8")
          : file.content;

      const uint8Content = new Uint8Array(buffer);

      return new Response(uint8Content, {
        headers: {
          "Content-Type": file.mimeType,
          "Content-Disposition": `attachment; filename="${file.name}"`,
          "Content-Length": file.size.toString(),
        },
      });
    } catch (error) {
      logger.error({
        layer: "export",
        event: "single_document:caught",
        summary: "export failed — 500",
        error,
      });

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
  });
}
