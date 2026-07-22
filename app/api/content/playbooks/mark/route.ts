/**
 * Mark-as-playbook action (AI v3.2 T3).
 *
 * POST /api/content/playbooks/mark — hand-authoring path (primary use
 * case): flag an existing note as a playbook via NotePayload.metadata.
 * The note's `##` sections are already phases (see lib/domain/ai/playbooks
 * /parse.ts); this just marks it discoverable in the /playbook picker.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { withPlaybookMetadata } from "@/lib/domain/ai/playbooks/registry";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/playbooks/mark";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const body = await request.json();
      const contentId = typeof body.contentId === "string" ? body.contentId : null;
      const description =
        typeof body.description === "string" ? body.description.trim() : "";
      if (!contentId) {
        return NextResponse.json(
          { success: false, error: { message: "contentId is required" } },
          { status: 400 },
        );
      }

      const node = await prisma.contentNode.findFirst({
        where: {
          id: contentId,
          ownerId: session.user.id,
          contentType: "note",
          deletedAt: null,
        },
        select: { id: true, notePayload: { select: { metadata: true } } },
      });
      if (!node) {
        return NextResponse.json(
          { success: false, error: { message: "Note not found" } },
          { status: 404 },
        );
      }

      const metadata = withPlaybookMetadata(
        (node.notePayload?.metadata as Record<string, unknown> | null) ?? null,
        description,
      );
      await prisma.notePayload.update({
        where: { contentId: node.id },
        data: { metadata: metadata as unknown as Prisma.InputJsonValue },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json(
          { success: false, error: { message: "Unauthorized" } },
          { status: 401 },
        );
      }
      logger.error({
        layer: "ai",
        event: "playbooks_mark:caught",
        summary: "failed to mark note as playbook",
        error,
      });
      return NextResponse.json(
        { success: false, error: { message: "Failed to mark as playbook" } },
        { status: 500 },
      );
    }
  });
}
