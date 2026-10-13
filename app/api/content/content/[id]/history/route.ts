/**
 * Note history — the conversion backup's client seam and its reader.
 *
 * POST /api/content/content/[id]/history   { source: "source-view", tiptapJson }
 *   The source-view toggle runs client-side (the re-parsed document goes
 *   through the live editor or the normal save), so the only way to keep the
 *   pre-conversion document is for the client to hand it over first. Only
 *   that source is accepted here: server-side writers record through
 *   `recordNoteHistory` directly and never through HTTP.
 *
 * GET  /api/content/content/[id]/history
 *   The newest snapshots, for a restore affordance (not built yet).
 */

import { NextRequest, NextResponse } from "next/server";
import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace } from "@/lib/core/logger";
import { listNoteHistory, recordNoteHistory } from "@/lib/domain/content/note-history";

const ROUTE_PATH = "/api/content/content/[id]/history";

type Params = Promise<{ id: string }>;

async function ownedNote(id: string, ownerId: string): Promise<boolean> {
  const node = await prisma.contentNode.findFirst({
    where: { id, ownerId, deletedAt: null, contentType: "note" },
    select: { id: true },
  });
  return Boolean(node);
}

export async function POST(request: NextRequest, { params }: { params: Params }) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;
      if (!(await ownedNote(id, session.user.id))) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Note not found" } },
          { status: 404 }
        );
      }
      const body = (await request.json().catch(() => null)) as
        | { source?: unknown; tiptapJson?: unknown }
        | null;
      if (body?.source !== "source-view") {
        return NextResponse.json(
          {
            success: false,
            error: { code: "VALIDATION_ERROR", message: "source must be \"source-view\"" },
          },
          { status: 400 }
        );
      }
      if (!body.tiptapJson || typeof body.tiptapJson !== "object") {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "tiptapJson required" } },
          { status: 400 }
        );
      }
      const recorded = await recordNoteHistory({
        contentId: id,
        changedBy: session.user.id,
        snapshot: body.tiptapJson as JSONContent,
        source: "source-view",
        mode: "replace",
        route: "client",
      });
      return NextResponse.json({ success: true, data: { version: recorded?.version ?? null } });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "note_history:post_caught",
        summary: "history POST failed — 500",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "HISTORY_ERROR", message: "Could not record history" } },
        { status: 500 }
      );
    }
  });
}

export async function GET(request: NextRequest, { params }: { params: Params }) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const { id } = await params;
      if (!(await ownedNote(id, session.user.id))) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Note not found" } },
          { status: 404 }
        );
      }
      const items = await listNoteHistory(id);
      return NextResponse.json({ success: true, data: { items } });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "note_history:get_caught",
        summary: "history GET failed — 500",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "HISTORY_ERROR", message: "Could not read history" } },
        { status: 500 }
      );
    }
  });
}
