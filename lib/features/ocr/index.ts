/**
 * Shared OCR — read the text out of an image, locally, on demand.
 * Plan: docs/notes-feature/work-tracking/OCR-PASTE-PLAN.md
 *
 * Client-only (the engine runs in a browser Web Worker). Importing this barrel
 * costs nothing at load: tesseract.js is a dynamic import inside the engine.
 */
import type { JSONContent } from "@tiptap/core";

import { markdownPasteToTiptap } from "@/lib/domain/content/markdown";

import { localOcrEngine } from "./local-engine";
import { buildOcrContent } from "./to-content";
import type { OcrEngine } from "./types";

export type { OcrEngine, OcrEngineId, OcrProgress, OcrResult } from "./types";
export { OCR_IDLE_MS, terminateLocalOcr } from "./local-engine";
export { reflowOcrText } from "./reflow";

/** Recognised text → TipTap blocks via the editor's own paste parser. Empty = no text. */
export function ocrTextToContent(raw: string): JSONContent[] {
  return buildOcrContent(raw, markdownPasteToTiptap);
}

/** The engine every caller uses. One member today; see types.ts. */
export function getOcrEngine(): OcrEngine {
  return localOcrEngine;
}

/**
 * Can this runtime run the local engine? A browser with Web Workers and
 * WebAssembly. The chat engine sends this as `localOcrAvailable`, which gates
 * the AI's read_image_text tool server-side.
 */
export function isLocalOcrSupported(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined" && typeof WebAssembly === "object";
}
