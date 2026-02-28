/**
 * Import System Types
 *
 * Type definitions for the markdown import pipeline.
 * Used by the parser, sidecar reader, and import service.
 */

import type { JSONContent } from "@tiptap/core";

/** Result of parsing a markdown file into TipTap JSON */
export interface ImportParseResult {
  tiptapJson: JSONContent;
  warnings: ImportWarning[];
  stats: {
    blockCount: number;
    inlineNodeCount: number;
    parseTimeMs: number;
  };
}

/** Warning emitted during import (non-fatal) */
export interface ImportWarning {
  code: string;
  message: string;
  line?: number;
  suggestion?: string;
}

/** Result of a complete import operation (parse + create content) */
export interface ImportResult {
  success: boolean;
  contentId?: string;
  title: string;
  warnings: ImportWarning[];
  error?: string;
}

/** Options for the markdown parser */
export interface ParseOptions {
  /** Whether to parse semantic HTML comment wrappers (default: true) */
  parseSemantics: boolean;
  /** Whether to strip YAML frontmatter (default: true) */
  stripFrontmatter: boolean;
}

/** Default parse options */
export const DEFAULT_PARSE_OPTIONS: ParseOptions = {
  parseSemantics: true,
  stripFrontmatter: true,
};
