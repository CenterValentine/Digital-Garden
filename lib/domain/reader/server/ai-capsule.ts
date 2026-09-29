/**
 * AI context for e-books (server-only).
 *
 * A book file's generic mention capsule used to be "(no text content
 * available)" — the chat route reads note payloads only. For a library book
 * the useful context isn't the first 2,000 characters of chapter one; it's
 * what the book is, where the user is in it, and what they marked. This
 * builds that capsule from BookMeta, ReadingProgress and ReaderAnnotation.
 *
 * Annotation bodies are plain strings (not TipTap JSON), so no private-content
 * seam applies here.
 */

import "server-only";
import { readerDb } from "../db";
import {
  contentTargetKey,
  READER_MIME_TYPES,
  type ReaderLocator,
} from "../types";

const BOOK_MIME_TYPES = new Set<string>(Object.values(READER_MIME_TYPES));
const MAX_HIGHLIGHTS = 25;
const MAX_DESCRIPTION = 1200;

export function isBookMimeType(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType && BOOK_MIME_TYPES.has(mimeType) && mimeType !== READER_MIME_TYPES.pdf);
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * Model-facing summary of a library book, or null when the reader tables
 * aren't migrated / the file has no book record (callers fall back).
 */
export async function buildBookCapsule(
  ownerId: string,
  contentId: string,
  options: { includeHighlights?: boolean } = {}
): Promise<string | null> {
  const targetKey = contentTargetKey(contentId);
  let meta;
  try {
    meta = await readerDb.bookMeta.findFirst({ where: { contentId, ownerId } });
  } catch {
    return null;
  }
  if (!meta) return null;

  const [progress, annotations] = await Promise.all([
    readerDb.readingProgress
      .findUnique({ where: { ownerId_targetKey: { ownerId, targetKey } } })
      .catch(() => null),
    options.includeHighlights === false
      ? Promise.resolve([])
      : readerDb.readerAnnotation
          .findMany({ where: { ownerId, targetKey }, orderBy: { createdAt: "asc" }, take: 500 })
          .catch(() => []),
  ]);

  const facts = [
    meta.authors.length ? `by ${meta.authors.join(", ")}` : null,
    meta.publishedYear ? String(meta.publishedYear) : null,
    meta.publisher,
    meta.language ? `language ${meta.language}` : null,
    meta.isbn ? `ISBN ${meta.isbn}` : null,
  ].filter(Boolean);

  const lines: string[] = [
    `E-book in the user's library: "${meta.title}"${facts.length ? ` — ${facts.join(" · ")}` : ""}.`,
    `Content id ${contentId}. read_content returns an excerpt of its text; the user reads and highlights it in Digital Garden's reader.`,
  ];
  if (meta.readingStatus) {
    lines.push(`Reading status: ${meta.readingStatus === "want" ? "want to read" : meta.readingStatus}.`);
  }
  if (progress) {
    const locator = progress.locator as ReaderLocator;
    const where = locator.label ? ` (at "${clip(locator.label, 120)}")` : "";
    lines.push(
      `Reading position: ${Math.round(progress.percent * 100)}% through${where}, last read ${progress.updatedAt.toISOString().slice(0, 10)}.`
    );
  }
  if (meta.description) {
    lines.push(`About the book: ${clip(meta.description, MAX_DESCRIPTION)}`);
  }

  const marks = annotations
    .filter((annotation) => annotation.kind !== "bookmark")
    .map((annotation) => ({
      annotation,
      locator: annotation.locator as ReaderLocator,
    }))
    .sort(
      (a, b) =>
        (a.locator.locations.totalProgression ?? Number.POSITIVE_INFINITY) -
        (b.locator.locations.totalProgression ?? Number.POSITIVE_INFINITY)
    );
  if (marks.length) {
    const shown = marks.slice(-MAX_HIGHLIGHTS);
    lines.push(
      `The user's highlights and notes (${marks.length}${marks.length > shown.length ? `, latest ${shown.length} in book order` : ""}) — their own words are after "note:":`
    );
    for (const { annotation, locator } of shown) {
      const quote = locator.text?.highlight ? `"${clip(locator.text.highlight, 280)}"` : "(no quoted text)";
      const where = locator.label ? ` [${clip(locator.label, 60)}]` : "";
      const note = annotation.body ? ` — note: ${clip(annotation.body, 280)}` : "";
      lines.push(`- ${quote}${where}${note}`);
    }
  }
  return lines.join("\n");
}
