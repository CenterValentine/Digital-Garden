/**
 * ONLYOFFICE Callback API
 *
 * This endpoint receives callbacks from ONLYOFFICE Document Server
 * when a document is saved or edited.
 *
 * Callback Status Codes:
 * - 0: Document not found
 * - 1: Document is being edited
 * - 2: Document is ready for saving (user closed editor)
 * - 3: Document saving error
 * - 4: Document closed with no changes
 * - 6: Document is being edited, but current document state is saved
 * - 7: Error occurred during force save
 *
 * Flow:
 * 1. ONLYOFFICE calls this endpoint with status=2 or status=6
 * 2. We download the updated document from ONLYOFFICE's URL
 * 3. We upload it to our storage (R2/S3)
 * 4. We update the database with new file metadata
 * 5. We return success response to ONLYOFFICE
 *
 * Note: this is a webhook from an external service — no session auth on
 * incoming requests. The trace is rooted by withRouteTrace as a normal
 * route:request span.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/onlyoffice/callback";

interface OnlyOfficeCallback {
  key: string;
  status: number;
  url?: string;
  filetype?: string;
  forcesavetype?: number;
  users?: string[];
  actions?: unknown[];
  changesurl?: string;
  history?: unknown;
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const data: OnlyOfficeCallback = await request.json();

      const { searchParams } = new URL(request.url);
      const contentId = searchParams.get("contentId");

      logger.info({
        layer: "external",
        event: "onlyoffice:received",
        summary: `status=${data.status} key=${data.key}`,
        attrs: { status: data.status, has_url: Boolean(data.url) },
      });

      if (!contentId) {
        logger.warn({
          layer: "external",
          event: "onlyoffice:missing_content_id",
          summary: "callback missing contentId",
        });
        return NextResponse.json(
          { error: "Missing contentId parameter" },
          { status: 400 }
        );
      }

      // Status 1: Document is being edited (no action needed)
      if (data.status === 1) {
        logger.info({
          layer: "external",
          event: "onlyoffice:edit_in_progress",
          summary: "ack",
        });
        return NextResponse.json({ error: 0 });
      }

      // Status 4: Document closed with no changes (no action needed)
      if (data.status === 4) {
        logger.info({
          layer: "external",
          event: "onlyoffice:closed_no_changes",
          summary: "ack",
        });
        return NextResponse.json({ error: 0 });
      }

      // Status 2 or 6: Document ready for saving
      if (data.status === 2 || data.status === 6) {
        if (!data.url) {
          logger.warn({
            layer: "external",
            event: "onlyoffice:missing_document_url",
            summary: "save callback without URL",
            attrs: { status: data.status },
          });
          return NextResponse.json(
            { error: "Missing document URL" },
            { status: 400 }
          );
        }

        // Verify content exists and is a file
        const content = await withSpan(
          { layer: "content", name: "payload" },
          { attrs: { content_id: contentId } },
          async (span) => {
            const result = await prisma.contentNode.findUnique({
              where: { id: contentId },
              include: { filePayload: true },
            });
            if (!result) {
              span.attr("found", false).summary("not found");
            } else if (!result.filePayload) {
              span.attr("not_a_file", true).summary("not a file");
            } else {
              span.attr("kind", "file").summary("file ok");
            }
            return result;
          },
        );

        if (!content) {
          return NextResponse.json(
            { error: "Content not found" },
            { status: 404 }
          );
        }

        if (!content.filePayload) {
          return NextResponse.json(
            { error: "Not a file" },
            { status: 400 }
          );
        }

        try {
          // 1. Download the updated document from ONLYOFFICE
          const buffer = await withSpan(
            { layer: "external", name: "onlyoffice_download" },
            { attrs: { content_id: contentId } },
            async (span) => {
              const response = await fetch(data.url!);
              if (!response.ok) {
                throw new Error(`Failed to download document: ${response.status}`);
              }
              const arrayBuffer = await response.arrayBuffer();
              const buf = Buffer.from(arrayBuffer);
              span
                .attr("bytes", buf.length)
                .attr("original_bytes", Number(content.filePayload!.fileSize))
                .summary(`${buf.length} bytes`);
              return buf;
            },
          );

          // 2. Upload to our storage (R2/S3)
          // TODO: Implement storage upload (left from original — not in this phase's scope)
          // For now, we'll use the simple upload endpoint as a reference
          // In production, you'd directly upload to R2 using the storage SDK

          // 3. Update database with new metadata
          await withSpan(
            { layer: "content", name: "file_payload_update" },
            { attrs: { content_id: contentId, bytes: buffer.length } },
            async (span) => {
              await prisma.filePayload.update({
                where: { contentId },
                data: {
                  fileSize: BigInt(buffer.length),
                  uploadStatus: "ready",
                },
              });
              await prisma.contentNode.update({
                where: { id: contentId },
                data: { updatedAt: new Date() },
              });
              span.summary("file payload + content node updated");
            },
          );

          return NextResponse.json({ error: 0 });
        } catch (error) {
          logger.error({
            layer: "external",
            event: "onlyoffice:save_failed",
            summary: "failed to persist save",
            error,
          });
          return NextResponse.json(
            { error: "Failed to save document" },
            { status: 500 }
          );
        }
      }

      // Status 3 or 7: Error occurred
      if (data.status === 3 || data.status === 7) {
        logger.warn({
          layer: "external",
          event: "onlyoffice:error_status",
          summary: `error status ${data.status}`,
          attrs: { status: data.status },
        });
        return NextResponse.json(
          { error: "Document error" },
          { status: 500 }
        );
      }

      // Unknown status
      logger.warn({
        layer: "external",
        event: "onlyoffice:unknown_status",
        summary: `status ${data.status}`,
        attrs: { status: data.status },
      });
      return NextResponse.json({ error: 0 });
    } catch (error) {
      logger.error({
        layer: "external",
        event: "onlyoffice:caught",
        summary: "unexpected error — 500",
        error,
      });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  });
}

// ONLYOFFICE may send GET requests to verify the callback URL
export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH, method: "GET" }, async () => {
    return NextResponse.json({
      status: "ok",
      message: "ONLYOFFICE callback endpoint is active",
    });
  });
}
