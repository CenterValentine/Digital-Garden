/**
 * The client half of the AI's `read_image_text` tool. OCR-PASTE-PLAN.md D8.
 *
 * Downloads the image the model named and reads it with the shared local
 * engine. Every outcome — including every failure — comes back as a result
 * the model can act on, never a thrown error: a tool that reports its real
 * outcome is the contract the chat harness depends on.
 */
import type { ReadImageTextResult } from "@/lib/domain/ai/tools/read-image-text";

import { getOcrEngine } from "./index";
import { reflowOcrText } from "./reflow";

/** A page of dense text is ~4k characters; this only guards against pathological input. */
const MAX_CHARS = 20_000;
/** Below this mean word confidence the model is told to treat words with care. */
const LOW_CONFIDENCE = 60;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function readImageTextForModel(contentId: string): Promise<ReadImageTextResult> {
  let image: Blob;
  try {
    const response = await fetch(
      `/api/content/content/${encodeURIComponent(contentId)}/download?stream=true`,
      { credentials: "include" },
    );
    if (response.status === 404 || response.status === 403) {
      return {
        ok: false,
        contentId,
        note: "No image with this content id is accessible. Take the id from read_content's image list or file details.",
      };
    }
    if (!response.ok) {
      return { ok: false, contentId, note: `The image could not be downloaded (HTTP ${response.status}).` };
    }
    image = await response.blob();
  } catch (error) {
    return { ok: false, contentId, note: `The image could not be downloaded: ${describe(error)}` };
  }

  // An empty type is tolerated (some stores omit it); a known non-image is not.
  if (image.type && !image.type.startsWith("image/")) {
    return {
      ok: false,
      contentId,
      note: `This content is not an image (${image.type}). Read it with read_content instead.`,
    };
  }

  let raw: string;
  let confidence: number;
  try {
    const result = await getOcrEngine().recognize(image);
    raw = result.text;
    confidence = Math.round(result.confidence);
  } catch (error) {
    return { ok: false, contentId, note: `Text recognition failed on this device: ${describe(error)}` };
  }

  const text = reflowOcrText(raw);
  if (!text) {
    return {
      ok: true,
      contentId,
      untrustedImageText: "",
      confidence,
      note: "No readable text was found. The image may be a photo or drawing without words — this tool reads text only.",
    };
  }
  const truncated = text.length > MAX_CHARS;
  const notes: string[] = [];
  if (confidence < LOW_CONFIDENCE) {
    notes.push("Low recognition confidence: the image may be blurry, small or stylised, so treat uncertain words with care.");
  }
  if (truncated) notes.push(`Text truncated to the first ${MAX_CHARS.toLocaleString("en-US")} characters.`);
  return {
    ok: true,
    contentId,
    untrustedImageText: truncated ? text.slice(0, MAX_CHARS) : text,
    confidence,
    ...(notes.length > 0 ? { note: notes.join(" ") } : {}),
  };
}
