/**
 * Reader integrations (server-only): bring-your-own-token connections to
 * Readwise, Hardcover and Google Books, plus highlight imports (Kindle
 * clippings file, Readwise export).
 *
 * Imported highlights attach to the matching library book when one exists
 * (annotations with a text-only locator — they can't jump to a spot); for a
 * book that isn't in the library they land as quotes in an ordinary note
 * "<Title> — Highlights" in the Books folder (Principle 2: into the notes).
 */

import "server-only";
import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { generateUniqueSlug } from "@/lib/domain/content";
import { extractSearchTextFromTipTap } from "@/lib/domain/content/search-text";
import { writeNoteContent } from "@/lib/domain/content/write-note-content";
import {
  decrypt,
  encrypt,
  maskSensitiveValue,
} from "@/lib/infrastructure/crypto/encryption";
import { readerDb } from "../db";
import {
  kindleClippingId,
  normalizeBookTitle,
  parseKindleClippings,
} from "../kindle-clippings";
import {
  contentTargetKey,
  type HighlightImportSummary,
  type ReaderConnectionDto,
  type ReaderConnectionProvider,
  type ReaderLocator,
  type ReadingStatus,
} from "../types";
import { ReaderFetchError, readerFetch, readerFetchJson } from "./http";
import { ensureLibraryFolder } from "./library";

// ── Connections ────────────────────────────────────────────────────────────

async function tokenFor(
  ownerId: string,
  provider: ReaderConnectionProvider
): Promise<string | null> {
  const row = await readerDb.readerConnection.findFirst({ where: { ownerId, provider } });
  if (!row) return null;
  const { token } = decrypt(row.tokenEncrypted) as { token?: string };
  return token ?? null;
}

export async function listConnections(ownerId: string): Promise<ReaderConnectionDto[]> {
  const rows = await readerDb.readerConnection.findMany({ where: { ownerId } });
  return (["readwise", "hardcover", "google-books"] as const).map((provider) => {
    const row = rows.find((candidate) => candidate.provider === provider);
    let hint: string | null = null;
    if (row) {
      const { token } = decrypt(row.tokenEncrypted) as { token?: string };
      hint = token ? maskSensitiveValue(token) : null;
    }
    return {
      provider,
      connected: Boolean(row),
      lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
      hint,
    };
  });
}

async function validateToken(provider: ReaderConnectionProvider, token: string): Promise<void> {
  switch (provider) {
    case "readwise": {
      // 204 when the token is valid.
      await readerFetch("https://readwise.io/api/v2/auth/", {
        headers: { Authorization: `Token ${token}` },
      });
      return;
    }
    case "hardcover": {
      const data = await hardcoverQuery<{ me?: Array<{ id: number }> | { id: number } }>(
        token,
        "query { me { id } }"
      );
      if (!data.me) throw new ReaderFetchError("Hardcover rejected the token", 401);
      return;
    }
    case "google-books": {
      await readerFetchJson(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:9780141439518&maxResults=1&key=${encodeURIComponent(token)}`
      );
      return;
    }
  }
}

export async function saveConnection(
  ownerId: string,
  provider: ReaderConnectionProvider,
  token: string
): Promise<ReaderConnectionDto> {
  const trimmed = token.trim().replace(/^(Bearer|Token)\s+/i, "");
  if (!trimmed) throw new ReaderFetchError("Token is required", 400);
  await validateToken(provider, trimmed);
  await readerDb.readerConnection.upsert({
    where: { ownerId_provider: { ownerId, provider } },
    create: { ownerId, provider, tokenEncrypted: encrypt({ token: trimmed }) },
    update: { tokenEncrypted: encrypt({ token: trimmed }) },
  });
  return {
    provider,
    connected: true,
    lastSyncedAt: null,
    hint: maskSensitiveValue(trimmed),
  };
}

export async function deleteConnection(
  ownerId: string,
  provider: ReaderConnectionProvider
): Promise<void> {
  await readerDb.readerConnection.deleteMany({ where: { ownerId, provider } });
}

// ── Highlight import core ──────────────────────────────────────────────────

interface ImportHighlight {
  externalId: string;
  text: string;
  note?: string;
  label?: string;
  color?: string;
  kind: "highlight" | "note" | "bookmark";
}

interface ImportBook {
  title: string;
  author?: string;
  highlights: ImportHighlight[];
}

async function libraryIndex(ownerId: string): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  const metas = await readerDb.bookMeta.findMany({
    where: { ownerId, content: { deletedAt: null } },
    take: 5000,
  });
  for (const meta of metas) index.set(normalizeBookTitle(meta.title), meta.contentId);
  return index;
}

async function existingExternalIds(
  ownerId: string,
  source: "kindle" | "readwise",
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await readerDb.readerAnnotation.findMany({
    where: { ownerId, source, externalId: { in: ids } },
    take: ids.length,
  });
  return new Set(rows.map((row) => row.externalId).filter((id): id is string => Boolean(id)));
}

function highlightBlocks(highlights: ImportHighlight[]): JSONContent[] {
  return highlights.flatMap<JSONContent>((highlight) => {
    const blocks: JSONContent[] = [
      {
        type: "blockquote",
        content: [{ type: "paragraph", content: [{ type: "text", text: highlight.text }] }],
      },
    ];
    const caption = [highlight.label, highlight.note].filter(Boolean).join(" — ");
    if (caption) {
      blocks.push({ type: "paragraph", content: [{ type: "text", text: caption }] });
    }
    return blocks;
  });
}

/** Append to (or create) "<Title> — Highlights" in the Books folder. */
async function appendHighlightsNote(
  ownerId: string,
  book: ImportBook,
  highlights: ImportHighlight[],
  sourceLabel: string
): Promise<void> {
  const folderId = await ensureLibraryFolder(ownerId);
  const title = `${book.title} — Highlights`.slice(0, 255);
  const blocks = highlightBlocks(highlights);
  const existing = await prisma.contentNode.findFirst({
    where: { ownerId, parentId: folderId, title, contentType: "note", deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    await writeNoteContent({
      contentId: existing.id,
      ownerId,
      mode: "append",
      content: { type: "doc", content: blocks },
    });
    return;
  }
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `${book.author ? `${book.author} · ` : ""}imported from ${sourceLabel}`,
          },
        ],
      },
      ...blocks,
    ],
  };
  await prisma.contentNode.create({
    data: {
      ownerId,
      title,
      slug: await generateUniqueSlug(title, ownerId),
      contentType: "note",
      parentId: folderId,
      displayOrder: 0,
      notePayload: {
        create: {
          tiptapJson: doc as unknown as Prisma.InputJsonValue,
          searchText: extractSearchTextFromTipTap(doc),
          metadata: { readerImport: sourceLabel },
        },
      },
    },
  });
}

async function importHighlights(
  ownerId: string,
  source: "kindle" | "readwise",
  books: ImportBook[]
): Promise<HighlightImportSummary> {
  const index = await libraryIndex(ownerId);
  const summary: HighlightImportSummary = { books: books.length, created: 0, skipped: 0, unmatchedBooks: [] };
  const sourceLabel = source === "kindle" ? "Kindle" : "Readwise";

  for (const book of books) {
    const known = await existingExternalIds(
      ownerId,
      source,
      book.highlights.map((highlight) => highlight.externalId)
    );
    const fresh = book.highlights.filter((highlight) => !known.has(highlight.externalId));
    summary.skipped += book.highlights.length - fresh.length;
    if (fresh.length === 0) continue;

    const contentId = index.get(normalizeBookTitle(book.title));
    if (!contentId) {
      summary.unmatchedBooks.push(book.title);
      const quotable = fresh.filter((highlight) => highlight.kind !== "bookmark" && highlight.text);
      if (quotable.length) await appendHighlightsNote(ownerId, book, quotable, sourceLabel);
    }
    // Always record the annotation rows (idempotency ledger). Unmatched books
    // get a `import:` target key so a later library match can adopt them.
    const targetKey = contentId
      ? contentTargetKey(contentId)
      : `import:${normalizeBookTitle(book.title).slice(0, 200) || "untitled"}`;
    for (const highlight of fresh) {
      const locator: ReaderLocator = {
        locations: {},
        text: { highlight: highlight.text.slice(0, 20000) },
        label: highlight.label,
      };
      await readerDb.readerAnnotation.create({
        data: {
          ownerId,
          targetKey,
          kind: highlight.kind,
          locator,
          color: highlight.color ?? "yellow",
          body: highlight.note ?? null,
          source,
          externalId: highlight.externalId,
        },
      });
      summary.created++;
    }
  }
  return summary;
}

// ── Kindle ─────────────────────────────────────────────────────────────────

export async function importKindleClippings(
  ownerId: string,
  raw: string
): Promise<HighlightImportSummary> {
  const parsed = parseKindleClippings(raw);
  if (parsed.length === 0) {
    throw new ReaderFetchError("No clippings found — is this a Kindle 'My Clippings.txt' file?", 400);
  }
  const books: ImportBook[] = parsed.map((book) => {
    // Kindle writes a note as its own clipping right after the highlight it
    // belongs to; fold it into that highlight.
    const highlights: ImportHighlight[] = [];
    for (const clipping of book.clippings) {
      const label = clipping.location
        ? `Location ${clipping.location}`
        : clipping.page
          ? `Page ${clipping.page}`
          : undefined;
      const previous = highlights[highlights.length - 1];
      if (clipping.kind === "note" && previous && previous.kind === "highlight" && !previous.note) {
        previous.note = clipping.text;
        continue;
      }
      highlights.push({
        externalId: kindleClippingId(clipping),
        text: clipping.text,
        label,
        kind: clipping.kind,
      });
    }
    return { title: book.title, author: book.author, highlights };
  });
  return importHighlights(ownerId, "kindle", books);
}

// ── Readwise ───────────────────────────────────────────────────────────────

interface ReadwiseExportPage {
  nextPageCursor: string | null;
  results: Array<{
    user_book_id: number;
    title: string;
    readable_title?: string;
    author?: string;
    category?: string;
    highlights: Array<{
      id: number;
      text: string;
      note?: string;
      location?: number;
      location_type?: string;
      color?: string;
      is_deleted?: boolean;
    }>;
  }>;
}

export async function importReadwise(ownerId: string): Promise<HighlightImportSummary> {
  const token = await tokenFor(ownerId, "readwise");
  if (!token) throw new ReaderFetchError("Connect Readwise first", 400);
  const connection = await readerDb.readerConnection.findFirst({
    where: { ownerId, provider: "readwise" },
  });

  const books: ImportBook[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams();
    if (cursor) params.set("pageCursor", cursor);
    if (connection?.lastSyncedAt) params.set("updatedAfter", connection.lastSyncedAt.toISOString());
    const data: ReadwiseExportPage = await readerFetchJson<ReadwiseExportPage>(
      `https://readwise.io/api/v2/export/?${params.toString()}`,
      { headers: { Authorization: `Token ${token}` }, timeoutMs: 60_000 }
    );
    for (const result of data.results) {
      if (result.category && result.category !== "books") continue;
      books.push({
        title: result.readable_title ?? result.title,
        author: result.author,
        highlights: result.highlights
          .filter((highlight) => !highlight.is_deleted && highlight.text)
          .map((highlight) => ({
            externalId: `readwise:${highlight.id}`,
            text: highlight.text,
            note: highlight.note || undefined,
            color: highlight.color || undefined,
            label:
              highlight.location !== undefined
                ? `${highlight.location_type === "page" ? "Page" : "Location"} ${highlight.location}`
                : undefined,
            kind: "highlight" as const,
          })),
      });
    }
    cursor = data.nextPageCursor;
    if (!cursor) break;
  }

  const summary = await importHighlights(ownerId, "readwise", books);
  if (connection) {
    await readerDb.readerConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date() },
    });
  }
  return summary;
}

// ── Hardcover ──────────────────────────────────────────────────────────────

/** Hardcover shelves; statuses without one (reference) stay local. */
const HARDCOVER_STATUS: Partial<Record<ReadingStatus, number>> = {
  want: 1,
  reading: 2,
  finished: 3,
};

async function hardcoverQuery<T>(
  token: string,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const response = await readerFetchJson<{ data?: T; errors?: Array<{ message: string }> }>(
    "https://api.hardcover.app/v1/graphql",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    }
  );
  if (response.errors?.length) {
    throw new ReaderFetchError(`Hardcover: ${response.errors[0].message}`, 502);
  }
  if (!response.data) throw new ReaderFetchError("Hardcover returned no data", 502);
  return response.data;
}

/**
 * Set a book's reading status locally and, when Hardcover is connected,
 * mirror it there (matched by ISBN, then title search).
 */
export async function setReadingStatus(
  ownerId: string,
  contentId: string,
  status: ReadingStatus | null
): Promise<{ syncedToHardcover: boolean }> {
  const meta = await readerDb.bookMeta.findFirst({ where: { contentId, ownerId } });
  if (!meta) throw new ReaderFetchError("Book not found", 404);
  await readerDb.bookMeta.update({ where: { contentId }, data: { readingStatus: status } });

  const token = status && HARDCOVER_STATUS[status] ? await tokenFor(ownerId, "hardcover") : null;
  if (!token || !status) return { syncedToHardcover: false };

  let bookId = meta.hardcoverBookId ? Number(meta.hardcoverBookId) : null;
  if (!bookId && meta.isbn) {
    const data = await hardcoverQuery<{ editions: Array<{ book_id: number }> }>(
      token,
      "query ($isbn: String!) { editions(where: { _or: [{ isbn_13: { _eq: $isbn } }, { isbn_10: { _eq: $isbn } }] }, limit: 1) { book_id } }",
      { isbn: meta.isbn }
    );
    bookId = data.editions[0]?.book_id ?? null;
  }
  if (!bookId) {
    const data = await hardcoverQuery<{ books: Array<{ id: number }> }>(
      token,
      "query ($title: String!) { books(where: { title: { _eq: $title } }, limit: 1, order_by: { users_count: desc }) { id } }",
      { title: meta.title }
    );
    bookId = data.books[0]?.id ?? null;
  }
  if (!bookId) return { syncedToHardcover: false };

  await hardcoverQuery(
    token,
    "mutation ($bookId: Int!, $statusId: Int!) { insert_user_book(object: { book_id: $bookId, status_id: $statusId }) { id error } }",
    { bookId, statusId: HARDCOVER_STATUS[status]! }
  );
  if (!meta.hardcoverBookId) {
    await readerDb.bookMeta.update({
      where: { contentId },
      data: { hardcoverBookId: String(bookId) },
    });
  }
  return { syncedToHardcover: true };
}
