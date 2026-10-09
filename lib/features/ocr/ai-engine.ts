/**
 * The "ai" OCR engine — the user's vision model reads the image.
 * OCR-PASTE-PLAN.md D13; guide: docs/notes-feature/guides/editor/OCR-PIPELINE.md.
 *
 * Opt-in (⌥⌘V / Ctrl+Alt+V), for what the on-device engine cannot do:
 * wrapped table cells, telling icons from text, handwriting, stylised fonts.
 * The image LEAVES the device — it goes to whichever provider the user routed
 * to "Read Text in Images (AI)" (Settings → AI → Feature Routing) — so every
 * caller must say so on first use (editor-ocr.ts).
 *
 * Returns markdown (tables as GFM tables); the editor's paste pipeline turns
 * it into blocks. Confidence is not reported by models: it is set to 100.
 */
import { makeCanvas } from "./preprocess";
import type { OcrEngine, OcrResult } from "./types";

/** Under the server's 4 MB cap and Vercel's 4.5 MB body limit, with headroom. */
const SEND_LIMIT_BYTES = 3_500_000;
/** Longest side when an image has to be shrunk to fit. Text stays legible. */
const MAX_SIDE = 2400;

/** Shrink an oversized image to a JPEG that fits in one request. */
async function fitForUpload(image: Blob): Promise<Blob> {
  if (image.size <= SEND_LIMIT_BYTES) return image;
  const bitmap = await createImageBitmap(image);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const surface = makeCanvas(width, height);
  if (!surface) return image;
  surface.ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return surface.toBlob("image/jpeg", 0.9);
}

async function recognize(image: Blob): Promise<OcrResult> {
  const body = new FormData();
  body.append("image", await fitForUpload(image), "image");
  const response = await fetch("/api/ai/image-text", { method: "POST", body, credentials: "include" });
  // One flat shape: this repo's tsconfig does not narrow discriminated unions.
  const data = (await response.json().catch(() => null)) as {
    success?: boolean;
    text?: string;
    model?: string;
    error?: string;
  } | null;
  if (!response.ok || !data?.success) {
    throw new Error(data?.error || `The AI read failed (HTTP ${response.status}).`);
  }
  return { text: data.text ?? "", confidence: 100, engine: "ai", model: data.model };
}

export const aiOcrEngine: OcrEngine = { id: "ai", recognize };
