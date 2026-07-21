-- Migration A: Flashcards FSRS expand (Epoch 19, Sprint 1)
--
-- Additive-only schema changes for the FSRS scheduling rewrite and the
-- editor flashcardEmbed block. NO destructive operations in this file:
--   - No DROP COLUMN
--   - No ALTER COLUMN ... SET NOT NULL on populated tables
--   - deckId on Flashcard stays NULLABLE so existing rows validate
--
-- Migration B (separate script) backfills FlashcardDeck rows and populates
-- Flashcard.deckId. Migration C (separate PR) then alters deckId to
-- NOT NULL and drops the legacy category/subcategory/reviewStatus/
-- reviewCount/masteredAt columns.
--
-- Plan: docs/notes-feature/work-tracking/FLASHCARDS-FSRS-PLAN.md

-- ---------------------------------------------------------------------------
-- 1. Extend FlashcardReviewMode with a "reference" value so the editor block
--    can log reference-mode skims without polluting the scheduler.
--    Postgres 12+ allows ALTER TYPE ADD VALUE inside a transaction as long
--    as the value isn't read in the same transaction; we never SELECT
--    against it here, so this is safe.
-- ---------------------------------------------------------------------------

ALTER TYPE "FlashcardReviewMode" ADD VALUE IF NOT EXISTS 'reference';

-- ---------------------------------------------------------------------------
-- 2. New FSRS enums.
-- ---------------------------------------------------------------------------

CREATE TYPE "FlashcardState" AS ENUM (
  'new', 'learning', 'review', 'relearning', 'suspended', 'archived'
);

CREATE TYPE "FlashcardRating" AS ENUM (
  'again', 'hard', 'good', 'easy'
);

CREATE TYPE "FlashcardCardType" AS ENUM ('basic');

-- ---------------------------------------------------------------------------
-- 3. FlashcardDeck table. Nested via parentDeckId + materialized `path`
--    (e.g. "spanish/verbs/irregular") for cheap descendant queries.
-- ---------------------------------------------------------------------------

CREATE TABLE "FlashcardDeck" (
  "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "ownerId"       UUID         NOT NULL,
  "parentDeckId"  UUID,
  "name"          VARCHAR(120) NOT NULL,
  "slug"          VARCHAR(140) NOT NULL,
  "path"          VARCHAR(500) NOT NULL,
  "description"   VARCHAR(500),
  "displayOrder"  INTEGER      NOT NULL DEFAULT 0,
  "iconName"      VARCHAR(60),
  "iconColor"     VARCHAR(20),
  "createdAt"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMPTZ(6) NOT NULL,
  "deletedAt"     TIMESTAMPTZ(6),

  CONSTRAINT "FlashcardDeck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FlashcardDeck_ownerId_slug_key"
  ON "FlashcardDeck"("ownerId", "slug");

CREATE UNIQUE INDEX "FlashcardDeck_ownerId_parentDeckId_name_key"
  ON "FlashcardDeck"("ownerId", "parentDeckId", "name");

CREATE INDEX "FlashcardDeck_ownerId_deletedAt_idx"
  ON "FlashcardDeck"("ownerId", "deletedAt");

CREATE INDEX "FlashcardDeck_ownerId_path_idx"
  ON "FlashcardDeck"("ownerId", "path");

CREATE INDEX "FlashcardDeck_parentDeckId_displayOrder_idx"
  ON "FlashcardDeck"("parentDeckId", "displayOrder");

ALTER TABLE "FlashcardDeck"
  ADD CONSTRAINT "FlashcardDeck_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FlashcardDeck"
  ADD CONSTRAINT "FlashcardDeck_parentDeckId_fkey"
  FOREIGN KEY ("parentDeckId") REFERENCES "FlashcardDeck"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Flashcard column additions. All NOT NULL columns get defaults so
--    existing rows continue to validate. deckId intentionally NULLABLE
--    until Migration B populates it.
-- ---------------------------------------------------------------------------

ALTER TABLE "Flashcard"
  ADD COLUMN "deckId"        UUID,
  ADD COLUMN "cardType"      "FlashcardCardType" NOT NULL DEFAULT 'basic',
  ADD COLUMN "state"         "FlashcardState"    NOT NULL DEFAULT 'new',
  ADD COLUMN "due"           TIMESTAMPTZ(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "stability"     DOUBLE PRECISION    NOT NULL DEFAULT 0,
  ADD COLUMN "difficulty"    DOUBLE PRECISION    NOT NULL DEFAULT 0,
  ADD COLUMN "elapsedDays"   DOUBLE PRECISION    NOT NULL DEFAULT 0,
  ADD COLUMN "scheduledDays" DOUBLE PRECISION    NOT NULL DEFAULT 0,
  ADD COLUMN "reps"          INTEGER             NOT NULL DEFAULT 0,
  ADD COLUMN "lapses"        INTEGER             NOT NULL DEFAULT 0,
  ADD COLUMN "suspendedAt"   TIMESTAMPTZ(6),
  ADD COLUMN "archivedAt"    TIMESTAMPTZ(6),
  ADD COLUMN "deletedAt"     TIMESTAMPTZ(6);

ALTER TABLE "Flashcard"
  ADD CONSTRAINT "Flashcard_deckId_fkey"
  FOREIGN KEY ("deckId") REFERENCES "FlashcardDeck"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Flashcard_ownerId_deckId_idx"
  ON "Flashcard"("ownerId", "deckId");

CREATE INDEX "Flashcard_ownerId_due_idx"
  ON "Flashcard"("ownerId", "due");

CREATE INDEX "Flashcard_ownerId_state_due_idx"
  ON "Flashcard"("ownerId", "state", "due");

CREATE INDEX "Flashcard_ownerId_deletedAt_idx"
  ON "Flashcard"("ownerId", "deletedAt");

-- ---------------------------------------------------------------------------
-- 5. FlashcardReviewAttempt column additions. rating is NULLABLE so:
--    a) back-compat rows (binary outcome only) coexist
--    b) reference-mode skims log a row with rating IS NULL and are skipped
--       by the FSRS optimizer.
-- ---------------------------------------------------------------------------

ALTER TABLE "FlashcardReviewAttempt"
  ADD COLUMN "rating"              "FlashcardRating",
  ADD COLUMN "stateBefore"         "FlashcardState",
  ADD COLUMN "stateAfter"          "FlashcardState",
  ADD COLUMN "previousDue"         TIMESTAMPTZ(6),
  ADD COLUMN "scheduledDue"        TIMESTAMPTZ(6),
  ADD COLUMN "previousStability"   DOUBLE PRECISION,
  ADD COLUMN "newStability"        DOUBLE PRECISION,
  ADD COLUMN "previousDifficulty"  DOUBLE PRECISION,
  ADD COLUMN "newDifficulty"       DOUBLE PRECISION;

CREATE INDEX "FlashcardReviewAttempt_ownerId_rating_createdAt_idx"
  ON "FlashcardReviewAttempt"("ownerId", "rating", "createdAt");

-- ---------------------------------------------------------------------------
-- 6. User-level FSRS settings. fsrsParameters starts as `{}` (= use library
--    defaults); the optimizer fills it in once the user has enough review
--    history. desiredRetention default 0.9 matches Anki.
-- ---------------------------------------------------------------------------

ALTER TABLE "User"
  ADD COLUMN "fsrsParameters"         JSONB            NOT NULL DEFAULT '{}',
  ADD COLUMN "desiredRetention"       DOUBLE PRECISION NOT NULL DEFAULT 0.9,
  ADD COLUMN "fsrsMaxInterval"        INTEGER          NOT NULL DEFAULT 36500,
  ADD COLUMN "defaultFlashcardDeckId" UUID;

-- Intentionally no FK on User.defaultFlashcardDeckId in this migration: the
-- deck table is being created in the same migration and the value is
-- application-managed. Application code resolves stale references
-- gracefully (same pattern used by ContentNode.parentId).
