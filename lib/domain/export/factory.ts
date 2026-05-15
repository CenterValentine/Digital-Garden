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
 * Uses dynamic `import()` per case to defer loading until the format is
 * actually requested. This preserves the original `require()`-based
 * lazy-load behavior (avoid pulling every converter into the bundle on
 * first call) while staying compatible with ESM/strict TypeScript.
 *
 * @param format - Target export format
 * @returns Document converter instance
 */
export async function getConverter(format: ExportFormat): Promise<DocumentConverter> {
  switch (format) {
    case "markdown": {
      const { MarkdownConverter } = await import("./converters/markdown");
      return new MarkdownConverter();
    }
    case "html": {
      const { HTMLConverter } = await import("./converters/html");
      return new HTMLConverter();
    }
    case "json": {
      const { JSONConverter } = await import("./converters/json");
      return new JSONConverter();
    }
    case "txt": {
      const { PlainTextConverter } = await import("./converters/plaintext");
      return new PlainTextConverter();
    }
    case "pdf": {
      const { PDFConverter } = await import("./converters/pdf");
      return new PDFConverter();
    }
    case "docx": {
      const { DOCXConverter } = await import("./converters/docx");
      return new DOCXConverter();
    }
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
    const converter = await getConverter(options.format);
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
