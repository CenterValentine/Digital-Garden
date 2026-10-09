/**
 * The hover on an image attachment when the selected model can't see images
 * (AI-VIEW-SCREEN-PLAN D18): it gets the image's text instead — once read,
 * how much and how sure; failing that, nothing. Pure; pinned by
 * `pnpm ocr:blocks:check`.
 */
import type { OcrExtractionProfile } from "@/lib/domain/ai/tools/read-image-text";

export interface ImageTextState {
  ocrStatus?: "reading" | "done" | "failed";
  ocrText?: string;
  ocrExtraction?: OcrExtractionProfile;
}

export function imageTextHint(attachment: ImageTextState): {
  label: string;
  title: string;
} {
  const lead = "The selected model can't see images.";
  if (attachment.ocrStatus === "failed") {
    return {
      label: "No text",
      title: `${lead} The text in this image could not be read, so the AI will only be told an image was attached. Switch to a vision model to send the image itself.`,
    };
  }
  if (attachment.ocrStatus !== "done") {
    return { label: "Reading…", title: `${lead} Reading the text in this image on your device, so it can be sent instead…` };
  }
  const chars = (attachment.ocrText ?? "").trim().length;
  if (chars === 0) {
    return {
      label: "No text",
      title: `${lead} No readable text was found in this image (it may be a photo or drawing), so the AI will only be told an image was attached. Switch to a vision model to send the image itself.`,
    };
  }
  const confidence = attachment.ocrExtraction ? ` (${attachment.ocrExtraction.confidenceBand} confidence)` : "";
  return {
    label: "Text",
    title: `${lead} It will get the text extracted from this image instead — ${chars.toLocaleString("en-US")} characters read on your device${confidence}. OCR can misread characters, and it describes nothing visual.`,
  };
}

