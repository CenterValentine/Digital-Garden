/**
 * Outline Extraction Utility
 *
 * Extracts headings from TipTap JSON to create a table of contents.
 * Generates anchor IDs for navigation and scroll-to-heading functionality.
 *
 * M6: Search & Knowledge Features - Outline Panel
 */

import type { JSONContent } from "@tiptap/core";

export interface OutlineHeading {
  id: string; // Auto-generated anchor ID
  level: number; // 1-6 (H1-H6)
  text: string; // Heading text content
  position: number; // Node position in document (for scroll-to)
}

/**
 * Generate a URL-safe anchor ID from heading text
 *
 * @param text - Heading text
 * @param existingIds - Set of already-used IDs (for uniqueness)
 * @returns URL-safe anchor ID
 */
function generateAnchorId(text: string, existingIds: Set<string>): string {
  // Convert to lowercase, replace spaces with hyphens, remove special chars
  let baseId = text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/[^\w-]/g, "") // Remove non-word chars except hyphens
    .replace(/--+/g, "-") // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens

  // If empty after sanitization, use a default
  if (!baseId) {
    baseId = "heading";
  }

  // Ensure uniqueness by appending numbers if needed
  let anchorId = baseId;
  let counter = 1;
  while (existingIds.has(anchorId)) {
    anchorId = `${baseId}-${counter}`;
    counter++;
  }

  existingIds.add(anchorId);
  return anchorId;
}

/**
 * Extract text content from a TipTap node and its children
 *
 * @param node - TipTap JSONContent node
 * @returns Plain text content
 */
function extractTextContent(node: JSONContent): string {
  if (node.type === "text") {
    return node.text || "";
  }

  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextContent).join("");
  }

  return "";
}

/**
 * Extract headings from TipTap JSON document
 *
 * Recursively walks the document tree and collects all heading nodes.
 * Generates unique anchor IDs for each heading for navigation purposes.
 *
 * @param tiptapJson - TipTap document JSON
 * @returns Array of outline headings with IDs, levels, text, and positions
 */
export function extractOutline(tiptapJson: JSONContent): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  const existingIds = new Set<string>();
  let position = 0;

  /**
   * Recursively walk the document tree to find headings
   */
  function walkNode(node: JSONContent, currentPosition: number): number {
    let pos = currentPosition;

    // Check if this node is a heading
    if (node.type === "heading" && node.attrs?.level) {
      const level = node.attrs.level;
      const text = extractTextContent(node);

      // Only add headings with text content
      if (text.trim()) {
        const id = generateAnchorId(text, existingIds);

        headings.push({
          id,
          level,
          text: text.trim(),
          position: pos,
        });
      }
    }

    // Recursively process children
    if (node.content && Array.isArray(node.content)) {
      for (const childNode of node.content) {
        pos = walkNode(childNode, pos);
      }
    }

    // Increment position for this node
    return pos + 1;
  }

  // Start walking from the root
  if (tiptapJson) {
    walkNode(tiptapJson, position);
  }

  return headings;
}

/**
 * Group headings into a hierarchical structure (optional utility)
 *
 * Useful for rendering nested outlines with proper indentation.
 * Not required for flat list rendering.
 *
 * @param headings - Flat array of headings
 * @returns Hierarchical structure (not implemented yet - can add if needed)
 */
export function buildHeadingHierarchy(headings: OutlineHeading[]) {
  // Future enhancement: convert flat list to nested structure
  // For now, we'll use indentation based on level in the UI
  return headings;
}
