-- Backfill: cloze authoring columns on Flashcard (noteId, clozeOrdinal,
-- clozeSourceJson) + the (ownerId, noteId) index. These shipped to the schema
-- across the flashcards / audio-block work without a migration file on this
-- branch line (pre-existing drift). Every statement is idempotent, so this is
-- safe on dev (already applied via db push), prod, and fresh installs.

ALTER TABLE "Flashcard" ADD COLUMN IF NOT EXISTS "noteId" UUID;
ALTER TABLE "Flashcard" ADD COLUMN IF NOT EXISTS "clozeOrdinal" INTEGER;
ALTER TABLE "Flashcard" ADD COLUMN IF NOT EXISTS "clozeSourceJson" JSONB;

CREATE INDEX IF NOT EXISTS "Flashcard_ownerId_noteId_idx"
    ON "Flashcard" ("ownerId", "noteId");
