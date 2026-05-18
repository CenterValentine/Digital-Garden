import { NextRequest, NextResponse } from "next/server";
import { TiptapTransformer } from "@hocuspocus/transformer";
import type { JSONContent } from "@tiptap/core";
import * as Y from "yjs";

import { prisma } from "@/lib/database/client";
import type { ContentType } from "@/lib/database/generated/prisma";
import { resolveContentAccess } from "@/lib/domain/collaboration/access";
import { loadCollaborationYDocState } from "@/lib/domain/collaboration/documents";
import { getCollaborationDocumentName } from "@/lib/domain/collaboration/tokens";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";

export const runtime = "nodejs";

const ROUTE_PATH = "/api/collaboration/state";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
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

      const access = await withSpan(
        { layer: "collab", name: "resolve_access" },
        { attrs: { content_id: contentId } },
        async (span) => {
          const result = await resolveContentAccess(prisma, {
            contentId,
            userId: session.user.id,
            require: "view",
          });
          span.attr("read_only", result.readOnly);
          return result;
        },
      );

      const COLLABORATIVE_CONTENT_TYPES: ContentType[] = ["note", "visualization"];

      const content = await withSpan(
        { layer: "collab", name: "content_lookup" },
        { attrs: { content_id: contentId } },
        async (span) => {
          const result = await prisma.contentNode.findFirst({
            where: {
              id: contentId,
              contentType: { in: COLLABORATIVE_CONTENT_TYPES },
              deletedAt: null,
            },
            select: { id: true },
          });
          span.attr("found", Boolean(result));
          return result;
        },
      );

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

      const state = await withSpan(
        { layer: "collab", name: "load_ydoc_state" },
        { attrs: { content_id: contentId, document_name: documentName } },
        async (span) => {
          const loaded = await loadCollaborationYDocState(prisma, documentName);
          span.attr("has_update", Boolean(loaded));
          span.attr("update_bytes", loaded?.byteLength ?? 0);
          return loaded;
        },
      );

      // Forensic payload: decoded Y.Doc snapshot for cross-checking against
      // REST NotePayload. Bootstrap inconsistencies (e.g., canonical contains
      // a stale template overlaying real saved content) are diagnosed by
      // comparing this snapshot to the GET /api/content/content/[id]
      // `content_response` payload from the same trace.
      if (state) {
        await withSpan(
          { layer: "collab", name: "decode_canonical_snapshot" },
          { attrs: { content_id: contentId, update_bytes: state.byteLength } },
          async (span) => {
            try {
              const ydoc = new Y.Doc();
              Y.applyUpdate(ydoc, state);
              const snapshot = TiptapTransformer.fromYdoc(ydoc, "default") as JSONContent;
              const xmlLength = ydoc.getXmlFragment("default").length;
              span.attr("xml_fragment_length", xmlLength);
              await spanPayload(span, "canonical_tiptap_snapshot", snapshot);
              await spanPayload(span, "canonical_ydoc_update_b64", {
                bytes: state.byteLength,
                base64: Buffer.from(state).toString("base64"),
              });
            } catch (err) {
              span.attr("decode_failed", true);
              logger.warn({
                layer: "collab",
                event: "canonical_snapshot:decode_failed",
                summary: "failed to decode canonical Y.Doc for forensic payload",
                attrs: { content_id: contentId },
                error: err,
              });
            }
          },
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          documentName,
          readOnly: access.readOnly,
          update: state ? Buffer.from(state).toString("base64") : null,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load collaboration state";
      const status =
        message.includes("Access") || message.includes("required") ? 403 : 500;

      logger.error({
        layer: "collab",
        event: "collab:state:failed",
        summary: "collaboration state route error",
        attrs: { status },
        error,
      });

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
