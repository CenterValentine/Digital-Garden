/**
 * Backlinks API - Find notes that link to a specific note
 *
 * GET /api/notes/backlinks/[id] - Get all notes linking to this note
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/middleware";
import type { JSONContent } from "@tiptap/core";

type Params = Promise<{ id: string }>;

interface Backlink {
  id: string;
  title: string;
  slug: string;
  excerpt: string; // Context around the link
  linkText: string; // The actual link text
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
// GET /api/notes/backlinks/[id] - Find Backlinks
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // First, get the target note to know what we're looking for
    const targetNote = await prisma.contentNode.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        slug: true,
        ownerId: true,
      },
    });

    if (!targetNote) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Note not found",
          },
        },
        { status: 404 }
      );
    }

    // Check ownership
    if (targetNote.ownerId !== session.user.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Access denied",
          },
        },
        { status: 403 }
      );
    }

    // Get all notes owned by this user (we'll search their content for links)
    const allNotes = await prisma.contentNode.findMany({
      where: {
        ownerId: session.user.id,
        deletedAt: null,
        notePayload: {
          isNot: null, // Only notes (not folders, files, etc.)
        },
      },
      include: {
        notePayload: {
          select: {
            tiptapJson: true,
          },
        },
      },
    });

    // Search each note's TipTap JSON for links to the target note
    const backlinks: Backlink[] = [];

    for (const note of allNotes) {
      try {
        // Skip the target note itself
        if (note.id === targetNote.id) continue;

        const tiptapJson = note.notePayload?.tiptapJson;
        if (!tiptapJson) continue;

        // Parse TipTap JSON and find links
        const content = typeof tiptapJson === 'string'
          ? JSON.parse(tiptapJson)
          : tiptapJson;

        const linksFound = findLinksInTipTap(
          content as JSONContent,
          targetNote.slug,
          targetNote.id,
          targetNote.title
        );

        // If this note contains links to the target, add it to backlinks
        if (linksFound.length > 0) {
          // Use the first link found for the excerpt
          const firstLink = linksFound[0];

          backlinks.push({
            id: note.id,
            title: note.title,
            slug: note.slug,
            excerpt: firstLink.context,
            linkText: firstLink.linkText,
            updatedAt: note.updatedAt,
          });
        }
      } catch (error) {
        console.error(`Error processing note ${note.id} (${note.title}):`, error);
        // Continue processing other notes even if one fails
        continue;
      }
    }

    // Sort by most recently updated
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
    console.error("Failed to fetch backlinks:", error);
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
}

// ============================================================
// Helper Functions
// ============================================================

interface LinkMatch {
  linkText: string;
  href: string;
  context: string; // Surrounding text for preview
}

/**
 * Recursively search TipTap JSON for links to a specific note
 *
 * @param node - TipTap JSONContent node
 * @param targetSlug - The slug of the note we're looking for links to
 * @param targetId - The ID of the note we're looking for links to
 * @param targetTitle - The title of the note we're looking for links to
 * @returns Array of link matches with context
 */
function findLinksInTipTap(
  node: JSONContent,
  targetSlug: string,
  targetId: string,
  targetTitle: string
): LinkMatch[] {
  const matches: LinkMatch[] = [];

  console.log('[findLinksInTipTap] Searching for links to:', { targetSlug, targetId, targetTitle });

  // Helper to extract text from a node and its children
  function extractText(n: JSONContent): string {
    if (n.type === 'text') {
      return n.text || '';
    }
    if (n.content) {
      return n.content.map(extractText).join('');
    }
    return '';
  }

  // Helper to check if a node contains a link to the target
  function searchNode(n: JSONContent, parentContext: string = ''): void {
    // Check if this is a wiki-link node [[Note Title]]
    if (n.type === 'wikiLink' && n.attrs?.targetTitle) {
      const targetTitleAttr = n.attrs.targetTitle;
      const displayText = n.attrs.displayText;

      console.log('[findLinksInTipTap] Found wiki-link node:', targetTitleAttr, 'comparing to:', targetTitle);

      // Check if the wiki link references our target note by title or slug
      const isMatch =
        targetTitleAttr.toLowerCase() === targetTitle.toLowerCase() ||
        targetTitleAttr.toLowerCase() === targetSlug.toLowerCase();

      if (isMatch) {
        console.log('[findLinksInTipTap] MATCH! Adding backlink');
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

    // Check if this is a text node with marks (for regular links)
    if (n.type === 'text' && n.marks) {
      // Check for regular link marks
      const linkMark = n.marks.find((mark) => mark.type === 'link');

      if (linkMark && linkMark.attrs?.href) {
        const href = linkMark.attrs.href;

        // Check if the link points to our target note
        // Links might be in formats like:
        // - /notes/slug
        // - /notes?content=id
        // - Just the slug
        // - Just the id
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

    // Recursively search children
    if (n.content) {
      // If this is a paragraph or similar container, extract its full text for context
      const nodeText = n.type === 'paragraph' || n.type === 'heading'
        ? extractText(n)
        : parentContext;

      n.content.forEach((child) => searchNode(child, nodeText));
    }
  }

  searchNode(node);
  return matches;
}
