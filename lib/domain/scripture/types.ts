/**
 * Scripture domain types (client-safe — no Prisma, no Node APIs).
 *
 * A *corpus* is one tradition's canon in one edition (the LDS standard works,
 * a Tanakh, the Pāli Canon…). Its text lives once, shared and read-only; users
 * enable the corpora they want. Books group into *volumes* (the LDS standard
 * works: Old Testament, New Testament, Book of Mormon, Doctrine and Covenants,
 * Pearl of Great Price). Units are addressed book → chapter → verse; other
 * versifications (surah → āyah, sutta → segment) map onto the same three
 * levels, with the corpus's `versification` naming them for display.
 *
 * Plan: docs/notes-feature/work-tracking/SCRIPTURES-INTEGRATION-PLAN.md §R3.
 */

export type ScriptureTradition =
  | "lds"
  | "christian"
  | "jewish"
  | "islamic"
  | "buddhist"
  | "hindu"
  | "sikh"
  | "taoist"
  | "bahai";

export type ScriptureVersification = "chapter-verse" | "surah-ayah" | "sutta-segment" | "section-verse";

export interface ScriptureVolumeInfo {
  slug: string;
  title: string;
}

export interface ScriptureBookInfo {
  slug: string;
  name: string;
  fullTitle: string;
  heading: string | null;
  volume: string;
  volumeTitle: string;
  chapterCount: number;
  abbreviations: string[];
}

export interface ScriptureCorpusInfo {
  id: string;
  tradition: ScriptureTradition;
  title: string;
  language: string;
  sourceUrl: string;
  license: string;
  versification: ScriptureVersification;
  version: string;
  verseCount: number;
}

/** A corpus as the user sees it in the catalog. */
export interface ScriptureCatalogItem extends Omit<ScriptureCorpusInfo, "verseCount" | "version"> {
  description: string;
  /** "available" = installable now; "planned" = catalogued, adapter not built yet; "link" = licence allows linking only. */
  status: "available" | "planned" | "link";
  /** Loaded into this Digital Garden (global). */
  installed: boolean;
  /** Enabled by the current user. */
  enabled: boolean;
  verseCount: number;
  /** Where to read it when it can't be loaded here. */
  homepage?: string;
}

export interface ScriptureVerseDto {
  verse: number;
  text: string;
}

export interface ScriptureChapterDto {
  corpusId: string;
  book: ScriptureBookInfo;
  chapter: number;
  /** "Chapter" / "Section" / "Surah" — the unit's display name. */
  chapterLabel: string;
  verses: ScriptureVerseDto[];
  prev: { bookSlug: string; chapter: number; label: string } | null;
  next: { bookSlug: string; chapter: number; label: string } | null;
  /** Position of this chapter in the whole corpus, 0..1 (reading progress). */
  fraction: number;
}

export interface ScriptureContents {
  corpus: ScriptureCorpusInfo;
  volumes: Array<ScriptureVolumeInfo & { books: ScriptureBookInfo[] }>;
}

export interface ScriptureSearchHit {
  bookSlug: string;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
  reference: string;
}

/** A parsed reference with its verse text (links, quotes, AI). */
export interface ScriptureResolvedReference {
  ref: ScriptureRef;
  label: string;
  verses: Array<{ chapter: number; verse: number; text: string }>;
}

export interface ScriptureSearchResult {
  /** The passage, when the query parses as a reference ("Alma 32:21"). */
  reference: ScriptureResolvedReference | null;
  hits: ScriptureSearchHit[];
  total: number;
}

/** A parsed reference: a book plus an optional chapter and verse range. */
export interface ScriptureRef {
  bookSlug: string;
  chapter: number | null;
  verseStart: number | null;
  verseEnd: number | null;
}

// ── Keys and anchors ─────────────────────────────────────────────────────

/** Annotation / progress target key for a corpus. */
export function scriptureTargetKey(corpusId: string): string {
  return `scripture:${corpusId}`;
}

export function parseScriptureTargetKey(targetKey: string): string | null {
  return targetKey.startsWith("scripture:") ? targetKey.slice("scripture:".length) : null;
}

/** Virtual tab id for a corpus reader (owned by the reader extension). */
export const SCRIPTURE_TAB_PREFIX = "reader:scripture/";

export function scriptureTabId(corpusId: string): string {
  return `${SCRIPTURE_TAB_PREFIX}${corpusId}`;
}

export function corpusIdFromTabId(tabId: string): string | null {
  return tabId.startsWith(SCRIPTURE_TAB_PREFIX) ? tabId.slice(SCRIPTURE_TAB_PREFIX.length) : null;
}

/**
 * The `href` of a scripture locator and the id of a `verse:` link anchor:
 * `<book>/<chapter>` or `<book>/<chapter>/<verse>[-<verse>]`.
 */
export function formatVerseHref(ref: ScriptureRef): string {
  const base = `${ref.bookSlug}/${ref.chapter ?? 1}`;
  if (ref.verseStart == null) return base;
  return ref.verseEnd != null && ref.verseEnd !== ref.verseStart
    ? `${base}/${ref.verseStart}-${ref.verseEnd}`
    : `${base}/${ref.verseStart}`;
}

export function parseVerseHref(href: string): ScriptureRef | null {
  const match = /^([a-z0-9-]+)\/(\d+)(?:\/(\d+)(?:-(\d+))?)?$/.exec(href);
  if (!match) return null;
  return {
    bookSlug: match[1],
    chapter: Number(match[2]),
    verseStart: match[3] ? Number(match[3]) : null,
    verseEnd: match[4] ? Number(match[4]) : match[3] ? Number(match[3]) : null,
  };
}

/** The anchor kind for verse links (lib/domain/content/link-anchor.ts). */
export const VERSE_ANCHOR_KIND = "verse";
