-- Store advisory collaboration presence in Postgres so Vercel serverless instances
-- share one cross-session view. Hocuspocus awareness remains the live transport
-- signal, while this table powers tab/share presence discs and promotion hints.

CREATE TABLE IF NOT EXISTS "CollaborationPresence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contentId" UUID NOT NULL,
    "userId" VARCHAR(160) NOT NULL,
    "displayName" VARCHAR(120),
    "avatarUrl" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "sessionId" VARCHAR(160) NOT NULL,
    "browserContextId" VARCHAR(160) NOT NULL,
    "surfaceCount" INTEGER NOT NULL DEFAULT 0,
    "activePaneIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "activeTabIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "transportState" VARCHAR(40) NOT NULL DEFAULT 'localOnly',
    "lastKnownServerRevision" INTEGER,
    "firstSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollaborationPresence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationPresence_contentId_sessionId_key"
  ON "CollaborationPresence"("contentId", "sessionId");

CREATE INDEX IF NOT EXISTS "CollaborationPresence_contentId_lastSeenAt_idx"
  ON "CollaborationPresence"("contentId", "lastSeenAt");

CREATE INDEX IF NOT EXISTS "CollaborationPresence_sessionId_idx"
  ON "CollaborationPresence"("sessionId");

DO $$ BEGIN
  ALTER TABLE "CollaborationPresence" ADD CONSTRAINT "CollaborationPresence_contentId_fkey"
    FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
