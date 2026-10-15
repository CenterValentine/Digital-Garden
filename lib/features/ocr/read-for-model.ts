/**
 * The client half of the AI's `read_image_text` tool. OCR-PASTE-PLAN.md D8.
 *
 * Downloads the image the model named and reads it with the shared local
 * engine. Every outcome — including every failure — comes back as a result
 * the model can act on, never a thrown error: a tool that reports its real
 * outcome is the contract the chat harness depends on.
 */
import {
  ocrExtractionProfile,
  type OcrExtractionProfile,
  type ReadImageTextResult,
} from "@/lib/domain/ai/tools/read-image-text";

import { getOcrEngine } from "./index";
import { reflowOcrText } from "./reflow";

/** A page of dense text is ~4k characters; this only guards against pathological input. */
const MAX_CHARS = 20_000;

export interface RecognizedImageText {
  /** Reflowed, capped at MAX_CHARS. Empty when nothing readable was found. */
  text: string;
  truncated: boolean;
  extraction: OcrExtractionProfile;
}

/**
 * Read an image's text for a MODEL: reflowed, capped, and labelled with how it
 * was read (D18). Shared by `read_image_text` and the composer's attached
 * images for models that cannot see. Throws when recognition itself fails.
 */
export async function recognizeImageText(image: Blob): Promise<RecognizedImageText> {
  const result = await getOcrEngine().recognize(image);
  const text = reflowOcrText(result.text);
  const truncated = text.length > MAX_CHARS;
  return {
    text: truncated ? text.slice(0, MAX_CHARS) : text,
    truncated,
    extraction: ocrExtractionProfile({ confidence: result.confidence, structure: result.structure }),
  };
}

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

  let read: RecognizedImageText;
  try {
    read = await recognizeImageText(image);
  } catch (error) {
    return { ok: false, contentId, note: `Text recognition failed on this device: ${describe(error)}` };
  }
  if (!read.text) {
    return {
      ok: true,
      contentId,
      untrustedImageText: "",
      confidence: read.extraction.confidence,
      extraction: read.extraction,
      note: "No readable text was found. The image may be a photo or drawing without words — this tool reads text only.",
    };
  }
  return {
    ok: true,
    contentId,
    untrustedImageText: read.text,
    confidence: read.extraction.confidence,
    extraction: read.extraction,
    ...(read.truncated ? { note: `Text truncated to the first ${MAX_CHARS.toLocaleString("en-US")} characters.` } : {}),
  };
}
