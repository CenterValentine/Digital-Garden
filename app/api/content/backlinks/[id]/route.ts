/**
 * Backlinks API - Find notes that link to a specific note
 *
 * GET /api/content/backlinks/[id] - Get all notes linking to this note
 *
 * The scanner lives in `lib/domain/content/backlinks.ts` (extracted
 * 2026-10-13 so the MCP server's `garden_read` shares it).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";
import { findBacklinks, type Backlink } from "@/lib/domain/content/backlinks";

const ROUTE_PATH = "/api/content/backlinks/[id]";

type Params = Promise<{ id: string }>;

interface BacklinksResponse {
  success: true;
  data: {
    targetId: string;
    targetTitle: string;
    backlinks: Backlink[];
    count: number;
  };
}

export async function GET(
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

      const targetNote = await prisma.contentNode.findUnique({
        where: { id },
        select: { id: true, title: true, slug: true, ownerId: true },
      });

      if (!targetNote) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Note not found" } },
          { status: 404 }
        );
      }

      if (targetNote.ownerId !== session.user.id) {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "Access denied" } },
          { status: 403 }
        );
      }

      const backlinks = await withSpan(
        { layer: "content", name: "backlinks_scan" },
        { attrs: { target_id: id }, summary: "scanning notes" },
        async (span) => {
          const result = await findBacklinks(session.user.id, targetNote);
          span
            .attr("scanned", result.scanned)
            .attr("found", result.backlinks.length)
            .attr("scan_errors", result.scanErrors);
          span.summary(
            `${result.backlinks.length} backlinks${result.scanErrors > 0 ? ` (${result.scanErrors} parse errors)` : ""}`,
          );
          await spanPayload(span, "backlinks", result.backlinks);
          if (result.scanErrors > 0) {
            logger.warn({
              layer: "content",
              event: "backlinks_scan:parse_errors",
              summary: `${result.scanErrors} notes failed to parse`,
              attrs: { errors: result.scanErrors, scanned: result.scanned },
            });
          }
          return result.backlinks;
        },
      );

      const response: BacklinksResponse = {
        success: true,
        data: {
          targetId: targetNote.id,
          targetTitle: targetNote.title,
          backlinks,
          count: backlinks.length,
        },
      };

      return NextResponse.json(response);
    } catch (error) {
      logger.error({
        layer: "content",
        event: "backlinks_scan:caught",
        summary: "backlinks fetch failed — 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "Failed to fetch backlinks",
          },
        },
        { status: 500 }
      );
    }
  });
}
