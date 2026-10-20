/**
 * The reader's library (server-only).
 *
 * A book is an ordinary file node (Principle 1 — EREADER-PLAN.md §1).
 * Acquiring a book downloads a DRM-free file to wherever the "+" pointed —
 * the target folder, beside a selected item, or the top of the tree — and
 * writes a BookMeta side row. "My books" is every file with BookMeta, wherever
 * it lives.
 */

import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/database/client";
import { generateUniqueSlug } from "@/lib/domain/content/slug";
import { getUserStorageProvider } from "@/lib/infrastructure/storage";
import { readerDb, type BookMetaRow } from "../db";
import {
  READER_MIME_TYPES,
  type AcquireResult,
  type BookLicense,
  type BookMetaDto,
  type CatalogEntry,
} from "../types";
import { describeDrm, inspectEpub, type EpubInspection } from "./epub";
import { MAX_BOOK_BYTES, ReaderFetchError, readerFetch } from "./http";
import { resolveAcquisition } from "./sources";
import { normalizeUrl, validateExternalUrl } from "@/lib/domain/content/external-validation";

export const LIBRARY_FOLDER_TITLE = "Books";

const EXTENSION_BY_MIME: Record<string, string> = {
  [READER_MIME_TYPES.epub]: "epub",
  [READER_MIME_TYPES.pdf]: "pdf",
  [READER_MIME_TYPES.mobi]: "mobi",
  [READER_MIME_TYPES.azw3]: "azw3",
  [READER_MIME_TYPES.fb2]: "fb2",
  [READER_MIME_TYPES.cbz]: "cbz",
};

const ZIP_FORMATS = new Set<string>([READER_MIME_TYPES.epub, READER_MIME_TYPES.cbz]);

/** EPUB / CBZ are zip containers — "PK\x03\x04". HTML error pages aren't. */
function isZip(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

export class ReaderDrmError extends Error {
  readonly status = 422;
}

/** Find (or create, as a gallery-view folder) the user's root `Books/` folder. */
export async function ensureLibraryFolder(ownerId: string): Promise<string> {
  const existing = await prisma.contentNode.findFirst({
    where: {
      ownerId,
      parentId: null,
      contentType: "folder",
      title: LIBRARY_FOLDER_TITLE,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.contentNode.create({
    data: {
      ownerId,
      title: LIBRARY_FOLDER_TITLE,
      slug: await generateUniqueSlug(LIBRARY_FOLDER_TITLE, ownerId),
      contentType: "folder",
      parentId: null,
      displayOrder: 0,
      folderPayload: {
        create: {
          viewMode: "gallery",
          sortMode: null,
          viewPrefs: {},
          includeReferencedContent: false,
        },
      },
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Server half of the create-target rule (lib/domain/content/create-target.ts):
 * a folder holds the book; any other item makes it a sibling (its folder);
 * a missing / trashed target, or none, means the top of the tree.
 */
export async function resolveFolderTarget(
  ownerId: string,
  parentId: string | null | undefined
): Promise<string | null> {
  let candidate = parentId ?? null;
  for (let hop = 0; candidate && hop < 3; hop++) {
    const node: { id: string; contentType: string; parentId: string | null } | null =
      await prisma.contentNode.findFirst({
        where: { id: candidate, ownerId, deletedAt: null },
        select: { id: true, contentType: true, parentId: true },
      });
    if (!node) return null;
    if (node.contentType === "folder") return node.id;
    candidate = node.parentId;
  }
  return null;
}

function sanitizeFileName(title: string, extension: string): string {
  const base = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
  return `${base || "Book"}.${extension}`;
}

function mimeFromDownload(declared: string, href: string, fallback: string): string {
  const base = declared.split(";")[0].trim().toLowerCase();
  if (EXTENSION_BY_MIME[base]) return base;
  const ext = new URL(href).pathname.split(".").pop()?.toLowerCase();
  const byExt = Object.entries(EXTENSION_BY_MIME).find(([, value]) => value === ext);
  return byExt?.[0] ?? fallback;
}

export interface StoreBookInput {
  ownerId: string;
  parentId: string | null;
  buffer: Buffer;
  mimeType: string;
  title: string;
  coverUrl?: string;
  searchText: string;
}

/** Store a reader file (book or paper) in the user's storage as a file node; dedupes by checksum. */
export async function storeBookFile(input: StoreBookInput): Promise<{ contentId: string; duplicate: boolean }> {
  const checksum = crypto.createHash("sha256").update(input.buffer).digest("hex");
  const existing = await prisma.filePayload.findFirst({
    where: {
      checksum,
      fileSize: BigInt(input.buffer.length),
      uploadStatus: "ready",
      content: { ownerId: input.ownerId, deletedAt: null },
    },
    select: { contentId: true },
  });
  if (existing) return { contentId: existing.contentId, duplicate: true };

  const extension = EXTENSION_BY_MIME[input.mimeType] ?? "bin";
  const fileName = sanitizeFileName(input.title, extension);
  const providerType = (process.env.DEFAULT_STORAGE_PROVIDER || "r2") as "r2" | "s3" | "vercel";
  const storage = await getUserStorageProvider(input.ownerId, providerType);
  const storageKey = `uploads/${input.ownerId}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${extension}`;
  await storage.uploadFile(storageKey, input.buffer, input.mimeType);

  const created = await prisma.contentNode.create({
    data: {
      ownerId: input.ownerId,
      title: fileName,
      slug: await generateUniqueSlug(fileName, input.ownerId),
      contentType: "file",
      parentId: input.parentId,
      displayOrder: 0,
      filePayload: {
        create: {
          fileName,
          fileExtension: extension,
          mimeType: input.mimeType,
          fileSize: BigInt(input.buffer.length),
          checksum,
          storageProvider: providerType,
          storageKey,
          searchText: input.searchText,
          thumbnailUrl: input.coverUrl ?? null,
          uploadStatus: "ready",
          uploadedAt: new Date(),
          isProcessed: false,
          processingStatus: "none",
        },
      },
    },
    select: { id: true },
  });
  return { contentId: created.id, duplicate: false };
}

export interface AcquireInput {
  ownerId: string;
  sourceId: string;
  entry: CatalogEntry;
  /** Index into entry.acquisitions to try first; later ones are fallbacks. */
  acquisitionIndex?: number;
  parentId?: string | null;
}

export async function acquireBook(input: AcquireInput): Promise<AcquireResult> {
  const { ownerId, sourceId, entry } = input;
  if (entry.acquisitions.length === 0) {
    throw new ReaderFetchError("This book has no free download — open it at the source instead", 400);
  }
  // Where the "+" pointed (resolved client-side with the tree's rule); no
  // forced Books folder — the user's structure decides.
  const parentId = await resolveFolderTarget(ownerId, input.parentId);

  const ordered = [
    ...entry.acquisitions.slice(input.acquisitionIndex ?? 0),
    ...entry.acquisitions.slice(0, input.acquisitionIndex ?? 0),
  ];

  let lastError: unknown = null;
  for (const acquisition of ordered) {
    try {
      const { headers, license: sourceLicense } = await resolveAcquisition(
        sourceId,
        ownerId,
        acquisition.href
      );
      const download = await readerFetch(acquisition.href, {
        headers,
        maxBytes: MAX_BOOK_BYTES,
        timeoutMs: 90_000,
      });
      const mimeType = mimeFromDownload(
        download.contentType,
        download.url,
        acquisition.type.split(";")[0] || READER_MIME_TYPES.epub
      );
      if (!EXTENSION_BY_MIME[mimeType]) {
        throw new ReaderFetchError(`Unsupported format (${download.contentType || "unknown"})`, 415);
      }

      if (ZIP_FORMATS.has(mimeType) && !isZip(download.body)) {
        throw new ReaderFetchError(
          `${new URL(download.url).hostname} returned a web page instead of the book file`,
          502
        );
      }

      let inspection: EpubInspection | null = null;
      if (mimeType === READER_MIME_TYPES.epub) {
        inspection = await inspectEpub(download.body);
        if (inspection.drm) throw new ReaderDrmError(describeDrm(inspection.drm));
      }

      const { contentId, duplicate } = await storeBookFile({
        ownerId,
        parentId,
        buffer: download.body,
        mimeType,
        title: entry.title,
        coverUrl: entry.coverUrl,
        searchText: inspection?.searchText ?? "",
      });

      const license: BookLicense = entry.license ?? sourceLicense ?? "unknown";
      await upsertBookMeta(ownerId, contentId, {
        title: entry.title,
        authors: entry.authors.length ? entry.authors : inspection?.authors ?? [],
        language: entry.language ?? inspection?.language ?? null,
        description: entry.summary ?? inspection?.description ?? null,
        publisher: inspection?.publisher ?? null,
        publishedYear: entry.publishedYear ?? inspection?.publishedYear ?? null,
        isbn: entry.isbn ?? inspection?.isbn ?? null,
        openLibraryId: entry.openLibraryId ?? null,
        coverUrl: entry.coverUrl ?? null,
        sourceAdapter: sourceId,
        sourceUrl: entry.externalUrl ?? acquisition.href,
        sourceEntryId: entry.id.slice(0, 255),
        license,
      });

      return { contentId, title: entry.title, parentId, duplicate };
    } catch (error) {
      if (error instanceof ReaderDrmError) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new ReaderFetchError("Could not download this book");
}

type BookMetaWrite = Omit<
  BookMetaRow,
  "contentId" | "ownerId" | "createdAt" | "updatedAt" | "readingStatus" | "hardcoverBookId"
>;

export async function upsertBookMeta(
  ownerId: string,
  contentId: string,
  data: BookMetaWrite
): Promise<void> {
  const payload = {
    ...data,
    title: data.title.slice(0, 500),
    authors: data.authors.slice(0, 20),
  };
  await readerDb.bookMeta.upsert({
    where: { contentId },
    create: { contentId, ownerId, ...payload },
    update: payload,
  });
}

export function toBookMetaDto(row: BookMetaRow): BookMetaDto {
  return {
    contentId: row.contentId,
    title: row.title,
    authors: row.authors,
    language: row.language,
    description: row.description,
    publisher: row.publisher,
    publishedYear: row.publishedYear,
    isbn: row.isbn,
    openLibraryId: row.openLibraryId,
    coverUrl: row.coverUrl,
    sourceAdapter: row.sourceAdapter,
    sourceUrl: row.sourceUrl,
    license: row.license as BookLicense,
    readingStatus: row.readingStatus as BookMetaDto["readingStatus"],
  };
}

/**
 * BookMeta for a book file. Books uploaded through the ordinary file upload
 * have no row yet — inspect the stored file once and create it (lazily, on
 * first open), so every EPUB in the tree becomes a library book.
 */
export async function getOrCreateBookMeta(
  ownerId: string,
  contentId: string
): Promise<{ meta: BookMetaDto; drmMessage: string | null }> {
  const node = await prisma.contentNode.findFirst({
    where: { id: contentId, ownerId, deletedAt: null },
    select: {
      title: true,
      filePayload: {
        select: { mimeType: true, storageKey: true, storageProvider: true, searchText: true },
      },
    },
  });
  if (!node?.filePayload) throw new ReaderFetchError("Book not found", 404);

  const existing = await readerDb.bookMeta.findUnique({ where: { contentId } });
  if (existing) return { meta: toBookMetaDto(existing), drmMessage: null };

  let inspection: EpubInspection | null = null;
  if (node.filePayload.mimeType === READER_MIME_TYPES.epub) {
    const storage = await getUserStorageProvider(
      ownerId,
      node.filePayload.storageProvider as "r2" | "s3" | "vercel"
    );
    const url = await storage.generateDownloadUrl(node.filePayload.storageKey, 600);
    const response = await fetch(url);
    const bytes = response.ok ? Buffer.from(await response.arrayBuffer()) : null;
    if (bytes && isZip(bytes)) {
      inspection = await inspectEpub(bytes);
      if (inspection.drm) {
        return {
          meta: fallbackMeta(contentId, node.title),
          drmMessage: describeDrm(inspection.drm),
        };
      }
      if (inspection.searchText && !node.filePayload.searchText) {
        await prisma.filePayload.update({
          where: { contentId },
          data: { searchText: inspection.searchText },
        });
      }
    }
  }

  const title = inspection?.title ?? node.title.replace(/\.[a-z0-9]+$/i, "");
  await upsertBookMeta(ownerId, contentId, {
    title,
    authors: inspection?.authors ?? [],
    language: inspection?.language ?? null,
    description: inspection?.description ?? null,
    publisher: inspection?.publisher ?? null,
    publishedYear: inspection?.publishedYear ?? null,
    isbn: inspection?.isbn ?? null,
    openLibraryId: null,
    coverUrl: null,
    sourceAdapter: "upload",
    sourceUrl: null,
    sourceEntryId: null,
    license: "owned",
  });
  const created = await readerDb.bookMeta.findUnique({ where: { contentId } });
  return {
    meta: created ? toBookMetaDto(created) : fallbackMeta(contentId, title),
    drmMessage: null,
  };
}

function fallbackMeta(contentId: string, title: string): BookMetaDto {
  return {
    contentId,
    title,
    authors: [],
    language: null,
    description: null,
    publisher: null,
    publishedYear: null,
    isbn: null,
    openLibraryId: null,
    coverUrl: null,
    sourceAdapter: "upload",
    sourceUrl: null,
    license: "unknown",
    readingStatus: null,
  };
}

/** The user's books (file nodes with BookMeta), newest first. */
export async function listLibraryBooks(ownerId: string): Promise<BookMetaDto[]> {
  const rows = await readerDb.bookMeta.findMany({
    where: { ownerId, content: { deletedAt: null } },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  const types = await prisma.contentNode.findMany({
    where: { id: { in: rows.map((row) => row.contentId) }, ownerId },
    select: { id: true, contentType: true },
  });
  const linkIds = new Set(types.filter((node) => node.contentType === "external").map((node) => node.id));
  return rows.map((row) => ({
    ...toBookMetaDto(row),
    kind: linkIds.has(row.contentId) ? "link" : "file",
  }));
}

/**
 * A catalog book with no free download (borrow-only, in copyright, preview
 * only) still belongs in the user's library as a *reference*: an external
 * link node to its source page, carrying BookMeta so it shows in My books,
 * gets details and AI context, and can be shelved like any book.
 */
export async function addLinkBook(input: {
  ownerId: string;
  sourceId: string;
  entry: CatalogEntry;
  parentId?: string | null;
}): Promise<AcquireResult> {
  const { ownerId, sourceId, entry } = input;
  const url = entry.externalUrl;
  if (!url) throw new ReaderFetchError("This book has no source page to link to", 400);
  const verdict = validateExternalUrl(url);
  if (!verdict.valid) throw new ReaderFetchError(verdict.error ?? "Invalid source link", 400);
  const normalizedUrl = normalizeUrl(url);
  const parentId = await resolveFolderTarget(ownerId, input.parentId);

  const sameLinks = await prisma.contentNode.findMany({
    where: { ownerId, deletedAt: null, contentType: "external", externalPayload: { normalizedUrl } },
    select: { id: true },
    take: 20,
  });
  for (const candidate of sameLinks) {
    const meta = await readerDb.bookMeta.findUnique({ where: { contentId: candidate.id } });
    if (meta) return { contentId: candidate.id, title: entry.title, parentId, duplicate: true };
  }

  const title = entry.title.slice(0, 255);
  const parsed = new URL(url);
  const created = await prisma.contentNode.create({
    data: {
      ownerId,
      title,
      slug: await generateUniqueSlug(title, ownerId),
      contentType: "external",
      parentId,
      displayOrder: 0,
      externalPayload: {
        create: {
          url,
          normalizedUrl,
          canonicalUrl: normalizedUrl,
          subtype: "website",
          description: entry.summary?.slice(0, 2000) ?? null,
          resourceType: "book",
          sourceDomain: parsed.hostname.replace(/^www\./, ""),
          sourceHostname: parsed.hostname,
          preview: {},
        },
      },
    },
    select: { id: true },
  });

  await upsertBookMeta(ownerId, created.id, {
    title: entry.title,
    authors: entry.authors,
    language: entry.language ?? null,
    description: entry.summary ?? null,
    publisher: null,
    publishedYear: entry.publishedYear ?? null,
    isbn: entry.isbn ?? null,
    openLibraryId: entry.openLibraryId ?? null,
    coverUrl: entry.coverUrl ?? null,
    sourceAdapter: sourceId,
    sourceUrl: url,
    sourceEntryId: entry.id.slice(0, 255),
    license: entry.license ?? "unknown",
  });
  return { contentId: created.id, title: entry.title, parentId, duplicate: false };
}
