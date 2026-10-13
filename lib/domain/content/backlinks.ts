import "server-only";

/**
 * Backlinks — what links to a node. Extracted from the backlinks route on
 * 2026-10-13 so the MCP server's `garden_read` (parts: ["backlinks"]) and
 * the route share ONE scanner instead of two copies drifting.
 */

import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";

export interface LinkMatch {
  linkText: string;
  href: string;
  context: string;
}

export interface Backlink {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  linkText: string;
  updatedAt: Date;
}

/**
 * Recursively search TipTap JSON for links to a specific note: wiki links
 * (by id first, then title/slug), Note Windows, and link marks whose href
 * names the target.
 */
export function findLinksInTipTap(
  node: JSONContent,
  targetSlug: string,
  targetId: string,
  targetTitle: string
): LinkMatch[] {
  const matches: LinkMatch[] = [];

  function extractText(n: JSONContent): string {
    if (n.type === "text") return n.text || "";
    if (n.content) return n.content.map(extractText).join("");
    return "";
  }

  function searchNode(n: JSONContent, parentContext: string = ""): void {
    if (n.type === "wikiLink" && n.attrs?.targetTitle) {
      const targetTitleAttr = n.attrs.targetTitle as string;
      const displayText = n.attrs.displayText as string | undefined;
      const isMatch =
        n.attrs.targetId === targetId ||
        targetTitleAttr.toLowerCase() === targetTitle.toLowerCase() ||
        targetTitleAttr.toLowerCase() === targetSlug.toLowerCase();
      if (isMatch) {
        const linkText = displayText ? `[[${targetTitleAttr}|${displayText}]]` : `[[${targetTitleAttr}]]`;
        matches.push({ linkText, href: targetSlug, context: parentContext.trim() || linkText });
      }
    }

    if (n.type === "noteWindow" && n.attrs?.targetContentId === targetId) {
      const label =
        typeof n.attrs.targetTitle === "string" && n.attrs.targetTitle ? n.attrs.targetTitle : targetTitle;
      matches.push({
        linkText: `Windowed: ${label}`,
        href: targetSlug,
        context: parentContext.trim() || `Windowed: ${label}`,
      });
    }

    if (n.type === "text" && n.marks) {
      const linkMark = n.marks.find((mark) => mark.type === "link");
      if (linkMark && linkMark.attrs?.href) {
        const href = linkMark.attrs.href as string;
        const isMatch =
          href.includes(targetSlug) || href.includes(targetId) || href === targetSlug || href === targetId;
        if (isMatch) {
          matches.push({ linkText: n.text || "", href, context: parentContext.trim() || n.text || "" });
        }
      }
    }

    if (n.content) {
      const nodeText = n.type === "paragraph" || n.type === "heading" ? extractText(n) : parentContext;
      n.content.forEach((child) => searchNode(child, nodeText));
    }
  }

  searchNode(node);
  return matches;
}

/**
 * Scan every note the owner has for links to the target. Returns the
 * backlinks newest first and the number of notes whose JSON failed to parse.
 */
export async function findBacklinks(
  ownerId: string,
  target: { id: string; slug: string; title: string }
): Promise<{ backlinks: Backlink[]; scanned: number; scanErrors: number }> {
  const allNotes = await prisma.contentNode.findMany({
    where: { ownerId, deletedAt: null, notePayload: { isNot: null } },
    include: { notePayload: { select: { tiptapJson: true } } },
  });
  const backlinks: Backlink[] = [];
  let scanErrors = 0;
  for (const note of allNotes) {
    try {
      if (note.id === target.id) continue;
      const tiptapJson = note.notePayload?.tiptapJson;
      if (!tiptapJson) continue;
      const content = typeof tiptapJson === "string" ? JSON.parse(tiptapJson) : tiptapJson;
      const found = findLinksInTipTap(content as JSONContent, target.slug, target.id, target.title);
      if (found.length > 0) {
        backlinks.push({
          id: note.id,
          title: note.title,
          slug: note.slug,
          excerpt: found[0].context,
          linkText: found[0].linkText,
          updatedAt: note.updatedAt,
        });
      }
    } catch {
      scanErrors += 1;
    }
  }
  backlinks.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return { backlinks, scanned: allNotes.length, scanErrors };
}
