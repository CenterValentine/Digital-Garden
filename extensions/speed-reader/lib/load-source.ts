import { extractReadableText } from "@/lib/domain/editor/tts/extract-readable-text";
import type { JSONContent } from "@tiptap/core";
import { textBlobToReaderText } from "./extractors/pdf";
import { ocrBlobToReaderText } from "./extractors/ocr";

export type LoadStage =
  | "fetching"
  | "extracting"
  | "ocring"
  | "tokenizing"
  | "done";

export interface LoadProgress {
  stage: LoadStage;
  detail?: string;
  /** 0..1 within the current stage, when known */
  ratio?: number;
}

export interface LoadResult {
  text: string;
  title: string | null;
  contentType: string;
  source: "note" | "file-text" | "file-pdf" | "file-image-ocr" | "external";
  warning?: string;
}

export interface LoadOptions {
  /** True if user explicitly opted into OCR (vs. auto-OCR scanned PDFs) */
  allowOcr: boolean;
  onProgress?: (p: LoadProgress) => void;
}

interface ContentDetailEnvelope {
  success: boolean;
  data?: {
    title: string;
    contentType: string;
    note?: { tiptapJson: unknown; searchText?: string };
    file?: {
      fileName: string;
      mimeType: string;
      fileSize: string;
      searchText?: string;
    };
    external?: {
      url: string;
      preservedHtmlSnapshot?: Record<string, unknown> | null;
      description?: string | null;
    };
  };
  error?: string;
}

export async function loadSpeedReaderSource(
  contentId: string,
  opts: LoadOptions
): Promise<LoadResult> {
  const { onProgress, allowOcr } = opts;
  onProgress?.({ stage: "fetching" });

  const detailRes = await fetch(`/api/content/content/${contentId}`, {
    credentials: "include",
  });
  if (!detailRes.ok) {
    throw new Error(`Failed to load content (${detailRes.status})`);
  }
  const detail = (await detailRes.json()) as ContentDetailEnvelope;
  if (!detail.success || !detail.data) {
    throw new Error(detail.error || "Content unavailable");
  }
  const data = detail.data;

  onProgress?.({ stage: "extracting" });

  if (data.contentType === "note" && data.note) {
    const text = extractReadableText(data.note.tiptapJson as JSONContent) ||
      data.note.searchText || "";
    return {
      text,
      title: data.title,
      contentType: "note",
      source: "note",
    };
  }

  if (data.contentType === "external" && data.external) {
    const extractRes = await fetch("/api/speed-reader/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ contentId }),
    });
    if (!extractRes.ok) {
      throw new Error(
        `Could not fetch the page (${extractRes.status}). Some sites block fetchers.`
      );
    }
    const extracted = (await extractRes.json()) as {
      success: boolean;
      data?: { text: string; title?: string };
      error?: string;
    };
    if (!extracted.success || !extracted.data) {
      throw new Error(extracted.error || "Could not parse the page");
    }
    return {
      text: extracted.data.text,
      title: extracted.data.title ?? data.title,
      contentType: "external",
      source: "external",
    };
  }

  if (data.contentType === "file" && data.file) {
    const mime = data.file.mimeType.toLowerCase();

    // Use server-extracted text first (same source as TTS). This covers text-based
    // PDFs, text files, and any other format the upload pipeline already indexed.
    if (data.file.searchText) {
      return {
        text: data.file.searchText,
        title: data.title,
        contentType: "file",
        source: mime.startsWith("image/") ? "file-image-ocr" : "file-pdf",
      };
    }

    // Images: always need OCR since they have no searchText.
    if (mime.startsWith("image/")) {
      if (!allowOcr) {
        throw new Error(
          "Enable OCR (toggle in the dialog) to read text from images."
        );
      }
      onProgress?.({ stage: "ocring" });
      const blob = await downloadFileBlob(contentId);
      const ocrText = await ocrBlobToReaderText(blob);
      return {
        text: ocrText,
        title: data.title,
        contentType: "file",
        source: "file-image-ocr",
      };
    }

    // PDFs with no searchText are likely scanned; offer OCR.
    if (mime === "application/pdf" || data.file.fileName.endsWith(".pdf")) {
      if (!allowOcr) {
        return {
          text: "",
          title: data.title,
          contentType: "file",
          source: "file-pdf",
          warning:
            "This PDF appears to be scanned. Enable OCR to read its text.",
        };
      }
      onProgress?.({ stage: "ocring" });
      const blob = await downloadFileBlob(contentId);
      const ocrText = await ocrBlobToReaderText(blob);
      return {
        text: ocrText,
        title: data.title,
        contentType: "file",
        source: "file-image-ocr",
      };
    }

    // Plain text files: download the raw bytes.
    if (mime.startsWith("text/") || isTextLikeExtension(data.file.fileName)) {
      const blob = await downloadFileBlob(contentId);
      const text = await textBlobToReaderText(blob);
      return {
        text,
        title: data.title,
        contentType: "file",
        source: "file-text",
      };
    }

    throw new Error(`Unsupported file type: ${mime || "unknown"}`);
  }

  throw new Error(
    `Speed Reader doesn't support content type "${data.contentType}" yet.`
  );
}

/** Download file bytes via the stream endpoint (bypasses the presigned-URL JSON response). */
async function downloadFileBlob(contentId: string): Promise<Blob> {
  const res = await fetch(
    `/api/content/content/${contentId}/download?stream=true`,
    { credentials: "include" }
  );
  if (!res.ok) throw new Error(`Could not download file (${res.status})`);
  return res.blob();
}

function isTextLikeExtension(filename: string): boolean {
  return /\.(md|markdown|txt|csv|tsv|json|log|rtf|html?|xml)$/i.test(filename);
}
