/**
 * Outline Extraction Utility
 *
 * Extracts headings from TipTap JSON to create a table of contents.
 * Generates anchor IDs for navigation and scroll-to-heading functionality.
 *
 * M6: Search & Knowledge Features - Outline Panel
 */

import type { JSONContent } from "@tiptap/core";
import { createSlugAssigner } from "@/lib/domain/content/heading-ids";

export interface OutlineHeading {
  id: string; // Derived anchor slug (headings) or "accordion:"-prefixed key
  level: number; // 1-6 (H1-H6)
  text: string; // Heading text content
  position: number; // Node position in document (for scroll-to)
  kind?: "heading" | "accordion"; // source node type
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
  // Headings use the shared derived-slug sequence so outline ids equal the
  // anchors the editor/TOC/published page derive. Accordion entries live in a
  // prefixed namespace with their own sequence — they are panel-local keys,
  // never anchors, and must not perturb the heading slug sequence.
  const assignHeadingSlug = createSlugAssigner();
  const assignAccordionSlug = createSlugAssigner();
  const position = 0;

  /**
   * Recursively walk the document tree to find headings
   */
  function walkNode(node: JSONContent, currentPosition: number): number {
    let pos = currentPosition;

    // Check if this node is a heading
    if (node.type === "heading" && node.attrs?.level) {
      const level = node.attrs.level;
      const text = extractTextContent(node);
      const id = assignHeadingSlug(text);

      // Only add headings with text content (blank headings get no slug)
      if (id !== null) {
        headings.push({
          id,
          level,
          text: text.trim(),
          position: pos,
          kind: "heading",
        });
      }
    }

    // Check if this node is an accordion block (title lives in attrs, not content)
    if (node.type === "accordion" && node.attrs?.headerText) {
      const text = (node.attrs.headerText as string).trim();
      const level = parseInt((node.attrs.headerLevel as string) || "2", 10);
      const slug = assignAccordionSlug(text);
      if (slug !== null) {
        headings.push({
          id: `accordion:${slug}`,
          level,
          text,
          position: pos,
          kind: "accordion",
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
