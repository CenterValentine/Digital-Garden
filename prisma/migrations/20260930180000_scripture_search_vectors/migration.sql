-- AlterTable
ALTER TABLE "ScriptureVerse" ADD COLUMN     "searchEnglish" tsvector,
ADD COLUMN     "searchSimple" tsvector;

-- Backfill collections installed before this migration (new installs fill
-- these in the install transaction).
UPDATE "ScriptureVerse"
SET "searchEnglish" = to_tsvector('english'::regconfig, "text"),
    "searchSimple" = to_tsvector('simple'::regconfig, "text");

-- CreateIndex
CREATE INDEX "ScriptureVerse_searchEnglish_idx" ON "ScriptureVerse" USING GIN ("searchEnglish");

-- CreateIndex
CREATE INDEX "ScriptureVerse_searchSimple_idx" ON "ScriptureVerse" USING GIN ("searchSimple");
