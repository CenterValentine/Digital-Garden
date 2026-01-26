/**
 * Tag Extractor Utility
 *
 * Extracts #tag references from TipTap JSON content.
 * Supports position tracking for multi-occurrence tags.
 *
 * M6: Search & Knowledge Features - Tags
 */

import type { JSONContent } from "@tiptap/core";

export interface ExtractedTag {
  tagId?: string; // Tag ID from database (if tag node)
  name: string; // Original case-preserved name (e.g., "React")
  slug: string; // Lowercase slugified version (e.g., "react")
  color?: string | null; // Tag color (if tag node)
  positions: TagPosition[];
}

export interface TagPosition {
  offset: number; // Character offset in document
  context: string; // Surrounding text for jump-to-location
}

/**
 * Extract all tags from TipTap JSON content
 *
 * Rules:
 * - Tags start with # followed by alphanumeric (not hyphen/underscore)
 * - Space or newline required before # (prevents bob#tag)
 * - Tags in code blocks and inline code are excluded
 * - Tags in headings are excluded
 * - Case-insensitive deduplication (e.g., #React and #react → same tag)
 * - Multiple occurrences tracked with positions
 */
export function extractTags(tiptapJson: JSONContent): ExtractedTag[] {
  const tags = new Map<string, ExtractedTag>(); // Dedupe by slug
  let position = 0;

  /**
   * Recursively walk TipTap JSON tree
   */
  function walkNode(node: JSONContent, inCodeBlock = false, inHeading = false) {
    // Skip code blocks entirely (```code```)
    if (node.type === "codeBlock") {
      return;
    }

    // Mark if we're in a heading (tags not allowed in headings)
    if (node.type === "heading") {
      inHeading = true;
    }

    // Handle tag nodes (created by TipTap tag extension)
    if (node.type === "tag" && node.attrs) {
      const { tagId, tagName, slug: tagSlug, color } = node.attrs;

      if (tagName && tagSlug) {
        const tagPosition: TagPosition = {
          offset: position,
          context: `#${tagName}`,
        };

        // Add or update tag with position
        if (tags.has(tagSlug)) {
          const existing = tags.get(tagSlug)!;
          existing.positions.push(tagPosition);
          // Update tagId and color if not already set
          if (!existing.tagId && tagId) {
            existing.tagId = tagId;
          }
          if (!existing.color && color) {
            existing.color = color;
          }
        } else {
          tags.set(tagSlug, {
            tagId: tagId || undefined,
            name: tagName,
            slug: tagSlug,
            color: color || null,
            positions: [tagPosition],
          });
        }

        // Update position (tag renders as #tagname)
        position += tagName.length + 1; // +1 for the # character
      }
      return; // Don't process children of tag nodes
    }

    // Check if text node has inline code mark (`code`)
    const hasCodeMark = node.marks?.some((mark) => mark.type === "code") || false;

    // Extract from text content (not in code blocks, inline code, or headings)
    // This handles legacy #tag syntax in plain text
    if (node.type === "text" && node.text && !inCodeBlock && !inHeading && !hasCodeMark) {
      // Updated regex enforces:
      // - Space/newline before # (prevents bob#tag)
      // - First char after # must be alphanumeric (prevents #-tag, #_tag)
      // - 2-50 total characters
      const matches = node.text.matchAll(/(?:^|[\s\n])#([a-zA-Z0-9][a-zA-Z0-9_-]{1,49})\b/g);

      for (const match of matches) {
        const name = match[1];
        const slug = slugifyTag(name);
        const matchOffset = position + (match.index || 0);

        // Extract context (20 chars before and after)
        const contextStart = Math.max(0, matchOffset - 20);
        const contextEnd = Math.min(node.text.length, matchOffset + name.length + 21);
        const context = node.text.substring(contextStart, contextEnd).trim();

        const tagPosition: TagPosition = {
          offset: matchOffset,
          context: context.length > 50 ? context.substring(0, 47) + "..." : context,
        };

        // Add or update tag with position
        if (tags.has(slug)) {
          tags.get(slug)!.positions.push(tagPosition);
        } else {
          tags.set(slug, {
            name,
            slug,
            positions: [tagPosition],
          });
        }
      }

      position += node.text.length;
    }

    // Recurse into child nodes
    if (node.content) {
      for (const child of node.content) {
        walkNode(child, inCodeBlock, inHeading);
      }
    }
  }

  walkNode(tiptapJson);

  return Array.from(tags.values());
}

/**
 * Slugify tag name (lowercase, preserve hyphens/underscores)
 */
export function slugifyTag(name: string): string {
  return name.toLowerCase();
}

/**
 * Validate tag name format
 *
 * @returns null if valid, error message if invalid
 */
export function validateTagName(name: string): string | null {
  if (name.length < 2) {
    return "Tag must be at least 2 characters";
  }

  if (name.length > 50) {
    return "Tag must be at most 50 characters";
  }

  // First character must be alphanumeric
  if (!/^[a-zA-Z0-9]/.test(name)) {
    return "Tag must start with a letter or number";
  }

  // Rest can include hyphens and underscores
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) {
    return "Tag can only contain letters, numbers, hyphens, and underscores";
  }

  return null;
}
