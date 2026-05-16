/**
 * Clear Google Drive Metadata API
 *
 * Clears the Google Drive file ID from storage metadata.
 * Used when the Drive file is deleted or inaccessible.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/infrastructure/auth/session";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/google-drive/clear-metadata";

interface ClearMetadataRequest {
  contentId: string;
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => getSession(),
      );

      if (!session) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }

      const body: ClearMetadataRequest = await request.json();
      const { contentId } = body;

      if (!contentId) {
        return NextResponse.json(
          { error: "Missing contentId" },
          { status: 400 }
        );
      }

      await withSpan(
        { layer: "external", name: "google_drive_metadata_clear" },
        { attrs: { content_id: contentId } },
        async (span) => {
          const filePayload = await prisma.filePayload.findUnique({
            where: { contentId },
            select: { storageMetadata: true },
          });

          if (!filePayload) {
            span.attr("status", "not_found").summary("file not found");
            return;
          }

          const metadata = filePayload.storageMetadata as { externalProviders?: { googleDrive?: unknown } } | null;
          if (metadata?.externalProviders?.googleDrive) {
            delete metadata.externalProviders.googleDrive;
            await prisma.filePayload.update({
              where: { contentId },
              data: { storageMetadata: metadata as unknown as Prisma.InputJsonValue },
            });
            span.summary("metadata cleared");
          } else {
            span.attr("status", "no_metadata").summary("nothing to clear");
          }
        },
      );

      return NextResponse.json({
        success: true,
        message: "Google Drive metadata cleared",
      });
    } catch (error) {
      logger.error({
        layer: "external",
        event: "google_drive_metadata_clear:caught",
        summary: "clear failed — 500",
        error,
      });
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Failed to clear metadata",
        },
        { status: 500 }
      );
    }
  });
}
