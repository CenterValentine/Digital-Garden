/**
 * Scripture corpus service (server-only): catalog, install, enable, read,
 * search, resolve references.
 *
 * One shared copy of each corpus; each user adds the collections they want
 * to their own menu (installing on first use — see installCorpus).
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import { Prisma } from "@/lib/database/generated/prisma";
import { SCRIPTURE_CATALOG, catalogEntry, LDS_CORPUS_ID } from "../catalog";
import { LDS_VOLUMES } from "../lds";
import { ldsVolumeUrl, normalizeLdsVolume, type NormalizedBook, type NormalizedVerse, type RawLdsVolume } from "../adapters/lds";
import {
  buildBookIndex,
  formatReference,
  normalizeBookKey,
  parseReference,
  parseReferenceList,
  type BookIndex,
} from "../reference";
import type {
  ScriptureBookChapters,
  ScriptureBookInfo,
  ScriptureCatalogItem,
  ScriptureChapterDto,
  ScriptureContents,
  ScriptureCorpusInfo,
  ScriptureBookMatch,
  ScriptureResolvedReference,
  ScriptureSearchHit,
  ScriptureSearchOptions,
  ScriptureSearchResult,
  ScriptureTradition,
  ScriptureVersification,
} from "../types";
import { scriptureDb, type ScriptureBookRow, type ScriptureCorpusRow } from "./db";

export class ScriptureError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const VERSE_BATCH = 2000;

function toCorpusInfo(row: ScriptureCorpusRow): ScriptureCorpusInfo {
  return {
    id: row.id,
    tradition: row.tradition as ScriptureTradition,
    // The catalog names the collection (renames apply without a migration).
    title: catalogEntry(row.id)?.title ?? row.title,
    language: row.language,
    sourceUrl: row.sourceUrl,
    license: row.license,
    versification: row.versification as ScriptureVersification,
    version: row.version,
    verseCount: row.verseCount,
  };
}

function toBookInfo(row: ScriptureBookRow): ScriptureBookInfo {
  return {
    slug: row.slug,
    name: row.name,
    fullTitle: row.fullTitle,
    heading: row.heading,
    volume: row.volume,
    volumeTitle: row.volumeTitle,
    chapterCount: row.chapterCount,
    abbreviations: row.abbreviations,
  };
}

/** Display name for references: the first abbreviation, else the name. */
function shortName(book: { name: string; abbreviations: string[] }): string {
  return book.abbreviations[0] ?? book.name;
}

// ── Catalog / install / enable ──────────────────────────────────────────

export async function listCatalog(userId: string): Promise<ScriptureCatalogItem[]> {
  const [installed, enabled] = await Promise.all([
    scriptureDb.corpus.findMany({ where: {} }),
    scriptureDb.userCorpus.findMany({ where: { userId } }),
  ]);
  const installedById = new Map(installed.map((row) => [row.id, row]));
  const enabledIds = new Set(enabled.map((row) => row.corpusId));
  return SCRIPTURE_CATALOG.map((entry) => {
    const row = installedById.get(entry.id);
    return {
      ...entry,
      installed: Boolean(row && row.verseCount > 0),
      enabled: enabledIds.has(entry.id),
      verseCount: row?.verseCount ?? 0,
    };
  });
}

/** The corpora this user reads (installed + enabled), catalog order. */
export async function listEnabledCorpora(userId: string): Promise<ScriptureCorpusInfo[]> {
  const enabled = await scriptureDb.userCorpus.findMany({ where: { userId } });
  if (!enabled.length) return [];
  const rows = await scriptureDb.corpus.findMany({
    where: { id: { in: enabled.map((row) => row.corpusId) }, verseCount: { gt: 0 } },
  });
  const order = new Map(SCRIPTURE_CATALOG.map((entry, index) => [entry.id, index]));
  return rows
    .map(toCorpusInfo)
    .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
}

export async function setCorpusEnabled(userId: string, corpusId: string, enabled: boolean): Promise<void> {
  if (!enabled) {
    await scriptureDb.userCorpus.deleteMany({ where: { userId, corpusId } });
    return;
  }
  const corpus = await scriptureDb.corpus.findUnique({ where: { id: corpusId } });
  if (!corpus || corpus.verseCount === 0) {
    throw new ScriptureError("That collection isn't loaded yet — use Add in the scripture catalog.", 409);
  }
  await scriptureDb.userCorpus.upsert({
    where: { userId_corpusId: { userId, corpusId } },
    create: { userId, corpusId },
    update: {},
  });
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new ScriptureError(`Could not download ${url} (${response.status})`, 502);
  return response.json();
}

/** Longest an install may hold its transaction (fetch happens before it). */
const INSTALL_TX_TIMEOUT_MS = 120_000;

/**
 * Load a corpus into the shared tables. Any signed-in user may: the text is
 * pinned public-domain data, so an install can't change what gets written —
 * it only makes the collection available. LDS is the only adapter so far; the
 * catalog marks the rest "planned".
 *
 * Concurrency: the write runs in ONE transaction holding a per-corpus
 * advisory lock. Simultaneous installs queue; the second finds the first's
 * finished corpus and returns. A failure rolls back — readers never see a
 * half-filled collection. (`verseCount` is still written last, so a corpus
 * left at 0 by anything else is rebuilt.)
 */
export async function installCorpus(corpusId: string): Promise<{ verseCount: number; alreadyInstalled: boolean }> {
  const entry = catalogEntry(corpusId);
  if (!entry) throw new ScriptureError("Unknown collection", 404);
  if (entry.status !== "available") throw new ScriptureError(`${entry.title} isn't available to install yet.`, 409);

  const existing = await scriptureDb.corpus.findUnique({ where: { id: corpusId } });
  if (existing && existing.verseCount > 0) return { verseCount: existing.verseCount, alreadyInstalled: true };

  if (corpusId !== LDS_CORPUS_ID) throw new ScriptureError("No adapter for that collection yet.", 501);

  // Fetch and normalize everything before touching the database (and before
  // taking the lock — the network is the slow part).
  const books: NormalizedBook[] = [];
  const verses: NormalizedVerse[] = [];
  const versions: string[] = [];
  for (const volume of LDS_VOLUMES) {
    const normalized = normalizeLdsVolume(volume.slug, (await fetchJson(ldsVolumeUrl(volume.file))) as RawLdsVolume);
    books.push(...normalized.books);
    verses.push(...normalized.verses);
    versions.push(`${volume.slug}@${normalized.version}`);
  }

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`scripture-install:${corpusId}`}))`;
      // Someone else may have finished while we waited for the lock.
      const current = await tx.scriptureCorpus.findUnique({ where: { id: corpusId } });
      if (current && current.verseCount > 0) return { verseCount: current.verseCount, alreadyInstalled: true };

      await tx.scriptureVerse.deleteMany({ where: { corpusId } });
      await tx.scriptureBook.deleteMany({ where: { corpusId } });
      await tx.scriptureCorpus.upsert({
        where: { id: corpusId },
        create: {
          id: corpusId,
          tradition: entry.tradition,
          title: entry.title,
          language: entry.language,
          sourceUrl: entry.sourceUrl,
          license: entry.license,
          versification: entry.versification,
          version: versions.join(" "),
          verseCount: 0,
        },
        update: { version: versions.join(" "), verseCount: 0 },
      });
      await tx.scriptureBook.createMany({
        data: books.map((book, ordinal) => ({ ...book, corpusId, ordinal })),
      });
      for (let start = 0; start < verses.length; start += VERSE_BATCH) {
        await tx.scriptureVerse.createMany({
          data: verses.slice(start, start + VERSE_BATCH).map((verse, offset) => ({
            ...verse,
            corpusId,
            ordinal: start + offset,
          })),
        });
      }
      // Full-text vectors for search (GIN-indexed; see ScriptureVerse).
      await tx.$executeRaw`
        UPDATE "ScriptureVerse"
        SET "searchEnglish" = to_tsvector('english'::regconfig, "text"),
            "searchSimple" = to_tsvector('simple'::regconfig, "text")
        WHERE "corpusId" = ${corpusId}`;
      await tx.scriptureCorpus.update({ where: { id: corpusId }, data: { verseCount: verses.length } });
      return { verseCount: verses.length, alreadyInstalled: false };
    },
    { timeout: INSTALL_TX_TIMEOUT_MS, maxWait: INSTALL_TX_TIMEOUT_MS }
  );
}

// ── Reading ─────────────────────────────────────────────────────────────

async function requireCorpus(corpusId: string): Promise<ScriptureCorpusRow> {
  const corpus = await scriptureDb.corpus.findUnique({ where: { id: corpusId } });
  if (!corpus || corpus.verseCount === 0) throw new ScriptureError("That collection isn't installed.", 404);
  return corpus;
}

async function corpusBooks(corpusId: string): Promise<ScriptureBookRow[]> {
  return scriptureDb.book.findMany({ where: { corpusId }, orderBy: { ordinal: "asc" } });
}

export async function getContents(corpusId: string): Promise<ScriptureContents> {
  const corpus = await requireCorpus(corpusId);
  const books = await corpusBooks(corpusId);
  const volumes: ScriptureContents["volumes"] = [];
  for (const book of books) {
    let volume = volumes.find((entry) => entry.slug === book.volume);
    if (!volume) {
      volume = { slug: book.volume, title: book.volumeTitle, books: [] };
      volumes.push(volume);
    }
    volume.books.push(toBookInfo(book));
  }
  return { corpus: toCorpusInfo(corpus), volumes };
}

function chapterLabelFor(book: ScriptureBookRow): string {
  return book.volume === "dc-testament" ? "Section" : "Chapter";
}

function chapterTitle(book: ScriptureBookRow, chapter: number): string {
  return book.chapterCount === 1 ? book.name : `${book.name} ${chapter}`;
}

export async function getChapter(corpusId: string, bookSlug: string, chapter: number): Promise<ScriptureChapterDto> {
  const corpus = await requireCorpus(corpusId);
  const books = await corpusBooks(corpusId);
  const index = books.findIndex((book) => book.slug === bookSlug);
  if (index < 0) throw new ScriptureError("No such book", 404);
  const book = books[index];
  if (chapter < 1 || chapter > book.chapterCount) throw new ScriptureError("No such chapter", 404);
  const verses = await scriptureDb.verse.findMany({
    where: { corpusId, bookSlug, chapter },
    orderBy: { verse: "asc" },
  });

  const prevBook = chapter > 1 ? book : books[index - 1] ?? null;
  const prevChapter = chapter > 1 ? chapter - 1 : prevBook?.chapterCount ?? 0;
  const nextBook = chapter < book.chapterCount ? book : books[index + 1] ?? null;
  const nextChapter = chapter < book.chapterCount ? chapter + 1 : 1;

  return {
    corpusId,
    book: toBookInfo(book),
    chapter,
    chapterLabel: chapterLabelFor(book),
    verses: verses.map((row) => ({ verse: row.verse, text: row.text })),
    prev: prevBook ? { bookSlug: prevBook.slug, chapter: prevChapter, label: chapterTitle(prevBook, prevChapter) } : null,
    next: nextBook ? { bookSlug: nextBook.slug, chapter: nextChapter, label: chapterTitle(nextBook, nextChapter) } : null,
    fraction: verses.length ? verses[0].ordinal / Math.max(1, corpus.verseCount) : 0,
  };
}

// ── References and search ───────────────────────────────────────────────

async function bookIndex(corpusId: string): Promise<{ index: BookIndex; books: ScriptureBookRow[] }> {
  const books = await corpusBooks(corpusId);
  return {
    books,
    index: buildBookIndex(books.map((book) => ({ ...book, chapters: book.chapterCount }))),
  };
}

/** Parse "Alma 32:21–23; 33" against a corpus and fetch the verse text. */
export async function resolveReferences(corpusId: string, text: string, maxVerses = 60): Promise<ScriptureResolvedReference[]> {
  await requireCorpus(corpusId);
  const { index, books } = await bookIndex(corpusId);
  const bookBySlug = new Map(books.map((book) => [book.slug, book]));
  const refs = parseReferenceList(text, index);
  const resolved: ScriptureResolvedReference[] = [];
  let budget = maxVerses;
  for (const ref of refs) {
    if (budget <= 0) break;
    const where: Record<string, unknown> = { corpusId, bookSlug: ref.bookSlug, chapter: ref.chapter ?? 1 };
    if (ref.verseStart != null) where.verse = { gte: ref.verseStart, lte: ref.verseEnd ?? ref.verseStart };
    const rows = await scriptureDb.verse.findMany({ where, orderBy: { verse: "asc" }, take: budget });
    budget -= rows.length;
    if (!rows.length) continue;
    const book = bookBySlug.get(ref.bookSlug);
    resolved.push({
      ref,
      label: formatReference(ref, () => (book ? shortName(book) : ref.bookSlug)),
      verses: rows.map((row) => ({ chapter: row.chapter, verse: row.verse, text: row.text })),
    });
  }
  return resolved;
}

/** Markers ts_headline wraps around matched words (never in scripture text). */
const HIT_OPEN = "\u0001";
const HIT_CLOSE = "\u0002";

/** Split a ts_headline result into plain and matched runs. */
function highlightRuns(headline: string): Array<{ text: string; hit: boolean }> {
  const runs: Array<{ text: string; hit: boolean }> = [];
  for (const [index, piece] of headline.split(new RegExp(`[${HIT_OPEN}${HIT_CLOSE}]`)).entries()) {
    if (piece) runs.push({ text: piece, hit: index % 2 === 1 });
  }
  return runs;
}

/** Books (and one-book volumes) whose names contain the query: "nephi" → 1–4 Nephi. */
function matchBooks(books: ScriptureBookRow[], query: string): ScriptureBookMatch[] {
  const key = normalizeBookKey(query);
  if (key.length < 3) return [];
  return books
    .filter((book) =>
      [book.name, book.fullTitle, book.volumeTitle, ...book.abbreviations].some((name) =>
        normalizeBookKey(name).includes(key)
      )
    )
    .slice(0, 8)
    .map((book) => ({ slug: book.slug, name: book.name, volumeTitle: book.volumeTitle, chapterCount: book.chapterCount }));
}

interface SearchRow {
  bookSlug: string;
  chapter: number;
  verse: number;
  text: string;
  headline: string | null;
  total: bigint | number;
}

/**
 * Search a corpus the way the Church's site does: words, not substrings
 * ("Alma" no longer matches "Talmai"), in any order, with word forms, ranked
 * by relevance — plus the passage when the query is a reference and the books
 * whose names match. Postgres full-text search over stored, GIN-indexed
 * vectors (ScriptureVerse.searchEnglish stems word forms for smart search;
 * searchSimple keeps exact whole words), ranked with ts_rank, highlighted
 * with ts_headline.
 * If word search finds nothing (a query of only stop-words, a fragment), a
 * plain substring match stands in and says so.
 */
export async function searchCorpus(
  corpusId: string,
  query: string,
  options: ScriptureSearchOptions = {},
  limit = 50
): Promise<ScriptureSearchResult> {
  const q = query.trim();
  const empty: ScriptureSearchResult = { reference: null, books: [], hits: [], total: 0, matchedBy: "words" };
  if (!q) return empty;
  await requireCorpus(corpusId);
  const { index, books } = await bookIndex(corpusId);
  const bookBySlug = new Map(books.map((book) => [book.slug, book]));
  const mode = options.mode ?? "smart";
  const sort = options.sort ?? "relevance";
  const volume = options.volume && books.some((book) => book.volume === options.volume) ? options.volume : null;

  let reference: ScriptureResolvedReference | null = null;
  const parsed = parseReference(q, index);
  if (parsed && parsed.chapter != null) {
    reference = (await resolveReferences(corpusId, q, 30))[0] ?? null;
  }
  // A reference is a place, not words: return the passage and stop.
  if (reference) return { ...empty, reference };
  const bookMatches = matchBooks(volume ? books.filter((book) => book.volume === volume) : books, q);

  const config = mode === "smart" ? "english" : "simple";
  const tsQuery =
    mode === "exact"
      ? Prisma.sql`phraseto_tsquery(${config}::regconfig, ${q})`
      : mode === "all"
        ? Prisma.sql`plainto_tsquery(${config}::regconfig, ${q})`
        : mode === "any"
          ? Prisma.sql`websearch_to_tsquery(${config}::regconfig, ${q.split(/\s+/).filter(Boolean).join(" or ")})`
          : Prisma.sql`websearch_to_tsquery(${config}::regconfig, ${q})`;
  const volumeFilter = volume
    ? Prisma.sql`AND v."bookSlug" IN (SELECT b.slug FROM "ScriptureBook" b WHERE b."corpusId" = ${corpusId} AND b.volume = ${volume})`
    : Prisma.empty;
  const order = sort === "relevance" ? Prisma.sql`m.rank DESC, m.ordinal ASC` : Prisma.sql`m.ordinal ASC`;
  // The stored, GIN-indexed vector for this config (filled on install).
  const vector = config === "english" ? Prisma.raw(`v."searchEnglish"`) : Prisma.raw(`v."searchSimple"`);
  const headlineOptions = `StartSel=${HIT_OPEN}, StopSel=${HIT_CLOSE}, HighlightAll=true`;

  const rows = await prisma.$queryRaw<SearchRow[]>`
    WITH query AS (SELECT ${tsQuery} AS tsq),
    m AS (
      SELECT v."bookSlug", v.chapter, v.verse, v.text, v.ordinal,
             ts_rank(${vector}, query.tsq) AS rank
      FROM "ScriptureVerse" v, query
      WHERE v."corpusId" = ${corpusId} ${volumeFilter}
        AND ${vector} @@ query.tsq
    )
    SELECT m."bookSlug", m.chapter, m.verse, m.text,
           ts_headline(${config}::regconfig, m.text, query.tsq, ${headlineOptions}) AS headline,
           count(*) OVER () AS total
    FROM m, query
    ORDER BY ${order}
    LIMIT ${limit}`;

  let matchedBy: ScriptureSearchResult["matchedBy"] = "words";
  let found: SearchRow[] = rows;
  if (!found.length && mode !== "exact") {
    // Nothing as words (only stop-words, a fragment): plain substring instead.
    matchedBy = "substring";
    const pattern = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    found = await prisma.$queryRaw<SearchRow[]>`
      SELECT v."bookSlug", v.chapter, v.verse, v.text, NULL AS headline, count(*) OVER () AS total
      FROM "ScriptureVerse" v
      WHERE v."corpusId" = ${corpusId} ${volumeFilter} AND v.text ILIKE ${pattern}
      ORDER BY v.ordinal ASC
      LIMIT ${limit}`;
  }

  const hits = found.map<ScriptureSearchHit>((row) => {
    const book = bookBySlug.get(row.bookSlug);
    return {
      bookSlug: row.bookSlug,
      bookName: book?.name ?? row.bookSlug,
      chapter: row.chapter,
      verse: row.verse,
      text: row.text,
      reference: formatReference(
        { bookSlug: row.bookSlug, chapter: row.chapter, verseStart: row.verse, verseEnd: row.verse },
        () => (book ? shortName(book) : row.bookSlug)
      ),
      ...(row.headline ? { highlights: highlightRuns(row.headline) } : {}),
    };
  });
  return { reference, books: bookMatches, hits, total: Number(found[0]?.total ?? 0), matchedBy };
}

/** A book's chapters as cards: verse counts and each chapter's first verse. */
export async function getBookChapters(corpusId: string, bookSlug: string): Promise<ScriptureBookChapters> {
  await requireCorpus(corpusId);
  const book = await scriptureDb.book.findFirst({ where: { corpusId, slug: bookSlug } });
  if (!book) throw new ScriptureError("No such book", 404);
  const [counts, openings] = await Promise.all([
    scriptureDb.verse.groupBy({ by: ["chapter"], where: { corpusId, bookSlug }, _count: { _all: true } }),
    scriptureDb.verse.findMany({ where: { corpusId, bookSlug, verse: 1 }, orderBy: { chapter: "asc" } }),
  ]);
  const countByChapter = new Map(
    counts.map((row) => [Number(row.chapter), Number((row._count as { _all?: number } | undefined)?._all ?? 0)])
  );
  return {
    book: toBookInfo(book),
    chapterLabel: chapterLabelFor(book),
    chapters: openings.map((row) => ({
      chapter: row.chapter,
      verseCount: countByChapter.get(row.chapter) ?? 0,
      opening: row.text.length > 220 ? `${row.text.slice(0, 219)}…` : row.text,
    })),
  };
}

/** Plain text of a chapter (speed reading, AI excerpts). */
export async function chapterText(corpusId: string, bookSlug: string, chapter: number): Promise<string> {
  const rows = await scriptureDb.verse.findMany({
    where: { corpusId, bookSlug, chapter },
    orderBy: { verse: "asc" },
  });
  return rows.map((row) => `${row.verse} ${row.text}`).join("\n");
}
