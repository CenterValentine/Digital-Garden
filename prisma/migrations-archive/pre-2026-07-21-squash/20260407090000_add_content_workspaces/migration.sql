-- Epoch 14 Sprint 65: Saved content workspaces.
-- This migration is intentionally additive. It never deletes user content.

DO $$ BEGIN
  CREATE TYPE "ContentWorkspaceStatus" AS ENUM ('active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ContentWorkspaceItemAssignmentType" AS ENUM ('primary', 'shared', 'borrowed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ContentWorkspaceItemScope" AS ENUM ('item', 'recursive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ContentWorkspace" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "status" "ContentWorkspaceStatus" NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMPTZ(6),
    "archivedAt" TIMESTAMPTZ(6),
    "layoutMode" VARCHAR(32) NOT NULL DEFAULT 'single',
    "activePaneId" VARCHAR(32) NOT NULL DEFAULT 'top-left',
    "paneState" JSONB NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ContentWorkspaceItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "assignmentType" "ContentWorkspaceItemAssignmentType" NOT NULL DEFAULT 'primary',
    "scope" "ContentWorkspaceItemScope" NOT NULL DEFAULT 'item',
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentWorkspaceItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContentWorkspace_ownerId_slug_key" ON "ContentWorkspace"("ownerId", "slug");
CREATE INDEX IF NOT EXISTS "ContentWorkspace_ownerId_status_idx" ON "ContentWorkspace"("ownerId", "status");
CREATE INDEX IF NOT EXISTS "ContentWorkspace_ownerId_isMain_idx" ON "ContentWorkspace"("ownerId", "isMain");
CREATE INDEX IF NOT EXISTS "ContentWorkspace_expiresAt_idx" ON "ContentWorkspace"("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "ContentWorkspaceItem_workspaceId_contentId_key" ON "ContentWorkspaceItem"("workspaceId", "contentId");
CREATE INDEX IF NOT EXISTS "ContentWorkspaceItem_contentId_assignmentType_expiresAt_idx" ON "ContentWorkspaceItem"("contentId", "assignmentType", "expiresAt");
CREATE INDEX IF NOT EXISTS "ContentWorkspaceItem_workspaceId_assignmentType_idx" ON "ContentWorkspaceItem"("workspaceId", "assignmentType");
CREATE INDEX IF NOT EXISTS "ContentWorkspaceItem_expiresAt_idx" ON "ContentWorkspaceItem"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "ContentWorkspace" ADD CONSTRAINT "ContentWorkspace_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContentWorkspaceItem" ADD CONSTRAINT "ContentWorkspaceItem_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "ContentWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContentWorkspaceItem" ADD CONSTRAINT "ContentWorkspaceItem_contentId_fkey"
    FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
