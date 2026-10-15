/**
 * Reader persistence facade.
 *
 * TODO(reader-migration): `prisma/` is human-owned, so the five reader tables
 * are staged in docs/notes-feature/work-tracking/reader-schema-additions.prisma
 * (+ reader-migration.sql) rather than written. Until the owner applies them,
 * the generated client has no reader delegates, and this module reports
 * `ReaderNotMigratedError` (routes answer 503 with apply instructions) instead
 * of crashing. Once `prisma generate` has run with the new models, replace the
 * hand-written delegate types below with the generated ones
 * (`prisma.bookMeta`, …) and delete `readerDelegate()`.
 */

import { prisma } from "@/lib/database/client";

export class ReaderNotMigratedError extends Error {
  readonly code = "READER_NOT_MIGRATED";
  constructor(model: string) {
    super(
      `Reader tables are not migrated yet (missing ${model}). Apply docs/notes-feature/work-tracking/reader-schema-additions.prisma and run the reader migration.`
    );
  }
}

/** Prisma error code for "table does not exist". */
const PRISMA_TABLE_MISSING = "P2021";

export function isReaderNotMigrated(error: unknown): boolean {
  if (error instanceof ReaderNotMigratedError) return true;
  const code = (error as { code?: unknown } | null)?.code;
  return code === PRISMA_TABLE_MISSING;
}

// ── Row shapes (mirror reader-schema-additions.prisma) ─────────────────────

export interface BookMetaRow {
  contentId: string;
  ownerId: string;
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
  sourceEntryId: string | null;
  license: string;
  readingStatus: string | null;
  hardcoverBookId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReadingProgressRow {
  id: string;
  ownerId: string;
  targetKey: string;
  locator: unknown;
  percent: number;
  updatedAt: Date;
}

export interface ReaderAnnotationRow {
  id: string;
  ownerId: string;
  targetKey: string;
  kind: string;
  locator: unknown;
  color: string | null;
  body: string | null;
  noteContentId: string | null;
  source: string;
  externalId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReaderCatalogRow {
  id: string;
  ownerId: string;
  name: string;
  url: string;
  credentialEncrypted: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReaderConnectionRow {
  id: string;
  ownerId: string;
  provider: string;
  tokenEncrypted: string;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Minimal delegate surface used by the reader services ───────────────────

type Where = Record<string, unknown>;

interface Delegate<Row> {
  findUnique(args: { where: Where }): Promise<Row | null>;
  findFirst(args: { where: Where; orderBy?: Where }): Promise<Row | null>;
  findMany(args: {
    where: Where;
    orderBy?: Where | Where[];
    take?: number;
  }): Promise<Row[]>;
  create(args: { data: Where }): Promise<Row>;
  update(args: { where: Where; data: Where }): Promise<Row>;
  upsert(args: { where: Where; create: Where; update: Where }): Promise<Row>;
  delete(args: { where: Where }): Promise<Row>;
  deleteMany(args: { where: Where }): Promise<{ count: number }>;
}

type ReaderModel =
  | "bookMeta"
  | "readingProgress"
  | "readerAnnotation"
  | "readerCatalog"
  | "readerConnection";

function readerDelegate<Row>(model: ReaderModel): Delegate<Row> {
  const delegate = (prisma as unknown as Record<string, unknown>)[model];
  if (!delegate || typeof delegate !== "object") {
    throw new ReaderNotMigratedError(model);
  }
  return delegate as Delegate<Row>;
}

export const readerDb = {
  get bookMeta() {
    return readerDelegate<BookMetaRow>("bookMeta");
  },
  get readingProgress() {
    return readerDelegate<ReadingProgressRow>("readingProgress");
  },
  get readerAnnotation() {
    return readerDelegate<ReaderAnnotationRow>("readerAnnotation");
  },
  get readerCatalog() {
    return readerDelegate<ReaderCatalogRow>("readerCatalog");
  },
  get readerConnection() {
    return readerDelegate<ReaderConnectionRow>("readerConnection");
  },
};

/** True when the generated client already carries the reader models. */
export function readerTablesAvailable(): boolean {
  try {
    void readerDb.bookMeta;
    return true;
  } catch {
    return false;
  }
}
