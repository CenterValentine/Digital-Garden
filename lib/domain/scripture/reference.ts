/**
 * Scripture reference parsing — "1 Ne. 3:7", "Alma 32:21–23",
 * "D&C 88:118", "Moroni 10", "John 3:16, 17; Matt. 5:14" (client-safe).
 *
 * Why not a library (CLAUDE.md library-first rule): `scripture-guide` (npm,
 * the one parser with LDS book names) depends on `mysql2` and `dotenv` — a
 * database driver in a client-side reference parser is not acceptable — and
 * `bible-passage-reference-parser` knows no Restoration scripture. This is a
 * small grammar over a book table instead; each tradition's corpus supplies
 * its own table (LDS: lib/domain/scripture/lds.ts).
 */

import type { ScriptureRef } from "./types";

export interface ReferenceBook {
  slug: string;
  name: string;
  chapters: number;
  abbreviations: string[];
}

/** Lowercase, drop punctuation/spaces/dashes; ordinals as digits ("First" → 1). */
export function normalizeBookKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/^(first|1st|i)\s+/, "1")
    .replace(/^(second|2nd|ii)\s+/, "2")
    .replace(/^(third|3rd|iii)\s+/, "3")
    .replace(/^(fourth|4th|iv)\s+/, "4")
    .replace(/[\s.’'—–\-_]/g, "");
}

export interface BookIndex {
  byKey: Map<string, ReferenceBook>;
  books: ReferenceBook[];
}

export function buildBookIndex(books: ReferenceBook[]): BookIndex {
  const byKey = new Map<string, ReferenceBook>();
  for (const book of books) {
    for (const spelling of [book.name, book.slug, ...book.abbreviations]) {
      byKey.set(normalizeBookKey(spelling), book);
    }
  }
  return { byKey, books };
}

/**
 * Resolve a book name/abbreviation, exact first, then as an unambiguous
 * prefix of a known spelling ("Hela" → Helaman). Null when unknown or
 * ambiguous.
 */
export function resolveBook(text: string, index: BookIndex): ReferenceBook | null {
  const key = normalizeBookKey(text);
  if (!key) return null;
  const exact = index.byKey.get(key);
  if (exact) return exact;
  const matches = new Set<ReferenceBook>();
  for (const [spelling, book] of index.byKey) {
    if (spelling.startsWith(key)) matches.add(book);
  }
  return matches.size === 1 ? [...matches][0] : null;
}

// "<book> <chapter>[:<verse>[-<verse>]]" — the book may start with a digit.
const SINGLE = /^\s*((?:[1-4]\s*)?[A-Za-z&][A-Za-z&.'’\s—–-]*?)\s*(\d+)?(?:\s*:\s*(\d+)(?:\s*[-–—]\s*(\d+))?)?\s*$/;

/**
 * Parse one reference. A bare book ("Moroni") gives chapter null; a chapter
 * without verses gives verseStart null. Chapters/verses beyond the book's
 * range are rejected (verse bounds are checked later, against the text).
 */
export function parseReference(text: string, index: BookIndex): ScriptureRef | null {
  const match = SINGLE.exec(text.replace(/ /g, " "));
  if (!match) return null;
  const book = resolveBook(match[1], index);
  if (!book) return null;
  let chapter = match[2] ? Number(match[2]) : null;
  // One-chapter books take "Enos 1:3" and "Enos 3" (verse 3) alike.
  if (chapter != null && !match[3] && book.chapters === 1 && chapter > 1) {
    return { bookSlug: book.slug, chapter: 1, verseStart: chapter, verseEnd: chapter };
  }
  if (chapter != null && (chapter < 1 || chapter > book.chapters)) return null;
  if (chapter == null && book.chapters === 1) chapter = 1;
  const verseStart = match[3] ? Number(match[3]) : null;
  const verseEnd = match[4] ? Number(match[4]) : verseStart;
  if (verseStart != null && verseEnd != null && verseEnd < verseStart) return null;
  return { bookSlug: book.slug, chapter, verseStart, verseEnd };
}

/**
 * Parse a list: "John 3:16, 17; Matt. 5:14–16". A bare number after a comma
 * continues the previous chapter; after a semicolon it's a new chapter of the
 * same book ("Alma 32:21; 33").
 */
export function parseReferenceList(text: string, index: BookIndex): ScriptureRef[] {
  const refs: ScriptureRef[] = [];
  let last: ScriptureRef | null = null;
  for (const group of text.split(";")) {
    let first = true;
    for (const part of group.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const bare = /^(\d+)(?:\s*[-–—]\s*(\d+))?$/.exec(trimmed);
      if (bare && last) {
        const a = Number(bare[1]);
        const z = bare[2] ? Number(bare[2]) : a;
        const ref: ScriptureRef = first
          ? { bookSlug: last.bookSlug, chapter: a, verseStart: null, verseEnd: null }
          : { bookSlug: last.bookSlug, chapter: last.chapter, verseStart: a, verseEnd: z };
        refs.push(ref);
        last = ref;
      } else {
        const ref = parseReference(trimmed, index);
        if (ref) {
          refs.push(ref);
          last = ref;
        }
      }
      first = false;
    }
  }
  return refs;
}

/** "1 Ne. 3:7", "Alma 32:21–23", "D&C 88", "Moroni" — display form. */
export function formatReference(ref: ScriptureRef, displayName: (slug: string) => string): string {
  const name = displayName(ref.bookSlug);
  if (ref.chapter == null) return name;
  if (ref.verseStart == null) return `${name} ${ref.chapter}`;
  const verses = ref.verseEnd != null && ref.verseEnd !== ref.verseStart
    ? `${ref.verseStart}–${ref.verseEnd}`
    : `${ref.verseStart}`;
  return `${name} ${ref.chapter}:${verses}`;
}
