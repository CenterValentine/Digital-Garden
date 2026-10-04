/**
 * Scripture persistence facade (server-only).
 *
 * The tables are migrated (prisma/migrations/20260930120000_scripture_corpus).
 * The facade stays as the one seam: typed rows, and a database that hasn't
 * run `migrate deploy` yet answers 503 READER_NOT_MIGRATED instead of
 * crashing (same contract as lib/domain/reader/db.ts).
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import { ReaderNotMigratedError } from "@/lib/domain/reader/db";

export class ScriptureNotMigratedError extends ReaderNotMigratedError {
  constructor(model: string) {
    super(model);
    this.message = `Scripture tables are not migrated yet (missing ${model}). Run \`npx prisma migrate deploy\` (migration 20260930120000_scripture_corpus).`;
  }
}

export interface ScriptureCorpusRow {
  id: string;
  tradition: string;
  title: string;
  language: string;
  sourceUrl: string;
  license: string;
  versification: string;
  version: string;
  verseCount: number;
  installedAt: Date;
}

export interface ScriptureBookRow {
  id: string;
  corpusId: string;
  ordinal: number;
  slug: string;
  name: string;
  fullTitle: string;
  heading: string | null;
  volume: string;
  volumeTitle: string;
  chapterCount: number;
  abbreviations: string[];
}

export interface ScriptureVerseRow {
  id: string;
  corpusId: string;
  bookSlug: string;
  chapter: number;
  verse: number;
  ordinal: number;
  text: string;
}

export interface UserScriptureCorpusRow {
  id: string;
  userId: string;
  corpusId: string;
  enabledAt: Date;
}

type Where = Record<string, unknown>;

interface Delegate<Row> {
  findUnique(args: { where: Where; select?: Where }): Promise<Row | null>;
  findFirst(args: { where: Where; orderBy?: Where | Where[]; select?: Where }): Promise<Row | null>;
  findMany(args: {
    where: Where;
    orderBy?: Where | Where[];
    take?: number;
    skip?: number;
    select?: Where;
  }): Promise<Row[]>;
  count(args: { where: Where }): Promise<number>;
  create(args: { data: Where }): Promise<Row>;
  createMany(args: { data: Where[]; skipDuplicates?: boolean }): Promise<{ count: number }>;
  update(args: { where: Where; data: Where }): Promise<Row>;
  upsert(args: { where: Where; create: Where; update: Where }): Promise<Row>;
  deleteMany(args: { where: Where }): Promise<{ count: number }>;
  groupBy(args: { by: string[]; where: Where; _count: Where; orderBy?: Where }): Promise<Array<Record<string, unknown>>>;
}

type ScriptureModel = "scriptureCorpus" | "scriptureBook" | "scriptureVerse" | "userScriptureCorpus";

function delegate<Row>(model: ScriptureModel): Delegate<Row> {
  const found = (prisma as unknown as Record<string, unknown>)[model];
  if (!found || typeof found !== "object") throw new ScriptureNotMigratedError(model);
  return found as Delegate<Row>;
}

export const scriptureDb = {
  get corpus() {
    return delegate<ScriptureCorpusRow>("scriptureCorpus");
  },
  get book() {
    return delegate<ScriptureBookRow>("scriptureBook");
  },
  get verse() {
    return delegate<ScriptureVerseRow>("scriptureVerse");
  },
  get userCorpus() {
    return delegate<UserScriptureCorpusRow>("userScriptureCorpus");
  },
};

export function scriptureTablesAvailable(): boolean {
  try {
    void scriptureDb.corpus;
    return true;
  } catch {
    return false;
  }
}
