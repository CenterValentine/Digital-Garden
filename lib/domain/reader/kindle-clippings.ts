/**
 * Parser for Kindle's "My Clippings.txt" (the file on every Kindle device).
 * Pure + client-safe so it can be unit-tested and previewed before upload.
 *
 * Format (one clipping per block, blocks separated by "=========="):
 *
 *   Title (Author)
 *   - Your Highlight on page 12 | Location 180-182 | Added on Monday, …
 *
 *   The highlighted text
 *   ==========
 */

export type KindleClippingKind = "highlight" | "note" | "bookmark";

export interface KindleClipping {
  title: string;
  author?: string;
  kind: KindleClippingKind;
  page?: string;
  location?: string;
  addedAt?: string;
  text: string;
}

export interface KindleBook {
  title: string;
  author?: string;
  clippings: KindleClipping[];
}

const SEPARATOR = /^={5,}\s*$/m;

function parseHeader(line: string): { title: string; author?: string } {
  const cleaned = line.replace(/^﻿/, "").trim();
  // Author is the LAST parenthesised group ("Title (Series) (Author)").
  const match = cleaned.match(/^(.*)\(([^()]*)\)\s*$/);
  if (match && match[1].trim()) {
    return { title: match[1].trim(), author: match[2].trim() || undefined };
  }
  return { title: cleaned };
}

function parseMeta(line: string): Omit<KindleClipping, "title" | "author" | "text"> {
  const lower = line.toLowerCase();
  const kind: KindleClippingKind = lower.includes("bookmark")
    ? "bookmark"
    : lower.includes("note")
      ? "note"
      : "highlight";
  const page = line.match(/page\s+([\w-]+)/i)?.[1];
  const location = line.match(/location\s+([\d-]+)/i)?.[1];
  const addedAt = line.match(/Added on\s+(.+)$/i)?.[1]?.trim();
  return { kind, page, location, addedAt };
}

export function parseKindleClippings(raw: string): KindleBook[] {
  const books = new Map<string, KindleBook>();
  for (const block of raw.split(SEPARATOR)) {
    const lines = block
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.replace(/^﻿/, ""));
    while (lines.length && !lines[0].trim()) lines.shift();
    if (lines.length < 2) continue;
    const header = parseHeader(lines[0]);
    const meta = parseMeta(lines[1]);
    const text = lines.slice(2).join("\n").trim();
    if (!text && meta.kind !== "bookmark") continue;
    const key = `${header.title}\u0000${header.author ?? ""}`;
    let book = books.get(key);
    if (!book) {
      book = { title: header.title, author: header.author, clippings: [] };
      books.set(key, book);
    }
    book.clippings.push({ ...header, ...meta, text });
  }
  return [...books.values()];
}

/** Stable id for idempotent re-import of the same clipping. */
export function kindleClippingId(clipping: KindleClipping): string {
  const basis = `${clipping.title}|${clipping.kind}|${clipping.location ?? clipping.page ?? ""}|${clipping.text}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `kindle:${(hash >>> 0).toString(16)}:${basis.length}`;
}

/** Title comparison that survives subtitles, punctuation and case. */
export function normalizeBookTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\.(epub|pdf|mobi|azw3?)$/i, "")
    .split(/[:(\[]/)[0]
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^(the|a|an) /, "")
    .trim();
}
