/**
 * Import System
 *
 * Markdown → TipTap JSON parser with optional .meta.json sidecar
 * enrichment for lossless export/import round-trips.
 */

// Parser
export { parseMarkdown } from "./markdown-parser";
export { parseInlineContent } from "./inline-parser";

// Sidecar
export { parseSidecar, enrichWithSidecar } from "./sidecar-reader";

// Import service
export { importFile, extractTitleFromJson } from "./import-service";
export type { ImportFileInput } from "./import-service";

// Round-trip verification
export { verifyRoundTrip } from "./round-trip-verify";

// Types
export type {
  ImportParseResult,
  ImportWarning,
  ImportResult,
  ParseOptions,
} from "./types";

export type {
  NodeDifference,
  DifferenceCategory,
  RoundTripReport,
} from "./round-trip-verify";
