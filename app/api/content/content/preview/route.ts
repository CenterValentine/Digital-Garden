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

interface PreviewItem {
  id: string;
  title: string;
  contentType: ContentType;
  preview: string | null; // First header or text snippet
}

/**
 * Extract first heading from TipTap JSON content
 */
function extractFirstHeading(tiptapJson: any): string | null {
  if (!tiptapJson || typeof tiptapJson !== "object") return null;

  // DFS to find first heading node
  const findHeading = (node: any): string | null => {
    if (node.type === "heading" && node.content) {
      // Extract text from heading content
      const text = node.content
        .map((n: any) => n.text || "")
        .join("")
        .trim();
      return text || null;
    }

    // Check children
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        const result = findHeading(child);
        if (result) return result;
      }
    }

    return null;
  };

  return findHeading(tiptapJson);
}

/**
 * Extract first text snippet from TipTap JSON content (fallback for non-heading content)
 */
function extractFirstText(tiptapJson: any, maxWords: number = 10): string | null {
  if (!tiptapJson || typeof tiptapJson !== "object") return null;

  const texts: string[] = [];

  // DFS to collect all text nodes
  const collectText = (node: any) => {
    if (node.text) {
      texts.push(node.text);
    }

    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        collectText(child);
      }
    }
  };

  collectText(tiptapJson);

  // Join and limit to maxWords
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
  try {
    // Authentication
    const session = await requireAuth();

    // Parse request body
    const body = await request.json();
    const { contentIds } = body;

    if (!Array.isArray(contentIds) || contentIds.length === 0) {
      return NextResponse.json(
        { error: "contentIds must be a non-empty array" },
        { status: 400 }
      );
    }

    // Limit to prevent abuse
    if (contentIds.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 content IDs allowed" },
        { status: 400 }
      );
    }

    // Fetch content nodes with payloads
    const contents = await prisma.contentNode.findMany({
      where: {
        id: { in: contentIds },
        ownerId: session.user.id,
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        contentType: true,
        notePayload: {
          select: {
            tiptapJson: true,
          },
        },
        filePayload: {
          select: {
            fileName: true,
            mimeType: true,
          },
        },
        codePayload: {
          select: {
            code: true,
          },
        },
        htmlPayload: {
          select: {
            html: true,
            isTemplate: true,
          },
        },
      },
    });

    // Generate previews
    const previews: PreviewItem[] = contents.map((content) => {
      let preview: string | null = null;

      // Extract preview based on content type
      if (content.contentType === "note" && content.notePayload) {
        // For notes: try to extract first heading, fallback to first text
        const heading = extractFirstHeading(content.notePayload.tiptapJson);
        preview = heading || extractFirstText(content.notePayload.tiptapJson, 10);
      } else if (content.contentType === "code" && content.codePayload) {
        // For code: first line of code (up to 50 chars)
        const firstLine = content.codePayload.code.split("\n")[0];
        preview = firstLine.length > 50 ? firstLine.slice(0, 50) + "..." : firstLine;
      } else if (content.contentType === "html" && content.htmlPayload) {
        // For HTML: extract first text from HTML (strip tags)
        const stripped = content.htmlPayload.html.replace(/<[^>]*>/g, " ").trim();
        const words = stripped.split(/\s+/).slice(0, 10);
        preview = words.length > 0 ? words.join(" ") + (words.length >= 10 ? "..." : "") : null;
      } else if (content.contentType === "file" && content.filePayload) {
        // For files: show filename and mime type
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
    console.error("[API] Error fetching content previews:", error);
    return NextResponse.json(
      { error: "Failed to fetch content previews" },
      { status: 500 }
    );
  }
}
