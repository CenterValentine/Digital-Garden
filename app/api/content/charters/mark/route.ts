/**
 * Mark-as-playbook action (AI v3.2 T3).
 *
 * POST /api/content/charters/mark — hand-authoring path (primary use
 * case): flag an existing note OR folder as a playbook via
 * NotePayload.metadata (folders can carry a notePayload too — the folder
 * "Notes" editor). The `##` sections are already phases (see
 * lib/domain/ai/charters/parse.ts); this just marks it discoverable in
 * the /playbook picker.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import {
  isCharterMetadata,
  stripCharterMetadata,
  withCharterMetadata,
} from "@/lib/domain/ai/charters/registry";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/charters/mark";

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
          contentType: { in: ["note", "folder"] },
          deletedAt: null,
        },
        select: { id: true, notePayload: { select: { metadata: true } } },
      });
      if (!node) {
        return NextResponse.json(
          { success: false, error: { message: "Note or folder not found" } },
          { status: 404 },
        );
      }

      const metadata = withCharterMetadata(
        (node.notePayload?.metadata as Record<string, unknown> | null) ?? null,
        description,
      );
      // upsert, not update — a folder's notePayload is created lazily by its
      // Notes editor on first edit, so a freshly-created folder with content
      // already typed may not have a row yet even though notePayload.metadata
      // above read null via the optional relation.
      await prisma.notePayload.upsert({
        where: { contentId: node.id },
        update: { metadata: metadata as unknown as Prisma.InputJsonValue },
        create: {
          contentId: node.id,
          tiptapJson: { type: "doc", content: [] } as unknown as Prisma.InputJsonValue,
          searchText: "",
          metadata: metadata as unknown as Prisma.InputJsonValue,
        },
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

/**
 * DELETE /api/content/charters/mark?contentId=… — the "unmark" path.
 * Strips the playbook markers from NotePayload.metadata while preserving any
 * other metadata. Idempotent: unmarking something that isn't a playbook (or has
 * no payload row) succeeds with `wasPlaybook: false` rather than erroring.
 */
export async function DELETE(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const contentId = request.nextUrl.searchParams.get("contentId");
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
          contentType: { in: ["note", "folder"] },
          deletedAt: null,
        },
        select: { id: true, notePayload: { select: { metadata: true } } },
      });
      if (!node) {
        return NextResponse.json(
          { success: false, error: { message: "Note or folder not found" } },
          { status: 404 },
        );
      }

      const metadata =
        (node.notePayload?.metadata as Record<string, unknown> | null) ?? null;
      // Nothing to strip — no payload row, or not actually marked. Idempotent success.
      if (!node.notePayload || !isCharterMetadata(metadata)) {
        return NextResponse.json({ success: true, wasPlaybook: false });
      }

      await prisma.notePayload.update({
        where: { contentId: node.id },
        data: {
          metadata: stripCharterMetadata(metadata) as unknown as Prisma.InputJsonValue,
        },
      });

      return NextResponse.json({ success: true, wasPlaybook: true });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json(
          { success: false, error: { message: "Unauthorized" } },
          { status: 401 },
        );
      }
      logger.error({
        layer: "ai",
        event: "playbooks_unmark:caught",
        summary: "failed to unmark playbook",
        error,
      });
      return NextResponse.json(
        { success: false, error: { message: "Failed to unmark playbook" } },
        { status: 500 },
      );
    }
  });
}
