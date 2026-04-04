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

    // Sprint 47: Convert input blocks to plain text values (strip chrome)
    const inputText = this.extractInputBlockText(node);
    if (inputText !== null) return inputText;

    let text = "";

    // Handle text nodes
    if (node.text) {
      text += node.text;
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
   * Extract plain text from input block nodes.
   * Returns null if not an input block.
   */
  private extractInputBlockText(node: JSONContent): string | null {
    const attrs = node.attrs;
    if (!attrs) return null;

    const label = attrs.label ? `${attrs.label}: ` : "";

    switch (node.type) {
      case "textInput":
        return attrs.value ? `${label}${attrs.value}\n` : "";
      case "numberInput":
        return `${label}${attrs.value ?? 0}${attrs.unit ? ` ${attrs.unit}` : ""}\n`;
      case "dateInput":
        return attrs.value ? `${label}${attrs.value}\n` : "";
      case "selectInput":
        if (attrs.allowMultiple && attrs.selectedValues?.length) {
          return `${label}${attrs.selectedValues.join(", ")}\n`;
        }
        return attrs.selectedValue ? `${label}${attrs.selectedValue}\n` : "";
      case "checkboxInput":
        if (attrs.groupMode && attrs.selectedValues?.length) {
          return `${label}${attrs.selectedValues.join(", ")}\n`;
        }
        return `${label}${attrs.checked ? "Yes" : "No"}\n`;
      case "ratingInput":
        return `${label}${attrs.value ?? 0}/${attrs.maxRating ?? 5}\n`;
      case "promptInput":
        return attrs.response ? `${label}${attrs.response}\n` : "";
      default:
        return null;
    }
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
    ];

    return blockTypes.includes(type || "");
  }
}
