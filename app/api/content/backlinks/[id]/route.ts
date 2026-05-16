/**
 * Backlinks API - Find notes that link to a specific note
 *
 * GET /api/content/backlinks/[id] - Get all notes linking to this note
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import type { JSONContent } from "@tiptap/core";
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/backlinks/[id]";

type Params = Promise<{ id: string }>;

interface Backlink {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  linkText: string;
  updatedAt: Date;
}

interface BacklinksResponse {
  success: true;
  data: {
    targetId: string;
    targetTitle: string;
    backlinks: Backlink[];
    count: number;
  };
}

// ============================================================
// GET /api/content/backlinks/[id] - Find Backlinks
// ============================================================

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
          {
            success: false,
            error: { code: "NOT_FOUND", message: "Note not found" },
          },
          { status: 404 }
        );
      }

      if (targetNote.ownerId !== session.user.id) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "FORBIDDEN", message: "Access denied" },
          },
          { status: 403 }
        );
      }

      const allNotes = await withSpan(
        { layer: "content", name: "fetch_all_notes" },
        undefined,
        async (span) => {
          const result = await prisma.contentNode.findMany({
            where: {
              ownerId: session.user.id,
              deletedAt: null,
              notePayload: { isNot: null },
            },
            include: {
              notePayload: { select: { tiptapJson: true } },
            },
          });
          span.attr("notes", result.length).summary(`${result.length} notes to scan`);
          return result;
        },
      );

      const backlinks = await withSpan(
        { layer: "content", name: "backlinks_scan" },
        {
          attrs: { target_id: id, scanned: allNotes.length },
          summary: `scanning ${allNotes.length} notes`,
        },
        async (span) => {
          const results: Backlink[] = [];
          let scanErrors = 0;

          for (const note of allNotes) {
            try {
              if (note.id === targetNote.id) continue;

              const tiptapJson = note.notePayload?.tiptapJson;
              if (!tiptapJson) continue;

              const content = typeof tiptapJson === 'string'
                ? JSON.parse(tiptapJson)
                : tiptapJson;

              const linksFound = findLinksInTipTap(
                content as JSONContent,
                targetNote.slug,
                targetNote.id,
                targetNote.title
              );

              if (linksFound.length > 0) {
                const firstLink = linksFound[0];
                results.push({
                  id: note.id,
                  title: note.title,
                  slug: note.slug,
                  excerpt: firstLink.context,
                  linkText: firstLink.linkText,
                  updatedAt: note.updatedAt,
                });
              }
            } catch {
              scanErrors++;
              continue;
            }
          }

          span.attr("found", results.length).attr("scan_errors", scanErrors);
          span.summary(`${results.length} backlinks${scanErrors > 0 ? ` (${scanErrors} parse errors)` : ""}`);
          await spanPayload(span, "backlinks", results);

          if (scanErrors > 0) {
            logger.warn({
              layer: "content",
              event: "backlinks_scan:parse_errors",
              summary: `${scanErrors} notes failed to parse`,
              attrs: { errors: scanErrors, scanned: allNotes.length },
            });
          }
          return results;
        },
      );

      backlinks.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

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

// ============================================================
// Helper Functions
// ============================================================

interface LinkMatch {
  linkText: string;
  href: string;
  context: string;
}

/**
 * Recursively search TipTap JSON for links to a specific note.
 *
 * Per-node debug console.logs from the previous implementation were retired
 * — they fired O(nodes_per_note × all_notes) which saturated dev terminals.
 */
function findLinksInTipTap(
  node: JSONContent,
  targetSlug: string,
  targetId: string,
  targetTitle: string
): LinkMatch[] {
  const matches: LinkMatch[] = [];

  function extractText(n: JSONContent): string {
    if (n.type === 'text') {
      return n.text || '';
    }
    if (n.content) {
      return n.content.map(extractText).join('');
    }
    return '';
  }

  function searchNode(n: JSONContent, parentContext: string = ''): void {
    if (n.type === 'wikiLink' && n.attrs?.targetTitle) {
      const targetTitleAttr = n.attrs.targetTitle;
      const displayText = n.attrs.displayText;

      const isMatch =
        targetTitleAttr.toLowerCase() === targetTitle.toLowerCase() ||
        targetTitleAttr.toLowerCase() === targetSlug.toLowerCase();

      if (isMatch) {
        const linkText = displayText
          ? `[[${targetTitleAttr}|${displayText}]]`
          : `[[${targetTitleAttr}]]`;

        matches.push({
          linkText,
          href: targetSlug,
          context: parentContext.trim() || linkText,
        });
      }
    }

    if (n.type === 'text' && n.marks) {
      const linkMark = n.marks.find((mark) => mark.type === 'link');

      if (linkMark && linkMark.attrs?.href) {
        const href = linkMark.attrs.href;

        const isMatch =
          href.includes(targetSlug) ||
          href.includes(targetId) ||
          href === targetSlug ||
          href === targetId;

        if (isMatch) {
          matches.push({
            linkText: n.text || '',
            href,
            context: parentContext.trim() || n.text || '',
          });
        }
      }
    }

    if (n.content) {
      const nodeText = n.type === 'paragraph' || n.type === 'heading'
        ? extractText(n)
        : parentContext;

      n.content.forEach((child) => searchNode(child, nodeText));
    }
  }

  searchNode(node);
  return matches;
}
