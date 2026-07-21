-- Catch-Up Migration: Sync Migration History with Database
-- This migration captures schema changes that were applied via db push
-- These changes already exist in the database, so this migration will be marked as applied

-- Create AuditLog table (already exists)
CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "action" VARCHAR(100) NOT NULL,
  "targetUserId" UUID,
  "targetContentId" UUID,
  "details" JSONB NOT NULL DEFAULT '{}',
  "ipAddress" VARCHAR(45),
  "userAgent" VARCHAR(512),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- Add indexes for AuditLog (if not exist)
CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_targetUserId_createdAt_idx" ON "AuditLog"("targetUserId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);

-- Add foreign keys for AuditLog (if not exist)
DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetUserId_fkey"
    FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetContentId_fkey"
    FOREIGN KEY ("targetContentId") REFERENCES "ContentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add Account provider index (if not exist)
CREATE INDEX IF NOT EXISTS "Account_provider_idx" ON "Account"("provider");

-- Add ContentTag positions column (if not exist)
DO $$ BEGIN
  ALTER TABLE "ContentTag" ADD COLUMN "positions" JSONB NOT NULL DEFAULT '[]';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Add User settings columns (if not exist)
DO $$ BEGIN
  ALTER TABLE "User" ADD COLUMN "settings" JSONB;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "User" ADD COLUMN "settingsVersion" INTEGER NOT NULL DEFAULT 1;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Note: Index/constraint changes for Tag table are handled by Prisma's diff internally
-- This migration captures the major structural changes
