/**
 * Search Text Extraction
 *
 * Extracts plain text from various content payloads for full-text search.
 * Materialized as `searchText` column for efficient querying.
 */

import type { JSONContent } from "@tiptap/core";

// ============================================================
// TIPTAP JSON → PLAIN TEXT
// ============================================================

/**
 * Extract plain text from TipTap JSON for search indexing
 *
 * @param json - TipTap JSON content
 * @returns Plain text string (newlines preserved)
 */
export function extractSearchTextFromTipTap(json: JSONContent): string {
  if (!json) return "";

  let text = "";

  // Extract text from current node
  if (json.text) {
    text += json.text;
  }

  // Recursively extract from children
  if (json.content && Array.isArray(json.content)) {
    for (const child of json.content) {
      const childText = extractSearchTextFromTipTap(child);
      if (childText) {
        text += (text ? " " : "") + childText;
      }
    }
  }

  // Add newline after block elements
  if (isBlockElement(json.type)) {
    text += "\n";
  }

  return text;
}

/**
 * Check if node type is a block element (should add newline)
 */
function isBlockElement(type: string | undefined): boolean {
  if (!type) return false;

  const blockTypes = [
    "paragraph",
    "heading",
    "blockquote",
    "codeBlock",
    "bulletList",
    "orderedList",
    "listItem",
    "horizontalRule",
    "table",
    "tableRow",
  ];

  return blockTypes.includes(type);
}

// ============================================================
// HTML → PLAIN TEXT
// ============================================================

/**
 * Extract plain text from HTML for search indexing
 *
 * @param html - HTML string
 * @returns Plain text (tags stripped)
 */
export function extractSearchTextFromHtml(html: string): string {
  if (!html) return "";

  // Remove script and style tags entirely
  let text = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    ""
  );
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // Strip HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&nbsp;": " ",
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, "g"), char);
  }

  return decoded;
}

// ============================================================
// CODE → PLAIN TEXT
// ============================================================

/**
 * Extract plain text from code for search indexing
 *
 * @param code - Code string
 * @param language - Programming language (for context)
 * @returns Searchable text (code + language)
 */
export function extractSearchTextFromCode(
  code: string,
  language: string
): string {
  if (!code) return "";

  // Include language for search (e.g., "typescript", "python")
  const searchText = `${language} ${code}`;

  // Normalize whitespace (preserve code structure)
  return searchText.trim();
}

// ============================================================
// UNIFIED SEARCH TEXT EXTRACTION
// ============================================================

/**
 * Extract search text from any content payload
 */
export function extractSearchText(payload: {
  type: "note" | "html" | "code";
  content: JSONContent | string;
  language?: string;
}): string {
  switch (payload.type) {
    case "note":
      return extractSearchTextFromTipTap(payload.content as JSONContent);

    case "html":
      return extractSearchTextFromHtml(payload.content as string);

    case "code":
      return extractSearchTextFromCode(
        payload.content as string,
        payload.language || "text"
      );

    default:
      return "";
  }
}

// ============================================================
// SEARCH TEXT TRUNCATION
// ============================================================

/**
 * Truncate search text for preview snippets
 *
 * @param text - Full search text
 * @param maxLength - Maximum length (default: 200)
 * @returns Truncated text with ellipsis
 */
export function truncateSearchText(
  text: string,
  maxLength: number = 200
): string {
  if (!text || text.length <= maxLength) return text;

  // Try to truncate at word boundary
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > maxLength * 0.8) {
    return truncated.slice(0, lastSpace) + "…";
  }

  return truncated + "…";
}

// ============================================================
// SEARCH TEXT HIGHLIGHTING
// ============================================================

/**
 * Highlight search terms in text
 *
 * @param text - Text to highlight
 * @param query - Search query
 * @returns Text with <mark> tags around matches
 */
export function highlightSearchText(text: string, query: string): string {
  if (!text || !query) return text;

  // Escape special regex characters
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Create case-insensitive regex
  const regex = new RegExp(`(${escaped})`, "gi");

  // Replace matches with <mark> tags
  return text.replace(regex, "<mark>$1</mark>");
}
