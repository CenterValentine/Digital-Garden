/**
 * The images inside a note, as a reader sees them. OCR-PASTE-PLAN.md D8.
 *
 * The text extractor drops image nodes, so an AI reading a note could not tell
 * an image was there at all. This lists them — name and content id — so the
 * reader can ask for one's text (`read_image_text`).
 *
 * An egress seam: private (commented-out) content is stripped FIRST, so an
 * image inside a private block is never offered. Pinned by
 * `pnpm private:content:check`.
 */
import type { JSONContent } from "@tiptap/core";

import { stripPrivateContent } from "./private-content";

export interface NoteImage {
  /** Uploaded images carry their file's content id; URL images do not. */
  contentId: string | null;
  /** Alt text, else the URL's last path segment. */
  name: string;
  /** Only for images that point at an external URL (no content id). */
  url: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function walk(node: JSONContent, out: NoteImage[]) {
  if (node.type === "image") {
    const attrs = (node.attrs ?? {}) as { src?: unknown; alt?: unknown; contentId?: unknown };
    const src = typeof attrs.src === "string" ? attrs.src : "";
    const contentId =
      typeof attrs.contentId === "string" && UUID.test(attrs.contentId) ? attrs.contentId : null;
    // A blob: src is an upload still in flight — nothing readable to offer yet.
    if (!contentId && !/^https?:/i.test(src)) return;
    const alt = typeof attrs.alt === "string" ? attrs.alt.trim() : "";
    const lastSegment = src.split("?")[0].split("/").filter(Boolean).pop() ?? "";
    out.push({
      contentId,
      name: alt || (contentId ? "image" : lastSegment || "image"),
      url: contentId ? null : src,
    });
    return;
  }
  for (const child of node.content ?? []) walk(child, out);
}

export function listNoteImages(json: JSONContent): NoteImage[] {
  const out: NoteImage[] = [];
  walk(stripPrivateContent(json), out);
  return out;
}

/**
 * The block the AI's note reader appends. Null when the note has no images.
 * `canRead` says whether `read_image_text` is registered this turn.
 */
export function describeNoteImages(images: NoteImage[], canRead: boolean): string | null {
  if (images.length === 0) return null;
  const lines = images.map((image) =>
    image.contentId
      ? `- ${image.name} (contentId ${image.contentId})`
      : `- ${image.name} (external image ${image.url})`,
  );
  const how = canRead
    ? "Their text is not included above; read an uploaded one with read_image_text."
    : "Their text is not included above.";
  return `Images in this note (${images.length}). ${how}\n${lines.join("\n")}`;
}
