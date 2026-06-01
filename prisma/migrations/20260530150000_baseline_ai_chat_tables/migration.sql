-- Baseline AI Chat Revamp tables.
--
-- These tables (AIConnection, AIFeatureRoute, Conversation,
-- ConversationMessage, ConversationAssociation) were introduced during
-- the AI Chat Revamp epic but were applied to dev/prod via
-- `prisma db push` without ever being committed to the migration
-- history. This migration brings the migration history in line with
-- what schema.prisma has declared.
--
-- Every statement is idempotent — `CREATE TABLE IF NOT EXISTS`, native
-- where possible; `DO` blocks for enum + constraint creation (Postgres
-- has no native `IF NOT EXISTS` for those). Safe to apply against:
--   - dev (tables exist; this is a no-op + immediately marked applied
--     via `prisma migrate resolve --applied 20260530150000_...`)
--   - prod (tables exist from earlier `db push` deploys; this is a
--     no-op + same `migrate resolve` step)
--   - fresh installs / preview branches (tables don't exist; this
--     creates them).

-- ─── Enums ──────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "ChatMessageRole" AS ENUM ('user', 'assistant', 'system', 'tool');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ConversationAssociationSource" AS ENUM ('snapshot', 'manual', 'auto');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ConnectionKind" AS ENUM ('direct', 'gateway', 'custom');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── Tables ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Conversation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "title" VARCHAR(255),
    "archivedToContentNodeId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ConversationMessage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversationId" UUID NOT NULL,
    "role" "ChatMessageRole" NOT NULL,
    "providerId" VARCHAR(50),
    "modelId" VARCHAR(100),
    "parts" JSONB NOT NULL,
    "textCache" TEXT,
    "parentId" UUID,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ConversationAssociation" (
    "conversationId" UUID NOT NULL,
    "contentNodeId" UUID NOT NULL,
    "source" "ConversationAssociationSource" NOT NULL,
    "lastReferencedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationAssociation_pkey" PRIMARY KEY ("conversationId","contentNodeId")
);

CREATE TABLE IF NOT EXISTS "AIConnection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "kind" "ConnectionKind" NOT NULL,
    "presetId" VARCHAR(50),
    "label" VARCHAR(120) NOT NULL,
    "baseURL" VARCHAR(500),
    "encryptedKey" TEXT NOT NULL,
    "adapterKind" VARCHAR(50) NOT NULL,
    "models" JSONB NOT NULL DEFAULT '[]',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "pinOrder" INTEGER,
    "preferRouteVia" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "AIConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AIFeatureRoute" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "featureId" VARCHAR(100) NOT NULL,
    "position" INTEGER NOT NULL,
    "connectionId" UUID NOT NULL,
    "modelId" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AIFeatureRoute_pkey" PRIMARY KEY ("id")
);

-- ─── Indexes ────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_archivedToContentNodeId_key" ON "Conversation"("archivedToContentNodeId");
CREATE INDEX IF NOT EXISTS "Conversation_ownerId_updatedAt_idx" ON "Conversation"("ownerId", "updatedAt");
CREATE INDEX IF NOT EXISTS "Conversation_ownerId_deletedAt_idx" ON "Conversation"("ownerId", "deletedAt");
CREATE INDEX IF NOT EXISTS "ConversationMessage_conversationId_createdAt_idx" ON "ConversationMessage"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "ConversationMessage_conversationId_parentId_idx" ON "ConversationMessage"("conversationId", "parentId");
CREATE INDEX IF NOT EXISTS "ConversationAssociation_contentNodeId_idx" ON "ConversationAssociation"("contentNodeId");
CREATE INDEX IF NOT EXISTS "ConversationAssociation_conversationId_source_lastReference_idx" ON "ConversationAssociation"("conversationId", "source", "lastReferencedAt");
CREATE INDEX IF NOT EXISTS "AIConnection_ownerId_kind_idx" ON "AIConnection"("ownerId", "kind");
CREATE INDEX IF NOT EXISTS "AIConnection_ownerId_isPinned_pinOrder_idx" ON "AIConnection"("ownerId", "isPinned", "pinOrder");
CREATE INDEX IF NOT EXISTS "AIConnection_ownerId_deletedAt_idx" ON "AIConnection"("ownerId", "deletedAt");
CREATE INDEX IF NOT EXISTS "AIFeatureRoute_ownerId_featureId_idx" ON "AIFeatureRoute"("ownerId", "featureId");
CREATE INDEX IF NOT EXISTS "AIFeatureRoute_connectionId_idx" ON "AIFeatureRoute"("connectionId");
CREATE UNIQUE INDEX IF NOT EXISTS "AIFeatureRoute_ownerId_featureId_position_key" ON "AIFeatureRoute"("ownerId", "featureId", "position");

-- ─── Foreign keys ───────────────────────────────────────────────────
--
-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS`; we wrap each in a
-- DO block that checks pg_constraint by name first.

DO $$ BEGIN
  ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_archivedToContentNodeId_fkey" FOREIGN KEY ("archivedToContentNodeId") REFERENCES "ContentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ConversationMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ConversationAssociation" ADD CONSTRAINT "ConversationAssociation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ConversationAssociation" ADD CONSTRAINT "ConversationAssociation_contentNodeId_fkey" FOREIGN KEY ("contentNodeId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "AIConnection" ADD CONSTRAINT "AIConnection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "AIFeatureRoute" ADD CONSTRAINT "AIFeatureRoute_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "AIFeatureRoute" ADD CONSTRAINT "AIFeatureRoute_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "AIConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
