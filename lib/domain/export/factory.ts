/**
 * Converter Factory
 *
 * Factory pattern for document format converters
 */

import type {
  ExportFormat,
  DocumentConverter,
  ConversionOptions,
  ConversionResult,
} from "./types";
import type { JSONContent } from "@tiptap/core";

/**
 * Get converter for specified format
 *
 * @param format - Target export format
 * @returns Document converter instance
 */
export function getConverter(format: ExportFormat): DocumentConverter {
  switch (format) {
    case "markdown":
      // Lazy load to avoid circular dependencies
      const { MarkdownConverter } = require("./converters/markdown");
      return new MarkdownConverter();

    case "html":
      const { HTMLConverter } = require("./converters/html");
      return new HTMLConverter();

    case "json":
      const { JSONConverter } = require("./converters/json");
      return new JSONConverter();

    case "txt":
      const { PlainTextConverter } = require("./converters/plaintext");
      return new PlainTextConverter();

    case "pdf":
      const { PDFConverter } = require("./converters/pdf");
      return new PDFConverter();

    case "docx":
      const { DOCXConverter } = require("./converters/docx");
      return new DOCXConverter();

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

/**
 * Convert document to specified format
 *
 * @param tiptapJson - TipTap JSON content
 * @param options - Conversion options
 * @returns Conversion result with generated files
 */
export async function convertDocument(
  tiptapJson: JSONContent,
  options: ConversionOptions
): Promise<ConversionResult> {
  try {
    const converter = getConverter(options.format);
    return await converter.convert(tiptapJson, options);
  } catch (error) {
    console.error(`[Export] Conversion failed for format ${options.format}:`, error);

    return {
      success: false,
      files: [],
      metadata: {
        conversionTime: 0,
        format: options.format,
        warnings: [
          error instanceof Error ? error.message : "Unknown conversion error",
        ],
      },
    };
  }
}
