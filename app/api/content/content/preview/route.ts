/**
 * Content Preview API
 *
 * Batch fetch content previews for navigation history dropdown.
 * Returns: title, contentType, and first header/text snippet for each content ID.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import type { ContentType } from "@/lib/domain/content/types";
import type { JSONContent } from "@tiptap/core";
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/content/preview";

interface PreviewItem {
  id: string;
  title: string;
  contentType: ContentType;
  preview: string | null;
}

function extractFirstHeading(tiptapJson: unknown): string | null {
  if (!tiptapJson || typeof tiptapJson !== "object") return null;

  const findHeading = (node: JSONContent): string | null => {
    if (node.type === "heading" && node.content) {
      const text = node.content
        .map((n) => n.text || "")
        .join("")
        .trim();
      return text || null;
    }

    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        const result = findHeading(child);
        if (result) return result;
      }
    }

    return null;
  };

  return findHeading(tiptapJson as JSONContent);
}

function extractFirstText(tiptapJson: unknown, maxWords: number = 10): string | null {
  if (!tiptapJson || typeof tiptapJson !== "object") return null;

  const texts: string[] = [];

  const collectText = (node: JSONContent) => {
    if (node.text) {
      texts.push(node.text);
    }

    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        collectText(child);
      }
    }
  };

  collectText(tiptapJson as JSONContent);

  const fullText = texts.join(" ").trim();
  const words = fullText.split(/\s+/).slice(0, maxWords);
  return words.length > 0 ? words.join(" ") + (words.length >= maxWords ? "..." : "") : null;
}

/**
 * POST /api/content/content/preview
 * Body: { contentIds: string[] }
 * Returns: { previews: PreviewItem[] }
 */
export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const body = await request.json();
      const { contentIds } = body;

      if (!Array.isArray(contentIds) || contentIds.length === 0) {
        return NextResponse.json(
          { error: "contentIds must be a non-empty array" },
          { status: 400 }
        );
      }

      if (contentIds.length > 100) {
        return NextResponse.json(
          { error: "Maximum 100 content IDs allowed" },
          { status: 400 }
        );
      }

      const contents = await withSpan(
        { layer: "content", name: "preview_fetch" },
        { attrs: { requested: contentIds.length } },
        async (span) => {
          const result = await prisma.contentNode.findMany({
            where: {
              id: { in: contentIds },
              ownerId: session.user.id,
              deletedAt: null,
            },
            select: {
              id: true,
              title: true,
              contentType: true,
              notePayload: { select: { tiptapJson: true } },
              filePayload: { select: { fileName: true, mimeType: true } },
              codePayload: { select: { code: true } },
              htmlPayload: { select: { html: true, isTemplate: true } },
            },
          });
          span.attr("found", result.length).summary(`${result.length}/${contentIds.length} found`);
          await spanPayload(span, "preview_responses", result);
          return result;
        },
      );

      const previews: PreviewItem[] = contents.map((content) => {
        let preview: string | null = null;

        if (content.contentType === "note" && content.notePayload) {
          const heading = extractFirstHeading(content.notePayload.tiptapJson);
          preview = heading || extractFirstText(content.notePayload.tiptapJson, 10);
        } else if (content.contentType === "code" && content.codePayload) {
          const firstLine = content.codePayload.code.split("\n")[0];
          preview = firstLine.length > 50 ? firstLine.slice(0, 50) + "..." : firstLine;
        } else if (content.contentType === "html" && content.htmlPayload) {
          const stripped = content.htmlPayload.html.replace(/<[^>]*>/g, " ").trim();
          const words = stripped.split(/\s+/).slice(0, 10);
          preview = words.length > 0 ? words.join(" ") + (words.length >= 10 ? "..." : "") : null;
        } else if (content.contentType === "file" && content.filePayload) {
          preview = `${content.filePayload.fileName}`;
        }

        return {
          id: content.id,
          title: content.title,
          contentType: content.contentType as ContentType,
          preview,
        };
      });

      return NextResponse.json({ previews });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "preview_fetch:caught",
        summary: "preview fetch failed — 500",
        error,
      });
      return NextResponse.json(
        { error: "Failed to fetch content previews" },
        { status: 500 }
      );
    }
  });
}
