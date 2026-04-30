/**
 * Plain Text Converter
 *
 * Extracts plain text content from TipTap JSON (no formatting)
 */

import type {
  DocumentConverter,
  ConversionOptions,
  ConversionResult,
} from "../types";
import type { JSONContent } from "@tiptap/core";
import { normalizeHabitTrackerAttrs } from "@/lib/domain/habit-tracker";
import { getHabitTrackerPlainText } from "@/lib/domain/editor/extensions/blocks/habit-tracker";
import { normalizeStopwatchAttrs } from "@/lib/domain/stopwatch";
import { getStopwatchPlainText } from "@/lib/domain/editor/extensions/blocks/stopwatch";

export class PlainTextConverter implements DocumentConverter {
  async convert(
    tiptapJson: JSONContent,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const startTime = performance.now();

    // Extract plain text recursively
    const text = this.extractPlainText(tiptapJson);

    return {
      success: true,
      files: [
        {
          name: "document.txt",
          content: text,
          mimeType: "text/plain",
          size: Buffer.byteLength(text, "utf-8"),
        },
      ],
      metadata: {
        conversionTime: performance.now() - startTime,
        format: "txt",
      },
    };
  }

  /**
   * Extract plain text from TipTap JSON (recursive)
   */
  private extractPlainText(node: JSONContent): string {
    if (!node) return "";

    let text = "";

    // Handle text nodes
    if (node.text) {
      text += node.text;
    }

    if (node.type === "habitTracker") {
      return `${getHabitTrackerPlainText(
        normalizeHabitTrackerAttrs((node.attrs || {}) as Record<string, unknown>)
      )}\n`;
    }

    if (node.type === "stopwatch") {
      return `${getStopwatchPlainText(
        normalizeStopwatchAttrs((node.attrs || {}) as Record<string, unknown>)
      )}\n`;
    }

    // Handle child nodes
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        text += this.extractPlainText(child);

        // Add line breaks after block-level elements
        if (this.isBlockElement(child.type)) {
          text += "\n";
        }
      }
    }

    // Add extra line break after headings and paragraphs
    if (node.type === "heading" || node.type === "paragraph") {
      text += "\n";
    }

    return text;
  }

  /**
   * Check if node type is block-level
   */
  private isBlockElement(type?: string): boolean {
    const blockTypes = [
      "paragraph",
      "heading",
      "codeBlock",
      "blockquote",
      "bulletList",
      "orderedList",
      "listItem",
      "horizontalRule",
      "table",
      "callout",
      "habitTracker",
      "stopwatch",
    ];

    return blockTypes.includes(type || "");
  }
}
