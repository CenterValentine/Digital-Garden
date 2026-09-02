/**
 * Playbook import API (AI v3.2 T3, P5-import).
 *
 * POST /api/content/charters/import — paste a SKILL.md (or any registered
 * format) and get a marked playbook note. Body: { raw, parentId? }.
 * Detection + parsing is adapter-based (lib/domain/ai/charters/import); this
 * route only turns the parsed result into a note.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import {
  generateUniqueSlug,
  markdownToTiptap,
  extractSearchTextFromTipTap,
} from "@/lib/domain/content";
import { withCharterMetadata } from "@/lib/domain/ai/charters/registry";
import { importCharter } from "@/lib/domain/ai/charters/import";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/charters/import";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const body = await request.json();
      const raw = typeof body.raw === "string" ? body.raw : "";
      if (!raw.trim()) {
        return NextResponse.json(
          { success: false, error: { message: "raw content is required" } },
          { status: 400 },
        );
      }

      const result = importCharter(raw);
      if (!result) {
        return NextResponse.json(
          {
            success: false,
            error: {
              message:
                "Could not recognize this as an importable skill. Expected a SKILL.md with YAML frontmatter (a `name:` line) followed by a markdown body.",
            },
          },
          { status: 422 },
        );
      }
      const { adapter, parsed } = result;

      // Optional destination folder (validated to be the user's folder).
      let parentId: string | null = null;
      if (typeof body.parentId === "string") {
        const folder = await prisma.contentNode.findFirst({
          where: {
            id: body.parentId,
            ownerId: session.user.id,
            contentType: "folder",
            deletedAt: null,
          },
          select: { id: true },
        });
        parentId = folder?.id ?? null;
      }

      const tiptapJson = markdownToTiptap(parsed.bodyMarkdown);
      const searchText = extractSearchTextFromTipTap(tiptapJson);
      const slug = await generateUniqueSlug(parsed.name, session.user.id);

      const node = await prisma.contentNode.create({
        data: {
          ownerId: session.user.id,
          title: parsed.name,
          slug,
          contentType: "note",
          parentId,
          notePayload: {
            create: {
              tiptapJson: tiptapJson as unknown as Prisma.InputJsonValue,
              searchText,
              metadata: withCharterMetadata(
                null,
                parsed.description,
              ) as unknown as Prisma.InputJsonValue,
            },
          },
        },
        select: { id: true, title: true },
      });

      logger.info({
        layer: "ai",
        event: "playbooks_import:created",
        summary: `imported playbook "${parsed.name}" via ${adapter.id}`,
        attrs: { contentNodeId: node.id, adapter: adapter.id },
      });

      return NextResponse.json({
        success: true,
        data: { contentId: node.id, title: node.title, adapter: adapter.id },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json(
          { success: false, error: { message: "Unauthorized" } },
          { status: 401 },
        );
      }
      logger.error({
        layer: "ai",
        event: "playbooks_import:caught",
        summary: "failed to import playbook",
        error,
      });
      return NextResponse.json(
        { success: false, error: { message: "Failed to import playbook" } },
        { status: 500 },
      );
    }
  });
}
