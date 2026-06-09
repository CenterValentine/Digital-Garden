import type { JSONContent } from "@tiptap/core";

export const EMPTY_TIPTAP_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function createTextTiptapDoc(text: string): JSONContent {
  const value = text.trim();
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: value ? [{ type: "text", text: value }] : undefined,
      },
    ],
  };
}

/**
 * Build a rich card front for an identification (image-recall) card: the
 * generated image followed by a short instruction caption beneath it. Stored as
 * frontContent with isFrontRichText=true. The `image` node matches the editor's
 * EditorImage (extends @tiptap/extension-image) attrs.
 */
export function createImageFrontDoc(
  imageUrl: string,
  imageContentId: string | null,
  label: string,
): JSONContent {
  const caption = label.trim();
  return {
    type: "doc",
    content: [
      {
        type: "image",
        attrs: {
          src: imageUrl,
          contentId: imageContentId,
          source: "ai-generated",
          alt: caption || "Identification image",
        },
      },
      {
        type: "paragraph",
        content: caption ? [{ type: "text", text: caption }] : undefined,
      },
    ],
  };
}

/**
 * Build a card front/back fragment containing an audio clip. Two uses:
 *  - Pronunciation (Mode A): a spoken term attached to a card, autoplay on flip.
 *  - Sound identification (Mode B/C): the clip IS the front prompt (bird call,
 *    engine). For identification pass an EMPTY label so the answer isn't given
 *    away in a caption.
 *
 * Mirrors createImageFrontDoc. The `audioEmbed` node has no contentId attr (the
 * src URL is sufficient for playback), so unlike the image node we only carry
 * the storage URL.
 */
export function createAudioFrontDoc(
  audioUrl: string,
  label: string,
  options: { autoplayOnFlip?: boolean } = {},
): JSONContent {
  const caption = label.trim();
  return {
    type: "doc",
    content: [
      {
        type: "audioEmbed",
        attrs: {
          blockId: crypto.randomUUID(),
          src: audioUrl,
          filename: caption || "Audio",
          autoplayOnFlip: options.autoplayOnFlip ?? false,
        },
      },
      {
        type: "paragraph",
        content: caption ? [{ type: "text", text: caption }] : undefined,
      },
    ],
  };
}

/**
 * Append an audio clip to an existing card doc (e.g. attach a pronunciation to
 * a term that's already on the front/back). Returns a new doc — does not mutate
 * the input. If the value isn't a doc it's normalized first.
 */
export function appendAudioToDoc(
  doc: unknown,
  audioUrl: string,
  options: { autoplayOnFlip?: boolean } = {},
): JSONContent {
  const base = normalizeTiptapDoc(doc);
  const audioNode: JSONContent = {
    type: "audioEmbed",
    attrs: {
      blockId: crypto.randomUUID(),
      src: audioUrl,
      filename: "Pronunciation",
      autoplayOnFlip: options.autoplayOnFlip ?? false,
    },
  };
  return {
    ...base,
    content: [...(base.content ?? []), audioNode],
  };
}

export function isTiptapDoc(value: unknown): value is JSONContent {
  return Boolean(
    value &&
      typeof value === "object" &&
      "type" in value &&
      (value as { type?: unknown }).type === "doc"
  );
}

export function normalizeTiptapDoc(value: unknown): JSONContent {
  return isTiptapDoc(value) ? value : EMPTY_TIPTAP_DOC;
}

export function extractPlainTextFromTiptap(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { text?: unknown; content?: unknown };
  const ownText = typeof node.text === "string" ? node.text : "";
  const childText = Array.isArray(node.content)
    ? node.content.map(extractPlainTextFromTiptap).filter(Boolean).join(" ")
    : "";
  return [ownText, childText].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function summarizeFlashcardContent(value: unknown, maxLength = 140): string {
  const text = extractPlainTextFromTiptap(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trim()}...`;
}

export function sanitizeFlashcardLabel(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, 80);
}

export function sanitizeFlashcardCategory(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || "General").slice(0, 120);
}

export function sanitizeFlashcardSubcategory(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.slice(0, 120);
}
