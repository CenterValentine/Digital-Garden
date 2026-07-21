CREATE TYPE "FlashcardReviewStatus" AS ENUM ('new', 'review', 'mastered', 'archived');
CREATE TYPE "FlashcardReviewOutcome" AS ENUM ('review', 'mastered');
CREATE TYPE "FlashcardReviewMode" AS ENUM ('front_to_back', 'back_to_front', 'random');
CREATE TYPE "FlashcardShownSide" AS ENUM ('front', 'back');

CREATE TABLE "Flashcard" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ownerId" UUID NOT NULL,
  "sourceContentId" UUID,
  "frontLabel" VARCHAR(80) NOT NULL DEFAULT 'Question',
  "backLabel" VARCHAR(80) NOT NULL DEFAULT 'Answer',
  "frontContent" JSONB NOT NULL,
  "backContent" JSONB NOT NULL,
  "isFrontRichText" BOOLEAN NOT NULL DEFAULT false,
  "category" VARCHAR(120) NOT NULL DEFAULT 'General',
  "subcategory" VARCHAR(120) NOT NULL DEFAULT '',
  "reviewStatus" "FlashcardReviewStatus" NOT NULL DEFAULT 'new',
  "reviewCount" INTEGER NOT NULL DEFAULT 0,
  "lastReviewedAt" TIMESTAMPTZ(6),
  "masteredAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "Flashcard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlashcardReviewAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "flashcardId" UUID NOT NULL,
  "ownerId" UUID NOT NULL,
  "outcome" "FlashcardReviewOutcome" NOT NULL,
  "reviewMode" "FlashcardReviewMode" NOT NULL,
  "shownSide" "FlashcardShownSide" NOT NULL,
  "responseTimeMs" INTEGER,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FlashcardReviewAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Flashcard_ownerId_category_subcategory_idx" ON "Flashcard"("ownerId", "category", "subcategory");
CREATE INDEX "Flashcard_ownerId_reviewStatus_idx" ON "Flashcard"("ownerId", "reviewStatus");
CREATE INDEX "Flashcard_sourceContentId_idx" ON "Flashcard"("sourceContentId");
CREATE INDEX "FlashcardReviewAttempt_flashcardId_createdAt_idx" ON "FlashcardReviewAttempt"("flashcardId", "createdAt");
CREATE INDEX "FlashcardReviewAttempt_ownerId_createdAt_idx" ON "FlashcardReviewAttempt"("ownerId", "createdAt");

ALTER TABLE "Flashcard"
  ADD CONSTRAINT "Flashcard_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Flashcard"
  ADD CONSTRAINT "Flashcard_sourceContentId_fkey"
  FOREIGN KEY ("sourceContentId") REFERENCES "ContentNode"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FlashcardReviewAttempt"
  ADD CONSTRAINT "FlashcardReviewAttempt_flashcardId_fkey"
  FOREIGN KEY ("flashcardId") REFERENCES "Flashcard"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FlashcardReviewAttempt"
  ADD CONSTRAINT "FlashcardReviewAttempt_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
