/**
 * LDS standard works adapter — bcbooks/scriptures-json → corpus rows.
 *
 * Pure (no I/O): `normalizeLdsVolume` turns one volume's JSON into book and
 * verse rows, so the gate (scripts/validate-reader.ts) can check it on
 * fixtures. The server fetches the five pinned files and feeds them through.
 *
 * Source: https://github.com/bcbooks/scriptures-json (Ben Crowder), pinned to
 * a commit so an upstream edit can never silently change installed text.
 * Only the verse text and the headings shipped there are ingested — no
 * copyrighted study apparatus (footnotes, chapter summaries, Bible
 * Dictionary), per SCRIPTURES-INTEGRATION-PLAN.md §2.
 */

import { LDS_BOOKS, LDS_VOLUMES } from "../lds";

export const LDS_SOURCE_COMMIT = "3bda76e40add4582165340ea6b1198dc6ad26ae1";

export function ldsVolumeUrl(file: string): string {
  return `https://raw.githubusercontent.com/bcbooks/scriptures-json/${LDS_SOURCE_COMMIT}/${file}.json`;
}

interface RawVerse {
  verse: number;
  text: string;
}

interface RawChapter {
  chapter?: number;
  section?: number;
  verses: RawVerse[];
}

interface RawBook {
  book: string;
  lds_slug: string;
  full_title?: string;
  heading?: string;
  chapters: RawChapter[];
}

/** One volume file: either `books` (most volumes) or `sections` (D&C). */
export interface RawLdsVolume {
  title?: string;
  version?: number | string;
  books?: RawBook[];
  sections?: RawChapter[];
}

export interface NormalizedBook {
  slug: string;
  name: string;
  fullTitle: string;
  heading: string | null;
  volume: string;
  volumeTitle: string;
  chapterCount: number;
  abbreviations: string[];
}

export interface NormalizedVerse {
  bookSlug: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface NormalizedVolume {
  books: NormalizedBook[];
  verses: NormalizedVerse[];
  version: string;
}

export function normalizeLdsVolume(volumeSlug: string, raw: RawLdsVolume): NormalizedVolume {
  const volume = LDS_VOLUMES.find((entry) => entry.slug === volumeSlug);
  if (!volume) throw new Error(`Unknown LDS volume ${volumeSlug}`);
  const books: NormalizedBook[] = [];
  const verses: NormalizedVerse[] = [];

  const rawBooks: RawBook[] = raw.books
    ? raw.books
    : raw.sections
      ? [{ book: "Doctrine and Covenants", lds_slug: "dc", full_title: raw.title ?? "The Doctrine and Covenants", chapters: raw.sections }]
      : [];

  for (const rawBook of rawBooks) {
    const def = LDS_BOOKS.find((entry) => entry.slug === rawBook.lds_slug);
    if (!def) throw new Error(`Book ${rawBook.lds_slug} is not in the LDS book table`);
    books.push({
      slug: def.slug,
      name: def.name,
      fullTitle: rawBook.full_title ?? def.name,
      heading: rawBook.heading?.trim() || null,
      volume: volume.slug,
      volumeTitle: volume.title,
      chapterCount: rawBook.chapters.length,
      abbreviations: def.abbreviations,
    });
    for (const chapter of rawBook.chapters) {
      const number = chapter.chapter ?? chapter.section;
      if (typeof number !== "number") throw new Error(`Chapter without a number in ${def.slug}`);
      for (const verse of chapter.verses) {
        verses.push({ bookSlug: def.slug, chapter: number, verse: verse.verse, text: verse.text.trim() });
      }
    }
  }
  return { books, verses, version: String(raw.version ?? "") };
}
