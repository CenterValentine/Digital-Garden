-- Scripture corpus (SCRIPTURES-INTEGRATION-PLAN.md §R3). Hand-written in
-- Prisma's canonical migrate-diff style for the four models in
-- scripture-schema-additions.prisma. Copy to
-- prisma/migrations/<timestamp>_scripture_corpus/migration.sql, or — better —
-- let `prisma migrate dev --name scripture_corpus` generate it and diff.

CREATE TABLE "ScriptureCorpus" (
    "id" VARCHAR(80) NOT NULL,
    "tradition" VARCHAR(40) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "language" VARCHAR(20) NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "license" VARCHAR(80) NOT NULL,
    "versification" VARCHAR(40) NOT NULL DEFAULT 'chapter-verse',
    "version" VARCHAR(80) NOT NULL,
    "verseCount" INTEGER NOT NULL DEFAULT 0,
    "installedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScriptureCorpus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScriptureBook" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "corpusId" VARCHAR(80) NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "fullTitle" VARCHAR(255) NOT NULL,
    "heading" TEXT,
    "volume" VARCHAR(40) NOT NULL,
    "volumeTitle" VARCHAR(120) NOT NULL,
    "chapterCount" INTEGER NOT NULL,
    "abbreviations" TEXT[],
    CONSTRAINT "ScriptureBook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScriptureVerse" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "corpusId" VARCHAR(80) NOT NULL,
    "bookSlug" VARCHAR(40) NOT NULL,
    "chapter" INTEGER NOT NULL,
    "verse" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "ScriptureVerse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserScriptureCorpus" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "corpusId" VARCHAR(80) NOT NULL,
    "enabledAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserScriptureCorpus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScriptureBook_corpusId_slug_key" ON "ScriptureBook"("corpusId", "slug");
CREATE INDEX "ScriptureBook_corpusId_ordinal_idx" ON "ScriptureBook"("corpusId", "ordinal");
CREATE UNIQUE INDEX "ScriptureVerse_corpusId_bookSlug_chapter_verse_key" ON "ScriptureVerse"("corpusId", "bookSlug", "chapter", "verse");
CREATE INDEX "ScriptureVerse_corpusId_ordinal_idx" ON "ScriptureVerse"("corpusId", "ordinal");
CREATE UNIQUE INDEX "UserScriptureCorpus_userId_corpusId_key" ON "UserScriptureCorpus"("userId", "corpusId");

ALTER TABLE "ScriptureBook" ADD CONSTRAINT "ScriptureBook_corpusId_fkey" FOREIGN KEY ("corpusId") REFERENCES "ScriptureCorpus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScriptureVerse" ADD CONSTRAINT "ScriptureVerse_corpusId_fkey" FOREIGN KEY ("corpusId") REFERENCES "ScriptureCorpus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserScriptureCorpus" ADD CONSTRAINT "UserScriptureCorpus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserScriptureCorpus" ADD CONSTRAINT "UserScriptureCorpus_corpusId_fkey" FOREIGN KEY ("corpusId") REFERENCES "ScriptureCorpus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
