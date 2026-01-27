/**
 * JSON Converter
 *
 * Lossless export of TipTap JSON content
 */

import type {
  DocumentConverter,
  ConversionOptions,
  ConversionResult,
} from "../types";
import type { JSONContent } from "@tiptap/core";

export class JSONConverter implements DocumentConverter {
  async convert(
    tiptapJson: JSONContent,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const startTime = performance.now();

    // Pretty-print TipTap JSON
    const jsonString = JSON.stringify(tiptapJson, null, 2);

    return {
      success: true,
      files: [
        {
          name: "document.json",
          content: jsonString,
          mimeType: "application/json",
          size: Buffer.byteLength(jsonString, "utf-8"),
        },
      ],
      metadata: {
        conversionTime: performance.now() - startTime,
        format: "json",
      },
    };
  }
}
