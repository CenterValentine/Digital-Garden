CREATE TABLE "PeriodicNoteIndex" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ownerId" UUID NOT NULL,
  "kind" VARCHAR(20) NOT NULL,
  "periodKey" VARCHAR(32) NOT NULL,
  "contentId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "PeriodicNoteIndex_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PeriodicNoteIndex_ownerId_kind_periodKey_key"
  ON "PeriodicNoteIndex"("ownerId", "kind", "periodKey");

CREATE INDEX "PeriodicNoteIndex_contentId_idx"
  ON "PeriodicNoteIndex"("contentId");

ALTER TABLE "PeriodicNoteIndex"
  ADD CONSTRAINT "PeriodicNoteIndex_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PeriodicNoteIndex"
  ADD CONSTRAINT "PeriodicNoteIndex_contentId_fkey"
  FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
