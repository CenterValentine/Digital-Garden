/**
 * Typed client for /api/reader/*. Every call throws ReaderApiError with the
 * server's message (and code — READER_NOT_MIGRATED, DRM_PROTECTED, …).
 */

import type {
  AcquireResult,
  BookDetails,
  BookDetailsQuery,
  BookMetaDto,
  BookSourceInfo,
  CatalogEntry,
  CatalogPage,
  HighlightImportSummary,
  ReaderAnnotationDto,
  ReaderAnnotationKind,
  ReaderConnectionDto,
  ReaderConnectionProvider,
  ReaderLocator,
  ReadingProgressDto,
  ReadingStatus,
} from "@/lib/domain/reader/types";
import type {
  ScriptureBookChapters,
  ScriptureCatalogItem,
  ScriptureChapterDto,
  ScriptureContents,
  ScriptureCorpusInfo,
  ScriptureResolvedReference,
  ScriptureSearchOptions,
  ScriptureSearchResult,
  ScriptureSessionDto,
} from "@/lib/domain/scripture/types";

export class ReaderApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init });
  const body = (await response.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; error: { code: string; message: string } }
    | null;
  if (!body || body.success !== true || !response.ok) {
    const error = body && body.success === false ? body.error : null;
    throw new ReaderApiError(
      error?.message ?? `Request failed (${response.status})`,
      error?.code ?? "HTTP_ERROR",
      response.status
    );
  }
  return (body as { success: true; data: T }).data;
}

const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

export const readerApi = {
  sources: () =>
    call<{ sources: BookSourceInfo[]; tablesReady: boolean }>("/api/reader/sources"),
  addCatalog: (input: { url: string; name?: string; username?: string; password?: string }) =>
    call<{ source: BookSourceInfo }>("/api/reader/sources", json("POST", input)),
  deleteCatalog: (id: string) =>
    call<{ deleted: true }>(`/api/reader/sources?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  search: (source: string, q: string, page?: string) => {
    const params = new URLSearchParams({ source, q });
    if (page) params.set("page", page);
    return call<CatalogPage>(`/api/reader/search?${params.toString()}`);
  },
  browse: (source: string, href?: string) => {
    const params = new URLSearchParams({ source });
    if (href) params.set("href", href);
    return call<CatalogPage>(`/api/reader/browse?${params.toString()}`);
  },
  acquire: (input: {
    sourceId: string;
    entry: CatalogEntry;
    acquisitionIndex?: number;
    parentId?: string | null;
  }) => call<AcquireResult>("/api/reader/acquire", json("POST", input)),
  books: () => call<{ books: BookMetaDto[] }>("/api/reader/books"),
  addLink: (input: { sourceId: string; entry: CatalogEntry; parentId?: string | null }) =>
    call<AcquireResult>("/api/reader/acquire/link", json("POST", input)),
  placeOnShelf: (input: { contentId: string; parentId: string | null }) =>
    call<{
      folderId: string | null;
      shortcutId: string | null;
      outcome: "created" | "exists" | "home";
    }>("/api/reader/shelf", json("POST", input)),
  details: (query: BookDetailsQuery) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, String(value));
    }
    return call<BookDetails>(`/api/reader/details?${params.toString()}`);
  },
  book: (contentId: string) =>
    call<{ meta: BookMetaDto; progress: ReadingProgressDto | null; drmMessage: string | null }>(
      `/api/reader/books/${contentId}`
    ),
  setStatus: (contentId: string, readingStatus: ReadingStatus | null) =>
    call<{ syncedToHardcover: boolean }>(`/api/reader/books/${contentId}`, json("PATCH", { readingStatus })),
  progress: (targetKey: string) =>
    call<{ progress: ReadingProgressDto | null }>(
      `/api/reader/progress?targetKey=${encodeURIComponent(targetKey)}`
    ),
  saveProgress: (targetKey: string, locator: ReaderLocator, percent: number) =>
    call<{ progress: ReadingProgressDto }>("/api/reader/progress", json("PUT", { targetKey, locator, percent })),
  annotations: (targetKey: string) =>
    call<{ annotations: ReaderAnnotationDto[] }>(
      `/api/reader/annotations?targetKey=${encodeURIComponent(targetKey)}`
    ),
  createAnnotation: (input: {
    targetKey: string;
    kind: ReaderAnnotationKind;
    locator: ReaderLocator;
    color?: string | null;
    body?: string | null;
  }) => call<{ annotation: ReaderAnnotationDto }>("/api/reader/annotations", json("POST", input)),
  updateAnnotation: (id: string, input: { color?: string | null; body?: string | null }) =>
    call<{ annotation: ReaderAnnotationDto }>(`/api/reader/annotations/${id}`, json("PATCH", input)),
  deleteAnnotation: (id: string) =>
    call<{ deleted: true }>(`/api/reader/annotations/${id}`, { method: "DELETE" }),
  sendToNote: (id: string) =>
    call<{ noteContentId: string; created: boolean }>(
      `/api/reader/annotations/${id}/send-to-note`,
      { method: "POST" }
    ),
  connections: () => call<{ connections: ReaderConnectionDto[] }>("/api/reader/connections"),
  saveConnection: (provider: ReaderConnectionProvider, token: string) =>
    call<{ connection: ReaderConnectionDto }>(
      `/api/reader/connections/${provider}`,
      json("PUT", { token })
    ),
  deleteConnection: (provider: ReaderConnectionProvider) =>
    call<{ deleted: true }>(`/api/reader/connections/${provider}`, { method: "DELETE" }),
  importKindle: (file: File) => {
    const form = new FormData();
    form.set("file", file);
    return call<HighlightImportSummary>("/api/reader/import/kindle", { method: "POST", body: form });
  },
  importReadwise: () =>
    call<HighlightImportSummary>("/api/reader/import/readwise", { method: "POST" }),
};

/** Scriptures: shared corpora; each user adds the ones they want (the first add loads the text). */
export const scriptureApi = {
  catalog: () =>
    call<{ items: ScriptureCatalogItem[] }>("/api/reader/scriptures/catalog"),
  enabled: () =>
    call<{ corpora: ScriptureCorpusInfo[]; migrated: boolean }>("/api/reader/scriptures/enabled"),
  install: (corpusId: string) =>
    call<{ verseCount: number; alreadyInstalled: boolean }>(
      "/api/reader/scriptures/install",
      json("POST", { corpusId })
    ),
  setEnabled: (corpusId: string, enabled: boolean) =>
    call<{ corpusId: string; enabled: boolean }>("/api/reader/scriptures/enable", json("POST", { corpusId, enabled })),
  contents: (corpusId: string) =>
    call<ScriptureContents>(`/api/reader/scriptures/${encodeURIComponent(corpusId)}/contents`),
  createSession: (input: { corpusId: string; parentId?: string | null; title?: string }) =>
    call<ScriptureSessionDto & { parentId: string | null }>("/api/reader/scriptures/session", json("POST", input)),
  session: (contentId: string) =>
    call<ScriptureSessionDto>(`/api/reader/scriptures/session/${encodeURIComponent(contentId)}`),
  bookChapters: (corpusId: string, book: string) =>
    call<ScriptureBookChapters>(
      `/api/reader/scriptures/${encodeURIComponent(corpusId)}/book?book=${encodeURIComponent(book)}`
    ),
  chapter: (corpusId: string, book: string, chapter: number) =>
    call<ScriptureChapterDto>(
      `/api/reader/scriptures/${encodeURIComponent(corpusId)}/chapter?${new URLSearchParams({ book, chapter: String(chapter) }).toString()}`
    ),
  search: (corpusId: string, q: string, options: ScriptureSearchOptions = {}) => {
    const params = new URLSearchParams({ q });
    if (options.mode) params.set("mode", options.mode);
    if (options.volume) params.set("volume", options.volume);
    if (options.sort) params.set("sort", options.sort);
    return call<ScriptureSearchResult>(
      `/api/reader/scriptures/${encodeURIComponent(corpusId)}/search?${params.toString()}`
    );
  },
  resolve: (corpusId: string, ref: string) =>
    call<{ references: ScriptureResolvedReference[] }>(
      `/api/reader/scriptures/${encodeURIComponent(corpusId)}/resolve?ref=${encodeURIComponent(ref)}`
    ),
};

/** The shared request helper, for sibling clients (research-api.ts). */
export { call as readerCall };
