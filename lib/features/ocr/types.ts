/**
 * OCR engine contract. One implementation today ("local", Tesseract in a
 * browser worker). A vision-model engine ("ai") is the planned second member —
 * OCR-PASTE-PLAN.md §4 — and slots in here without touching any caller.
 */

export type OcrEngineId = "local" | "ai";

export interface OcrProgress {
  /** "loading" = fetching/compiling the engine or language data; "recognizing" = reading the image. */
  stage: "loading" | "recognizing";
  /** 0..1 within the current stage. */
  progress: number;
}

export interface OcrResult {
  /** Raw recognised text, one line per visual line. Run `reflowOcrText` before inserting. */
  text: string;
  /** Mean word confidence, 0..100. */
  confidence: number;
  /** Which layout mode produced the text (preprocess.ts decides). Local engine only. */
  layout?: "auto" | "sparse";
  /**
   * How the text was assembled from word positions (local engine): "table" —
   * rebuilt as a markdown table (table.ts); "rows" — reading order rebuilt
   * from a page Tesseract shredded into columns (layout.ts); "text" — as read.
   * Reported to the model so it knows what to double-check (D18).
   */
  structure?: "table" | "rows" | "text";
  /** Who read it, for the "ai" engine: "<connection> · <model>". */
  model?: string;
  engine: OcrEngineId;
}

export interface OcrEngine {
  id: OcrEngineId;
  recognize(image: Blob, opts?: { onProgress?: (p: OcrProgress) => void }): Promise<OcrResult>;
}
