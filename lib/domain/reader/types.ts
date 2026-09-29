/**
 * Reader domain types (client-safe — no Prisma, no Node APIs).
 *
 * Plan: docs/notes-feature/work-tracking/EREADER-PLAN.md
 */

/**
 * Where an annotation or reading position sits. Follows the Readium Locator
 * model (https://readium.org/architecture/models/locators/) so one shape
 * serves EPUB (cfi), PDF (position) and corpus sources (href = verse id +
 * char offsets). `text` is the quote-selector backstop used to re-anchor when
 * the primary location no longer resolves.
 */
export interface ReaderLocator {
  href?: string;
  locations: {
    cfi?: string;
    progression?: number;
    totalProgression?: number;
    position?: number;
    start?: number;
    end?: number;
  };
  text?: {
    before?: string;
    highlight?: string;
    after?: string;
  };
  /** Human label for where this is (chapter / TOC item). */
  label?: string;
}

export type ReaderAnnotationKind = "highlight" | "note" | "bookmark";
export type ReaderAnnotationSource = "reader" | "kindle" | "readwise";

export const READER_HIGHLIGHT_COLORS = [
  "yellow",
  "green",
  "blue",
  "pink",
  "purple",
] as const;
export type ReaderHighlightColor = (typeof READER_HIGHLIGHT_COLORS)[number];

export interface ReaderAnnotationDto {
  id: string;
  targetKey: string;
  kind: ReaderAnnotationKind;
  locator: ReaderLocator;
  color: string | null;
  body: string | null;
  noteContentId: string | null;
  source: ReaderAnnotationSource;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingProgressDto {
  targetKey: string;
  locator: ReaderLocator;
  percent: number;
  updatedAt: string;
}

export type BookLicense =
  | "public-domain"
  | "creative-commons"
  | "owned"
  | "unknown";

export type ReadingStatus = "want" | "reading" | "finished";

export interface BookMetaDto {
  contentId: string;
  title: string;
  authors: string[];
  language: string | null;
  description: string | null;
  publisher: string | null;
  publishedYear: number | null;
  isbn: string | null;
  openLibraryId: string | null;
  coverUrl: string | null;
  sourceAdapter: string;
  sourceUrl: string | null;
  license: BookLicense;
  readingStatus: ReadingStatus | null;
}

/** Book file formats the reader opens. */
export const READER_MIME_TYPES = {
  epub: "application/epub+zip",
  pdf: "application/pdf",
  mobi: "application/x-mobipocket-ebook",
  azw3: "application/vnd.amazon.ebook",
  fb2: "application/x-fictionbook+xml",
  cbz: "application/vnd.comicbook+zip",
} as const;

/** MIME types the reader claims as the default viewer (PDF is opt-in). */
export const READER_DEFAULT_VIEWER_MIME_TYPES: readonly string[] = [
  READER_MIME_TYPES.epub,
  READER_MIME_TYPES.mobi,
  READER_MIME_TYPES.azw3,
  READER_MIME_TYPES.fb2,
  READER_MIME_TYPES.cbz,
];

// ── Library / sources ──────────────────────────────────────────────────────

export type BookSourceKind =
  | "gutendex"
  | "openlibrary"
  | "standard-ebooks"
  | "wikisource"
  | "oapen"
  | "google-books"
  | "opds";

export interface BookSourceInfo {
  /** Stable id used in API calls: "gutendex", "opds:preset:gutenberg", "opds:<catalogId>". */
  id: string;
  kind: BookSourceKind;
  label: string;
  description: string;
  /** Can search by free text. */
  searchable: boolean;
  /** Has a browsable navigation tree (OPDS). */
  browsable: boolean;
  /** Books from it can be read here (DRM-free files). False = metadata only. */
  readable: boolean;
  /** User-added catalog (deletable). */
  custom?: boolean;
  /** Feed URL for OPDS presets (used to add a logged-in copy). */
  feedUrl?: string;
  /** The feed refuses anonymous access — opening it asks for a login instead. */
  requiresLogin?: {
    usernameLabel: string;
    passwordLabel?: string;
    hint: string;
    signupUrl?: string;
  };
  homepage?: string;
}

export interface CatalogAcquisition {
  href: string;
  type: string;
  /** "open-access" | "acquisition" | "borrow" | "buy" | "sample" | "preview" */
  rel: string;
}

export interface CatalogEntry {
  /** Source-scoped id, round-tripped to acquire. */
  id: string;
  title: string;
  authors: string[];
  summary?: string;
  language?: string;
  coverUrl?: string;
  publishedYear?: number;
  isbn?: string;
  openLibraryId?: string;
  license?: BookLicense;
  /** Downloadable files, best first. Empty = not readable here. */
  acquisitions: CatalogAcquisition[];
  /** Where to read/borrow it elsewhere when it can't be read here. */
  externalUrl?: string;
  externalLabel?: string;
}

export interface CatalogNavLink {
  title: string;
  href: string;
  summary?: string;
  /** Thumbnail advertised on the navigation entry (Gutenberg search results carry one). */
  coverUrl?: string;
}

export interface CatalogPage {
  sourceId: string;
  title?: string;
  entries: CatalogEntry[];
  navigation: CatalogNavLink[];
  nextHref?: string;
  total?: number;
  /** OPDS OpenSearch template, when the feed advertises one. */
  searchTemplate?: string;
}

export interface AcquireResult {
  contentId: string;
  title: string;
  parentId: string | null;
  duplicate: boolean;
}

// ── Integrations ────────────────────────────────────────────────────────────

export type ReaderConnectionProvider = "readwise" | "hardcover" | "google-books";

export const READER_CONNECTION_PROVIDERS: readonly ReaderConnectionProvider[] = [
  "readwise",
  "hardcover",
  "google-books",
];

export interface ReaderConnectionDto {
  provider: ReaderConnectionProvider;
  connected: boolean;
  lastSyncedAt: string | null;
  /** Masked token hint, e.g. "••••abcd". */
  hint: string | null;
}

export interface HighlightImportSummary {
  books: number;
  created: number;
  skipped: number;
  unmatchedBooks: string[];
}

/**
 * "Find it at your library" — OverDrive's public search lists availability at
 * the user's libraries and hands off to Libby. No API credentials needed;
 * reading happens in Libby (DRM), never here.
 */
export function librarySearchUrl(title: string, author?: string): string {
  const query = [title, author].filter(Boolean).join(" ");
  return `https://www.overdrive.com/search?q=${encodeURIComponent(query)}`;
}

export function contentTargetKey(contentId: string): string {
  return `content:${contentId}`;
}

export function parseContentTargetKey(targetKey: string): string | null {
  return targetKey.startsWith("content:") ? targetKey.slice(8) : null;
}
