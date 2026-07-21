-- Epoch 13 collaboration foundations.
-- Yjs/Hocuspocus state is authoritative once a document is collaboration-enabled.

CREATE TABLE IF NOT EXISTS "CollaborationDocument" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contentId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "documentName" VARCHAR(160) NOT NULL,
    "ydocState" BYTEA,
    "snapshotJson" JSONB,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "enabledAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollaborationDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationDocument_contentId_key"
  ON "CollaborationDocument"("contentId");

CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationDocument_documentName_key"
  ON "CollaborationDocument"("documentName");

CREATE INDEX IF NOT EXISTS "CollaborationDocument_ownerId_updatedAt_idx"
  ON "CollaborationDocument"("ownerId", "updatedAt");

DO $$ BEGIN
  ALTER TABLE "CollaborationDocument" ADD CONSTRAINT "CollaborationDocument_contentId_fkey"
    FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CollaborationDocument" ADD CONSTRAINT "CollaborationDocument_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
