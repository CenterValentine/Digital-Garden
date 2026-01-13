/**
 * TipTap Editor Extensions
 *
 * Central configuration for TipTap editor extensions.
 * Full implementation in M5 (Content Editors & Viewers).
 *
 * This placeholder allows M1 utilities to compile.
 */

import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";

/**
 * Get configured editor extensions
 *
 * Note: This is a minimal implementation for M1.
 * Full extension configuration happens in M5.
 *
 * @returns TipTap extensions array
 */
export function getEditorExtensions(): Extensions {
  return [
    StarterKit.configure({
      // Heading levels
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
      // Code block with language support
      codeBlock: {
        languageClassPrefix: "language-",
      },
    }),

    // Markdown support (bidirectional conversion)
    Markdown.configure({
      html: true, // Allow HTML in markdown
      tightLists: true,
      breaks: false,
    }),
  ];
}

/**
 * Get extensions for read-only display
 */
export function getViewerExtensions(): Extensions {
  return getEditorExtensions();
}

/**
 * Get extensions for markdown mode
 */
export function getMarkdownExtensions(): Extensions {
  return getEditorExtensions();
}
