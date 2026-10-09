/**
 * How an image is prepared, and how its layout mode is chosen.
 * OCR-PASTE-PLAN.md D9 (owner smoke 2026-10-08: a white-on-blue chat bubble
 * read as nothing; a dark UI list read as icon noise and run-together labels).
 *
 * Three decisions, each a named threshold measured on the owner's screenshots
 * (six images; mean character error 15.1% → 6.2%):
 *
 *  1. INVERT when the median luminance is dark — Tesseract reads dark text on
 *     a light page; light-on-dark text was the whole bubble miss (25% → 0%).
 *  2. UPSCALE narrow images toward TARGET_WIDTH (at most MAX_SCALE×) — small UI
 *     text gains the most.
 *  3. LAYOUT: read in Tesseract's normal mode (PSM 3, blocks and paragraphs);
 *     if its mean confidence is below SPARSE_PASS_BELOW, re-read in sparse
 *     mode (PSM 11, scattered snippets) and keep the more confident read.
 *     Prose scored 92–95 and stays on one pass; the UI list scored 72, got
 *     the second pass (80), and its error fell 31% → 14%.
 *
 * The decision functions are pure and pinned by `pnpm ocr:blocks:check`; the
 * canvas half (`preprocessForOcr`) runs in the browser only.
 */

/** Median luminance below this (0–255) = a dark background → invert. */
export const DARK_BACKGROUND_BELOW = 128;
/** Narrow images are scaled toward this width. */
export const TARGET_WIDTH = 1600;
export const MAX_SCALE = 3;
/** First-pass mean confidence (0–100) below this earns a sparse-mode pass. */
export const SPARSE_PASS_BELOW = 85;

/**
 * The best read's mean confidence below this = the image has no real text.
 * Owner smoke 2026-10-09: four toolbar icons read as "Igy] OF" at 31; every
 * real screenshot measured 76 or higher (noisiest: an address bar with icons).
 * Below the line the read is reported as no text, so the user gets "No text
 * found" (with "Paste image instead") instead of junk.
 */
export const NO_TEXT_BELOW = 50;

export function readsAsNoText(confidence: number): boolean {
  return confidence < NO_TEXT_BELOW;
}

/** Tesseract page-segmentation modes used here. */
export const LAYOUT_PSM = { auto: "3", sparse: "11" } as const;
export type OcrLayout = keyof typeof LAYOUT_PSM;

export function shouldInvert(medianLuminance: number): boolean {
  return medianLuminance < DARK_BACKGROUND_BELOW;
}

export function upscaleFactor(width: number): number {
  if (!(width > 0)) return 1;
  return Math.max(1, Math.min(MAX_SCALE, Math.round(TARGET_WIDTH / width)));
}

export function needsSparsePass(firstPassConfidence: number): boolean {
  return firstPassConfidence < SPARSE_PASS_BELOW;
}

/** The more confident read wins; a tie keeps the first (normal-layout) read. */
export function pickBetterRead<T extends { confidence: number }>(first: T, second: T): T {
  return second.confidence > first.confidence ? second : first;
}

/**
 * RGBA pixels → grayscale (Rec. 709 luma), inverted when the background is
 * dark. Mutates `rgba` in place; returns whether it inverted. Pure apart from
 * that, so the gate can run it on a hand-made buffer.
 */
export function grayscaleForOcr(rgba: Uint8ClampedArray): boolean {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < rgba.length; i += 4) {
    const luma = Math.round(0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]);
    rgba[i] = rgba[i + 1] = rgba[i + 2] = luma;
    histogram[luma]++;
  }
  // Median from the histogram — no sort over millions of pixels.
  const half = rgba.length / 8;
  let seen = 0;
  let median = 0;
  for (; median < 255; median++) {
    seen += histogram[median];
    if (seen > half) break;
  }
  const invert = shouldInvert(median);
  if (invert) {
    for (let i = 0; i < rgba.length; i += 4) rgba[i] = rgba[i + 1] = rgba[i + 2] = 255 - rgba[i];
  }
  return invert;
}

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** A 2D canvas of the given size (Offscreen when available), with a PNG/JPEG exporter. */
export function makeCanvas(
  width: number,
  height: number,
): { ctx: Canvas2D; toBlob: (type?: string, quality?: number) => Promise<Blob> } | null {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (ctx) return { ctx, toBlob: (type = "image/png", quality) => canvas.convertToBlob({ type, quality }) };
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      return {
        ctx,
        toBlob: (type = "image/png", quality) =>
          new Promise((resolve, reject) =>
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas export failed"))), type, quality),
          ),
      };
    }
  }
  return null;
}

/**
 * Browser half: decode, upscale, grayscale/invert, re-encode. Any failure
 * (no canvas, undecodable image) returns the original — preprocessing may only
 * ever help, never block a read.
 */
export async function preprocessForOcr(image: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(image);
    const scale = upscaleFactor(bitmap.width);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    const surface = makeCanvas(width, height);
    if (!surface) return image;
    surface.ctx.imageSmoothingQuality = "high";
    surface.ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const pixels = surface.ctx.getImageData(0, 0, width, height);
    grayscaleForOcr(pixels.data);
    surface.ctx.putImageData(pixels, 0, 0);
    return await surface.toBlob();
  } catch {
    return image;
  }
}
