/**
 * POST /api/content/content/[id]/append
 *
 * Append blocks to the END of a note's content, through the one
 * collaboration-safe writer (`writeNoteContent`): a note with a live
 * collaborative copy is written through its Y.Doc so an open editor sees
 * the blocks; a note nobody has opened gets its payload written directly.
 *
 * Body: `{ content: JSONContent, buffer?: boolean }` — `content` is a doc
 * whose top-level blocks are appended; `buffer` (default true) puts one
 * empty paragraph before them so the moved text starts on its own line,
 * unless the note is empty (then the blocks ARE the note).
 *
 * First caller: the editor's "Move to Note" (context menu). Any later
 * client-side append belongs here too, never a PATCH of the whole payload.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace } from "@/lib/core/logger";
import { markContextDirty } from "@/lib/domain/ai-context/context-dirty";
import { writeNoteContent, NoteEditRefused } from "@/lib/domain/content/write-note-content";
import { hasMeaningfulTipTapContent } from "@/lib/domain/collaboration/content-safety";
import { getServerExtensions } from "@/lib/domain/editor/extensions-server";
import { sanitizeTipTapJsonWithExtensions } from "@/lib/domain/editor/unsupported-content";

const ROUTE_PATH = "/api/content/content/[id]/append";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    const session = await requireAuth();
    const { id } = await params;

    let body: { content?: unknown; buffer?: unknown };
    try {
      body = (await request.json()) as { content?: unknown; buffer?: unknown };
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }
    const content = body.content as JSONContent | undefined;
    if (!content || typeof content !== "object" || !Array.isArray(content.content)) {
      return NextResponse.json(
        { success: false, error: "content must be a TipTap doc with a content array" },
        { status: 400 },
      );
    }
    const buffer = body.buffer !== false;

    const node = await prisma.contentNode.findFirst({
      where: { id, ownerId: session.user.id, deletedAt: null },
      select: { id: true, contentType: true, notePayload: { select: { tiptapJson: true } } },
    });
    if (!node) {
      return NextResponse.json({ success: false, error: "Content not found" }, { status: 404 });
    }
    if (!node.notePayload) {
      return NextResponse.json(
        { success: false, error: "This item has no note content to append to" },
        { status: 409 },
      );
    }

    // Unknown node types become placeholders rather than vanishing — the
    // same net the PATCH route uses.
    const sanitized = sanitizeTipTapJsonWithExtensions(content, getServerExtensions()).json;
    const blocks = Array.isArray(sanitized.content) ? sanitized.content : [];
    const current = (node.notePayload.tiptapJson ?? null) as JSONContent | null;
    const needsBuffer = buffer && current !== null && hasMeaningfulTipTapContent(current);
    const payload: JSONContent = {
      type: "doc",
      content: needsBuffer ? [{ type: "paragraph" }, ...blocks] : blocks,
    };

    try {
      const result = await writeNoteContent({
        contentId: id,
        ownerId: session.user.id,
        mode: "append",
        content: payload,
      });
      after(() => markContextDirty([id]));
      return NextResponse.json({
        success: true,
        data: {
          route: result.route,
          blocksAfter: result.blocksAfter,
          mayBeMaskedInOpenEditor: result.mayBeMaskedInOpenEditor,
        },
      });
    } catch (error) {
      if (error instanceof NoteEditRefused) {
        return NextResponse.json({ success: false, error: error.message }, { status: 409 });
      }
      logger.error({
        layer: "route",
        event: "content_append:failed",
        summary: "append to note failed",
        attrs: { content_id: id },
        error,
      });
      return NextResponse.json({ success: false, error: "Failed to append" }, { status: 500 });
    }
  });
}
