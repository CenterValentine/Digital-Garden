-- Migration C: Sunset legacy Flashcard columns (Epoch 19, Sprint 6).
--
-- This is the "contract" half of the expand → migrate → contract
-- sequence. Prerequisites (all satisfied before this migration runs):
--
--   1. Migration A applied — FlashcardDeck table exists, Flashcard
--      has deckId column (nullable), FSRS state columns populated.
--   2. Migration B (scripts/backfill-flashcard-decks.ts) applied —
--      every Flashcard has a non-null deckId.
--   3. App code no longer reads or writes Flashcard.category /
--      Flashcard.subcategory / Flashcard.reviewStatus /
--      Flashcard.reviewCount / Flashcard.masteredAt. The legacy DTO
--      shape is derived server-side from the FK paradigm via
--      lib/domain/flashcards/legacy-compat.ts — Panel / QuickAddForm
--      keep working through the shim.
--
-- After this migration:
--   - Flashcard.deckId is NOT NULL (FK is the only deck identifier)
--   - The 5 legacy columns are gone
--   - The FlashcardReviewStatus enum is dropped (no other table uses it)
--   - The legacy indexes on (ownerId, category, subcategory) and
--     (ownerId, reviewStatus) are dropped — superseded by the FK +
--     state indexes added in Migration A.
--
-- Rollback: NOT supported in-place. To roll back, restore from a
-- pre-Migration-C backup, then revert the Sprint 6 app code.

-- ---------------------------------------------------------------------------
-- 1. Promote deckId to NOT NULL.
-- ---------------------------------------------------------------------------

-- Defensive: refuse to proceed if any row still has NULL deckId.
-- Postgres doesn't have a single-statement "ALTER COLUMN SET NOT NULL
-- IF NO NULLS EXIST" — we rely on the ALTER itself to error out if
-- any NULL rows are present, surfacing the backfill bug instead of
-- silently locking in a broken schema.

ALTER TABLE "Flashcard" ALTER COLUMN "deckId" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Drop legacy indexes that referenced the columns being removed.
--    Indexes must drop before their columns or Postgres rejects the DROP.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS "Flashcard_ownerId_category_subcategory_idx";
DROP INDEX IF EXISTS "Flashcard_ownerId_reviewStatus_idx";

-- ---------------------------------------------------------------------------
-- 3. Drop the legacy columns.
-- ---------------------------------------------------------------------------

ALTER TABLE "Flashcard"
  DROP COLUMN "category",
  DROP COLUMN "subcategory",
  DROP COLUMN "reviewStatus",
  DROP COLUMN "reviewCount",
  DROP COLUMN "masteredAt";

-- ---------------------------------------------------------------------------
-- 4. Drop the now-unused FlashcardReviewStatus enum.
--    FlashcardReviewOutcome stays (still on FlashcardReviewAttempt rows
--    written by the legacy /[id]/review endpoint).
-- ---------------------------------------------------------------------------

DROP TYPE "FlashcardReviewStatus";
