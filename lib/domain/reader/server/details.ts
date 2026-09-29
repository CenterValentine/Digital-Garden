/**
 * Book details enrichment (server-only).
 *
 * Search results carry whatever the source returned — often no description.
 * When the user opens a book's panel we fill the gaps, cheapest source first:
 *
 *   1. the source's own detail record (Open Library work, Gutendex book,
 *      Google Books volume, Wikisource page summary)
 *   2. Open Library, by ISBN or title + author
 *   3. Google Books by ISBN / title (only when the user connected a key —
 *      anonymous calls are rate-limited to uselessness)
 *
 * The longest clean description wins and names its source. Results are cached
 * in-process (details don't change), and a library book with no stored
 * description is back-filled so "About this book" works offline afterwards.
 */

import "server-only";
import { readerDb } from "../db";
import type { BookDetails, BookDetailsQuery } from "../types";
import { readerFetchJson } from "./http";
import { googleBooksKey } from "./sources";

const CACHE_LIMIT = 500;
const cache = new Map<string, BookDetails>();

function remember(key: string, details: BookDetails): BookDetails {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, details);
  return details;
}

/** Strip HTML and boilerplate; null when nothing useful remains. */
export function cleanDescription(raw: unknown): string | null {
  const value =
    typeof raw === "string"
      ? raw
      : raw && typeof raw === "object" && "value" in raw
        ? String((raw as { value: unknown }).value)
        : null;
  if (!value) return null;
  const text = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // Open Library appends source links / "See also" blocks in markdown.
    .replace(/\n-{3,}[\s\S]*$/, "")
    .replace(/\(\[source\]\[\d+\]\)/gi, "")
    .replace(/\[\d+\]:\s*\S+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length >= 40 ? text.slice(0, 6000) : null;
}

interface Candidate {
  description: string | null;
  source: string;
  subjects?: string[];
  pageCount?: number | null;
  publisher?: string | null;
  publishedYear?: number | null;
  isbn?: string | null;
  coverUrl?: string | null;
}

async function safe<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch {
    return null;
  }
}

// ── Open Library ───────────────────────────────────────────────────────────

interface OpenLibraryWork {
  description?: unknown;
  subjects?: string[];
  first_publish_date?: string;
  covers?: number[];
}

async function openLibraryWork(workId: string): Promise<Candidate | null> {
  const id = workId.replace(/^\/?works\//, "");
  if (!/^OL\d+W$/.test(id)) return null;
  const work = await readerFetchJson<OpenLibraryWork>(`https://openlibrary.org/works/${id}.json`);
  return {
    description: cleanDescription(work.description),
    source: "Open Library",
    subjects: (work.subjects ?? []).slice(0, 12),
    publishedYear: Number(work.first_publish_date?.match(/\d{4}/)?.[0]) || null,
    coverUrl: work.covers?.[0] ? `https://covers.openlibrary.org/b/id/${work.covers[0]}-L.jpg` : null,
  };
}

async function openLibraryLookup(query: BookDetailsQuery): Promise<Candidate | null> {
  const params = new URLSearchParams({ fields: "key,isbn,number_of_pages_median,publisher", limit: "1" });
  if (query.isbn) params.set("isbn", query.isbn);
  else {
    params.set("title", query.title);
    if (query.author) params.set("author", query.author);
  }
  const found = await readerFetchJson<{
    docs: Array<{ key: string; isbn?: string[]; number_of_pages_median?: number; publisher?: string[] }>;
  }>(`https://openlibrary.org/search.json?${params.toString()}`);
  const doc = found.docs[0];
  if (!doc) return null;
  const work = await safe(() => openLibraryWork(doc.key));
  return {
    description: work?.description ?? null,
    source: "Open Library",
    subjects: work?.subjects,
    publishedYear: work?.publishedYear,
    coverUrl: work?.coverUrl,
    pageCount: doc.number_of_pages_median ?? null,
    publisher: doc.publisher?.[0] ?? null,
    isbn: doc.isbn?.find((isbn) => isbn.length === 13) ?? null,
  };
}

// ── Gutenberg (via Gutendex) ───────────────────────────────────────────────

async function gutendexBook(id: string): Promise<Candidate | null> {
  if (!/^\d+$/.test(id)) return null;
  const book = await readerFetchJson<{ summaries?: string[]; subjects?: string[]; bookshelves?: string[] }>(
    `https://gutendex.com/books/${id}`,
    { timeoutMs: 15_000 }
  );
  return {
    description: cleanDescription(book.summaries?.[0]),
    source: "Project Gutenberg",
    subjects: [...(book.subjects ?? []), ...(book.bookshelves ?? [])]
      .map((subject) => subject.replace(/^Browsing:\s*/, "").replace(/ -- .*$/, ""))
      .filter((subject, index, all) => all.indexOf(subject) === index)
      .slice(0, 12),
  };
}

// ── Google Books ───────────────────────────────────────────────────────────

interface GoogleVolumeInfo {
  description?: string;
  categories?: string[];
  pageCount?: number;
  publisher?: string;
  publishedDate?: string;
  industryIdentifiers?: Array<{ type: string; identifier: string }>;
  imageLinks?: { thumbnail?: string };
}

function googleCandidate(info: GoogleVolumeInfo): Candidate {
  return {
    description: cleanDescription(info.description),
    source: "Google Books",
    subjects: info.categories ?? [],
    pageCount: info.pageCount ?? null,
    publisher: info.publisher ?? null,
    publishedYear: Number(info.publishedDate?.slice(0, 4)) || null,
    isbn: info.industryIdentifiers?.find((id) => id.type === "ISBN_13")?.identifier ?? null,
    coverUrl: info.imageLinks?.thumbnail?.replace(/^http:/, "https:") ?? null,
  };
}

async function googleVolume(id: string, key?: string): Promise<Candidate | null> {
  const volume = await readerFetchJson<{ volumeInfo: GoogleVolumeInfo }>(
    `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}${key ? `?key=${encodeURIComponent(key)}` : ""}`
  );
  return googleCandidate(volume.volumeInfo);
}

async function googleLookup(query: BookDetailsQuery, key: string): Promise<Candidate | null> {
  const q = query.isbn
    ? `isbn:${query.isbn}`
    : `intitle:${query.title}${query.author ? ` inauthor:${query.author}` : ""}`;
  const found = await readerFetchJson<{ items?: Array<{ volumeInfo: GoogleVolumeInfo }> }>(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1&key=${encodeURIComponent(key)}`
  );
  return found.items?.[0] ? googleCandidate(found.items[0].volumeInfo) : null;
}

// ── Wikisource ─────────────────────────────────────────────────────────────

async function wikisourceSummary(title: string): Promise<Candidate | null> {
  const page = await readerFetchJson<{ extract?: string }>(
    `https://en.wikisource.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`
  );
  return { description: cleanDescription(page.extract), source: "Wikisource" };
}

// ── Merge ──────────────────────────────────────────────────────────────────

function merge(candidates: Array<Candidate | null>): BookDetails {
  const present = candidates.filter((candidate): candidate is Candidate => Boolean(candidate));
  const best = present
    .filter((candidate) => candidate.description)
    .sort((a, b) => (b.description?.length ?? 0) - (a.description?.length ?? 0))[0];
  const first = <K extends keyof Candidate>(key: K): Candidate[K] | null =>
    present.find((candidate) => candidate[key] !== undefined && candidate[key] !== null && candidate[key] !== "")?.[key] ?? null;
  const subjects = present
    .flatMap((candidate) => candidate.subjects ?? [])
    .filter((subject, index, all) => subject && all.findIndex((s) => s.toLowerCase() === subject.toLowerCase()) === index)
    .slice(0, 12);
  return {
    description: best?.description ?? null,
    descriptionSource: best?.source ?? null,
    subjects,
    pageCount: first("pageCount") as number | null,
    publisher: first("publisher") as string | null,
    publishedYear: first("publishedYear") as number | null,
    isbn: first("isbn") as string | null,
    coverUrl: first("coverUrl") as string | null,
  };
}

function gutenbergId(query: BookDetailsQuery): string | null {
  if (query.sourceId === "gutendex" && query.entryId) return query.entryId;
  if (query.sourceId === "opds:preset:gutenberg" && query.entryId) {
    return query.entryId.match(/(\d+)/)?.[1] ?? null;
  }
  return null;
}

export async function getBookDetails(
  ownerId: string,
  query: BookDetailsQuery
): Promise<BookDetails> {
  const cacheKey = JSON.stringify([
    query.sourceId,
    query.entryId,
    query.isbn,
    query.openLibraryId,
    query.title.toLowerCase(),
    query.author?.toLowerCase(),
  ]);
  let details = cache.get(cacheKey);

  if (!details) {
    const key = await googleBooksKey(ownerId);
    const primary: Array<Promise<Candidate | null>> = [];
    const gutenberg = gutenbergId(query);
    if (gutenberg) primary.push(safe(() => gutendexBook(gutenberg)));
    if (query.sourceId === "openlibrary" && query.entryId) {
      primary.push(safe(() => openLibraryWork(query.entryId!)));
    } else if (query.openLibraryId) {
      primary.push(safe(() => openLibraryWork(query.openLibraryId!)));
    }
    if (query.sourceId === "google-books" && query.entryId) {
      primary.push(safe(() => googleVolume(query.entryId!, key)));
    }
    if (query.sourceId === "wikisource") primary.push(safe(() => wikisourceSummary(query.title)));

    let candidates = await Promise.all(primary);
    if (!candidates.some((candidate) => candidate?.description)) {
      candidates = [
        ...candidates,
        ...(await Promise.all([
          safe(() => openLibraryLookup(query)),
          key ? safe(() => googleLookup(query, key)) : Promise.resolve(null),
        ])),
      ];
    }
    details = remember(cacheKey, merge(candidates));
  }

  if (query.contentId && details.description) {
    await backfillBookMeta(ownerId, query.contentId, details).catch(() => undefined);
  }
  return details;
}

/** Fill empty BookMeta fields from enriched details (never overwrite). */
async function backfillBookMeta(
  ownerId: string,
  contentId: string,
  details: BookDetails
): Promise<void> {
  const meta = await readerDb.bookMeta.findFirst({ where: { contentId, ownerId } });
  if (!meta) return;
  const data: Record<string, unknown> = {};
  if (!meta.description && details.description) data.description = details.description;
  if (!meta.isbn && details.isbn) data.isbn = details.isbn;
  if (!meta.publisher && details.publisher) data.publisher = details.publisher;
  if (!meta.publishedYear && details.publishedYear) data.publishedYear = details.publishedYear;
  if (!meta.coverUrl && details.coverUrl) data.coverUrl = details.coverUrl;
  if (Object.keys(data).length) {
    await readerDb.bookMeta.update({ where: { contentId }, data });
  }
}
