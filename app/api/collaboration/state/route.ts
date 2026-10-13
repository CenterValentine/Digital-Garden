import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import type { ContentType } from "@/lib/database/generated/prisma";
import { resolveContentAccess } from "@/lib/domain/collaboration/access";
import { loadCollaborationYDocState } from "@/lib/domain/collaboration/documents";
import { getCollaborationDocumentName } from "@/lib/domain/collaboration/tokens";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";

export const runtime = "nodejs";

/**
 * The canonical Y state a browser compares its cached copy with on open
 * (D17 catch-up) or seeds from when it has none. Traced like the presence
 * route: whether a tab asked for it, and what it got, is the first thing to
 * know when a tab shows stale text after a refresh (2026-10-13).
 */
export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: "/api/collaboration/state" }, async () => {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as { contentId?: string };
    const contentId = body.contentId?.trim();

    if (!contentId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "contentId is required" },
        },
        { status: 400 }
      );
    }

    const access = await resolveContentAccess(prisma, {
      contentId,
      userId: session.user.id,
      require: "view",
    });

    const COLLABORATIVE_CONTENT_TYPES: ContentType[] = ["note", "visualization"];

    const content = await prisma.contentNode.findFirst({
      where: {
        id: contentId,
        contentType: { in: COLLABORATIVE_CONTENT_TYPES },
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!content) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNSUPPORTED_CONTENT",
            message: "This content type does not support real-time collaboration",
          },
        },
        { status: 400 }
      );
    }

    const documentName = getCollaborationDocumentName(contentId);
    const state = await loadCollaborationYDocState(prisma, documentName);
    // When the stored note last changed — a browser opening its cached copy
    // compares this with its own last edit to tell a stale copy from a newer
    // one (lineage.ts planLocalCatchUp, AI-VIEW-SCREEN-PLAN D17).
    const payload = await prisma.notePayload.findUnique({
      where: { contentId },
      select: { updatedAt: true },
    });
    const document = await prisma.collaborationDocument.findUnique({
      where: { contentId },
      select: { updatedAt: true },
    });

    logger.info({
      layer: "collab",
      event: "state:served",
      summary: `${contentId} ${state ? `${state.byteLength} bytes` : "no stored state"}`,
      attrs: {
        content_id: contentId,
        bytes: state ? state.byteLength : 0,
        document_updated_at: document?.updatedAt.toISOString() ?? null,
        payload_updated_at: payload?.updatedAt.toISOString() ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        documentName,
        readOnly: access.readOnly,
        update: state ? Buffer.from(state).toString("base64") : null,
        payloadUpdatedAt: payload?.updatedAt.toISOString() ?? null,
        // The stored document's stamp (ms): the baseline a tab records when it
        // takes this state, so the presence poll's stamp can tell it later
        // that the document moved on without it.
        documentStampMs: document?.updatedAt.getTime() ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load collaboration state";
    const status = message.includes("Access") || message.includes("required") ? 403 : 500;
    logger.warn({ layer: "collab", event: "state:failed", summary: message, error });

    return NextResponse.json(
      {
        success: false,
        error: {
          code: status === 403 ? "FORBIDDEN" : "SERVER_ERROR",
          message,
        },
      },
      { status }
    );
  }
  });
}
