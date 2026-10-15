/**
 * Shared OCR — read the text out of an image, locally, on demand.
 *
 * Pipeline: gesture (paste-modifier) → engine lifecycle + languages
 * (local-engine, languages) → preprocess + layout mode (preprocess) → reading
 * order (layout) → reflow (reflow) → editor blocks (to-content, editor-ocr).
 *
 * How to tune it, every threshold with its evidence, and how to measure a
 * change (`pnpm ocr:accuracy`): docs/notes-feature/guides/editor/OCR-PIPELINE.md
 * Decision record: docs/notes-feature/work-tracking/OCR-PASTE-PLAN.md (D1–D11)
 *
 * Client-only (the engine runs in a browser Web Worker). Importing this barrel
 * costs nothing at load: tesseract.js is a dynamic import inside the engine.
 */
import type { JSONContent } from "@tiptap/core";

import { markdownPasteToTiptap } from "@/lib/domain/content/markdown";

import { localOcrEngine } from "./local-engine";
import { aiOcrEngine } from "./ai-engine";
import { buildAiContent, buildOcrContent } from "./to-content";
import type { OcrEngine } from "./types";

export type { OcrEngine, OcrEngineId, OcrProgress, OcrResult } from "./types";
export { OCR_IDLE_MS, terminateLocalOcr } from "./local-engine";
export { reflowOcrText } from "./reflow";

/** Recognised text → TipTap blocks via the editor's own paste parser. Empty = no text. */
export function ocrTextToContent(raw: string): JSONContent[] {
  return buildOcrContent(raw, markdownPasteToTiptap);
}

/** AI-read markdown → TipTap blocks, without the Tesseract reflow. */
export function aiTextToContent(markdown: string): JSONContent[] {
  return buildAiContent(markdown, markdownPasteToTiptap);
}

/**
 * The engine to use. "local" (default) reads on the device; "ai" sends the
 * image to the user's routed vision model (⌥⌘V) — see ai-engine.ts.
 */
export function getOcrEngine(id: OcrEngine["id"] = "local"): OcrEngine {
  return id === "ai" ? aiOcrEngine : localOcrEngine;
}

/**
 * Can this runtime run the local engine? A browser with Web Workers and
 * WebAssembly. The chat engine sends this as `localOcrAvailable`, which gates
 * the AI's read_image_text tool server-side.
 */
export function isLocalOcrSupported(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined" && typeof WebAssembly === "object";
}
