/**
 * Speed-reader OCR — a thin adapter over the shared local engine
 * (lib/features/ocr). The engine owns the worker lifecycle: lazy spawn on
 * first use, one worker shared with the editor, termination after it idles.
 * There is deliberately no terminate here: the worker is shared, and only the
 * engine knows whether another caller's job is still running.
 */
import { getOcrEngine } from "@/lib/features/ocr";

export async function ocrBlobToReaderText(blob: Blob): Promise<string> {
  const result = await getOcrEngine().recognize(blob);
  return result.text.replace(/\n{3,}/g, "\n\n").trim();
}
