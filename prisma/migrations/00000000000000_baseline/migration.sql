-- Migration baseline (2026-07) — the full current schema as one migration.
--
-- Adopts a migration-based workflow. The project iterated its schema with
-- `db push`, so the migration history had fallen behind schema.prisma. This
-- from-empty baseline (`prisma migrate diff --from-empty --to-schema`)
-- reproduces the entire current schema (94 tables) so any environment can be
-- provisioned from migrations. Runbook:
--   docs/notes-feature/guides/database/MIGRATION-BASELINE-SQUASH.md
--
-- Existing databases already contain every table, so they ADOPT this baseline
-- via a metadata-only step (no DDL, no data touched) rather than running it:
--   npx prisma migrate resolve --applied 00000000000000_baseline
--
-- Trigram search indexes need pg_trgm; the from-empty diff omits extensions,
-- so it is declared explicitly here.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('folder', 'note', 'file', 'html', 'template', 'code', 'external', 'chat', 'visualization', 'data', 'hope', 'workflow');

-- CreateEnum
CREATE TYPE "ContentRole" AS ENUM ('primary', 'referenced', 'system');

-- CreateEnum
CREATE TYPE "FolderViewMode" AS ENUM ('list', 'gallery', 'kanban', 'dashboard', 'canvas');

-- CreateEnum
CREATE TYPE "ContentWorkspaceStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "ContentWorkspaceItemAssignmentType" AS ENUM ('primary', 'shared', 'borrowed');

-- CreateEnum
CREATE TYPE "ContentWorkspaceItemScope" AS ENUM ('item', 'recursive');

-- CreateEnum
CREATE TYPE "FlashcardReviewOutcome" AS ENUM ('review', 'mastered');

-- CreateEnum
CREATE TYPE "FlashcardReviewMode" AS ENUM ('front_to_back', 'back_to_front', 'random', 'reference');

-- CreateEnum
CREATE TYPE "FlashcardShownSide" AS ENUM ('front', 'back');

-- CreateEnum
CREATE TYPE "FlashcardState" AS ENUM ('new', 'learning', 'review', 'relearning', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "FlashcardRating" AS ENUM ('again', 'hard', 'good', 'easy');

-- CreateEnum
CREATE TYPE "FlashcardCardType" AS ENUM ('basic', 'cloze');

-- CreateEnum
CREATE TYPE "ExternalReadingStatus" AS ENUM ('inbox', 'queue', 'reading', 'read', 'archived');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'admin', 'member', 'guest');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('uploading', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('r2', 's3', 'vercel');

-- CreateEnum
CREATE TYPE "ChatMessageRole" AS ENUM ('user', 'assistant', 'system', 'tool');

-- CreateEnum
CREATE TYPE "ConversationAssociationSource" AS ENUM ('snapshot', 'manual', 'auto');

-- CreateEnum
CREATE TYPE "ConnectionKind" AS ENUM ('direct', 'gateway', 'custom');

-- CreateEnum
CREATE TYPE "ReusableCategoryScope" AS ENUM ('content_template', 'snippet', 'page_template', 'saved_block');

-- CreateEnum
CREATE TYPE "PublicItemType" AS ENUM ('blog_post', 'project', 'profile_section', 'case_study', 'bookmark', 'page', 'media_item');

-- CreateEnum
CREATE TYPE "PublishState" AS ENUM ('draft', 'published', 'scheduled', 'unpublished', 'archived');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('unchecked', 'ok', 'warnings', 'blocked');

-- CreateEnum
CREATE TYPE "CoverPosition" AS ENUM ('top', 'center', 'bottom', 'left', 'right');

-- CreateEnum
CREATE TYPE "RelatedStrategy" AS ENUM ('same_path', 'same_tags', 'same_type', 'manual', 'none');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'completed', 'archived', 'wip');

-- CreateEnum
CREATE TYPE "ProfileLayout" AS ENUM ('single_column', 'two_column', 'split_hero', 'timeline');

-- CreateEnum
CREATE TYPE "MediaDisplayVariant" AS ENUM ('gallery', 'slideshow', 'single', 'mosaic');

-- CreateEnum
CREATE TYPE "ConnectionInviteStatus" AS ENUM ('pending', 'accepted', 'declined', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "ActivityActorType" AS ENUM ('user', 'system', 'ai', 'extension');

-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('queued', 'running', 'waiting', 'succeeded', 'failed', 'canceled');

-- CreateTable
CREATE TABLE "ContentNode" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "role" "ContentRole" NOT NULL DEFAULT 'primary',
    "parentId" UUID,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "categoryId" UUID,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "bodyHash" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),
    "deletedBy" UUID,
    "lastViewedAt" TIMESTAMPTZ(6),
    "customIcon" VARCHAR(100),
    "iconColor" VARCHAR(20),
    "peopleGroupId" UUID,
    "personId" UUID,
    "ownedByNoteId" UUID,

    CONSTRAINT "ContentNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "FlashcardDeck" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "parentDeckId" UUID,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "description" VARCHAR(500),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "iconName" VARCHAR(60),
    "iconColor" VARCHAR(20),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "FlashcardDeck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flashcard" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "sourceContentId" UUID,
    "frontLabel" VARCHAR(80) NOT NULL DEFAULT 'Question',
    "backLabel" VARCHAR(80) NOT NULL DEFAULT 'Answer',
    "frontContent" JSONB NOT NULL,
    "backContent" JSONB NOT NULL,
    "isFrontRichText" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMPTZ(6),
    "lastViewedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deckId" UUID NOT NULL,
    "cardType" "FlashcardCardType" NOT NULL DEFAULT 'basic',
    "state" "FlashcardState" NOT NULL DEFAULT 'new',
    "due" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "elapsedDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scheduledDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "learningSteps" INTEGER NOT NULL DEFAULT 0,
    "suspendedAt" TIMESTAMPTZ(6),
    "archivedAt" TIMESTAMPTZ(6),
    "deletedAt" TIMESTAMPTZ(6),
    "noteId" UUID,
    "clozeOrdinal" INTEGER,
    "clozeSourceJson" JSONB,

    CONSTRAINT "Flashcard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlashcardReviewAttempt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "flashcardId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "outcome" "FlashcardReviewOutcome" NOT NULL,
    "reviewMode" "FlashcardReviewMode" NOT NULL,
    "shownSide" "FlashcardShownSide" NOT NULL,
    "responseTimeMs" INTEGER,
    "rating" "FlashcardRating",
    "stateBefore" "FlashcardState",
    "stateAfter" "FlashcardState",
    "previousDue" TIMESTAMPTZ(6),
    "scheduledDue" TIMESTAMPTZ(6),
    "previousStability" DOUBLE PRECISION,
    "newStability" DOUBLE PRECISION,
    "previousDifficulty" DOUBLE PRECISION,
    "newDifficulty" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlashcardReviewAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotePayload" (
    "contentId" UUID NOT NULL,
    "tiptapJson" JSONB NOT NULL,
    "searchText" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "NotePayload_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "FilePayload" (
    "contentId" UUID NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "fileExtension" VARCHAR(10),
    "mimeType" VARCHAR(127) NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "storageProvider" "StorageProvider" NOT NULL DEFAULT 'r2',
    "storageKey" VARCHAR(512) NOT NULL,
    "storageUrl" TEXT,
    "storageMetadata" JSONB NOT NULL DEFAULT '{}',
    "uploadStatus" "UploadStatus" NOT NULL DEFAULT 'uploading',
    "uploadedAt" TIMESTAMPTZ(6),
    "uploadError" TEXT,
    "processingStatus" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "thumbnailUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "blurDataUrl" VARCHAR(2048),
    "duration" INTEGER,
    "lastAccessedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "searchText" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "FilePayload_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "HtmlPayload" (
    "contentId" UUID NOT NULL,
    "html" TEXT NOT NULL,
    "searchText" TEXT NOT NULL DEFAULT '',
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "templateSchema" JSONB,
    "templateMetadata" JSONB NOT NULL DEFAULT '{}',
    "renderMode" VARCHAR(20) NOT NULL DEFAULT 'static',
    "templateEngine" VARCHAR(20),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "HtmlPayload_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "CodePayload" (
    "contentId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "language" VARCHAR(50) NOT NULL,
    "searchText" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CodePayload_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "ContentHistory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contentId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedBy" UUID NOT NULL,
    "changedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPath" (
    "contentId" UUID NOT NULL,
    "path" VARCHAR(2048) NOT NULL,
    "pathSegments" TEXT[],
    "depth" INTEGER NOT NULL,
    "lastUpdated" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ContentPath_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "ContentLink" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sourceId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "linkType" VARCHAR(20) NOT NULL,
    "targetFragment" VARCHAR(255),
    "context" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentTag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contentId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "positions" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "ContentTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrashBin" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contentId" UUID NOT NULL,
    "originalPath" TEXT,
    "deletedBy" UUID NOT NULL,
    "deletedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledDeletion" TIMESTAMPTZ(6) NOT NULL,
    "deletionReason" VARCHAR(255),
    "contentSnapshot" JSONB NOT NULL,

    CONSTRAINT "TrashBin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageProviderConfig" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "provider" "StorageProvider" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "displayName" VARCHAR(100),
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "StorageProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(50) NOT NULL,
    "passwordHash" CHAR(60),
    "email" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'guest',
    "canClaimCustomHosts" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "settings" JSONB,
    "settingsVersion" INTEGER NOT NULL DEFAULT 1,
    "fsrsParameters" JSONB NOT NULL DEFAULT '{}',
    "desiredRetention" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "fsrsMaxInterval" INTEGER NOT NULL DEFAULT 36500,
    "defaultFlashcardDeckId" UUID,
    "primaryTenantId" UUID,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentWorkspace" (
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
    "viewRootContentId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ContentWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentWorkspaceItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "assignmentType" "ContentWorkspaceItemAssignmentType" NOT NULL DEFAULT 'primary',
    "scope" "ContentWorkspaceItemScope" NOT NULL DEFAULT 'item',
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ContentWorkspaceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "ownerId" UUID NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "color" VARCHAR(7),

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewGrant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accessLevel" VARCHAR(20) NOT NULL,
    "grantedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6),

    CONSTRAINT "ViewGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollaborationDocument" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contentId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "documentName" VARCHAR(160) NOT NULL,
    "ydocState" BYTEA,
    "snapshotJson" JSONB,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "enabledAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CollaborationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollaborationPresence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contentId" UUID NOT NULL,
    "userId" VARCHAR(160) NOT NULL,
    "displayName" VARCHAR(120),
    "avatarUrl" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "sessionId" VARCHAR(160) NOT NULL,
    "browserContextId" VARCHAR(160) NOT NULL,
    "surfaceCount" INTEGER NOT NULL DEFAULT 0,
    "activePaneIds" TEXT[],
    "activeTabIds" TEXT[],
    "transportState" VARCHAR(40) NOT NULL DEFAULT 'localOnly',
    "lastKnownServerRevision" INTEGER,
    "firstSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CollaborationPresence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeopleGroup" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "parentGroupId" UUID,
    "defaultForOwnerId" UUID,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "PeopleGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "primaryGroupId" UUID NOT NULL,
    "displayName" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "givenName" VARCHAR(120),
    "familyName" VARCHAR(120),
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "avatarUrl" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "excludeFromAutocomplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeopleFileTreeMount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "contentParentId" UUID,
    "groupId" UUID,
    "personId" UUID,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PeopleFileTreeMount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonMention" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "positions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PersonMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "tokenPrefix" VARCHAR(16) NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['workflows:callback']::TEXT[],
    "lastUsedAt" TIMESTAMPTZ(6),
    "expiresAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ServiceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrowserExtensionToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "tokenPrefix" VARCHAR(16) NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['bookmarks:sync']::TEXT[],
    "lastUsedAt" TIMESTAMPTZ(6),
    "expiresAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BrowserExtensionToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrowserExtensionInstall" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "tokenId" UUID NOT NULL,
    "installInstanceId" VARCHAR(128) NOT NULL,
    "extensionId" VARCHAR(128) NOT NULL,
    "extensionName" VARCHAR(255) NOT NULL,
    "extensionVersion" VARCHAR(64) NOT NULL,
    "browserName" VARCHAR(120) NOT NULL,
    "browserVersion" VARCHAR(64),
    "osName" VARCHAR(120) NOT NULL,
    "osVersion" VARCHAR(64),
    "trustedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BrowserExtensionInstall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookmarkSyncConnection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "tokenId" UUID,
    "name" VARCHAR(120) NOT NULL,
    "appRootId" UUID NOT NULL,
    "chromeRootId" VARCHAR(128) NOT NULL,
    "chromeRootTitle" VARCHAR(255) NOT NULL,
    "lastSyncedAt" TIMESTAMPTZ(6),
    "lastPulledAt" TIMESTAMPTZ(6),
    "lastPushedAt" TIMESTAMPTZ(6),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BookmarkSyncConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookmarkSyncConnectionInstall" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connectionId" UUID NOT NULL,
    "installId" UUID NOT NULL,
    "chromeRootId" VARCHAR(128),
    "chromeRootTitle" VARCHAR(255) NOT NULL DEFAULT 'Bookmarks',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BookmarkSyncConnectionInstall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookmarkSyncLink" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connectionId" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "chromeNodeId" VARCHAR(128) NOT NULL,
    "chromeParentId" VARCHAR(128),
    "nodeType" VARCHAR(20) NOT NULL,
    "normalizedUrl" TEXT,
    "lastKnownTitle" VARCHAR(255),
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BookmarkSyncLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebResource" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "identityUrl" VARCHAR(2048) NOT NULL,
    "normalizedUrl" VARCHAR(2048) NOT NULL,
    "canonicalUrl" VARCHAR(2048),
    "title" VARCHAR(255),
    "faviconUrl" VARCHAR(2048),
    "sourceDomain" VARCHAR(255),
    "sourceHostname" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WebResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebResourceContentLink" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "webResourceId" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WebResourceContentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebResourceViewState" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "installId" UUID NOT NULL,
    "webResourceId" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "state" VARCHAR(20) NOT NULL DEFAULT 'open',
    "layoutMode" VARCHAR(30) NOT NULL DEFAULT 'floating',
    "dockSide" VARCHAR(20),
    "positionX" INTEGER,
    "positionY" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "opacity" DOUBLE PRECISION,
    "embeddedSelector" VARCHAR(2048),
    "embeddedPlacement" VARCHAR(40),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "lastActiveAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WebResourceViewState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "providerAccountId" VARCHAR(255) NOT NULL,
    "refreshToken" TEXT,
    "accessToken" TEXT,
    "scope" TEXT,
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
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

-- CreateTable
CREATE TABLE "FolderPayload" (
    "contentId" UUID NOT NULL,
    "viewMode" "FolderViewMode" NOT NULL DEFAULT 'list',
    "sortMode" VARCHAR(20),
    "viewPrefs" JSONB NOT NULL DEFAULT '{}',
    "includeReferencedContent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "FolderPayload_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "ExternalPayload" (
    "contentId" UUID NOT NULL,
    "webResourceId" UUID,
    "url" TEXT NOT NULL,
    "normalizedUrl" VARCHAR(2048),
    "canonicalUrl" VARCHAR(2048),
    "subtype" VARCHAR(20) DEFAULT 'website',
    "readingStatus" "ExternalReadingStatus" NOT NULL DEFAULT 'inbox',
    "description" TEXT,
    "resourceType" VARCHAR(120),
    "resourceRelationship" VARCHAR(120),
    "userIntent" VARCHAR(120),
    "sourceDomain" VARCHAR(255),
    "sourceHostname" VARCHAR(255),
    "faviconUrl" VARCHAR(2048),
    "preview" JSONB NOT NULL DEFAULT '{}',
    "captureMetadata" JSONB NOT NULL DEFAULT '{}',
    "matchMetadata" JSONB NOT NULL DEFAULT '{}',
    "preserveHtml" BOOLEAN NOT NULL DEFAULT false,
    "preservedHtmlSnapshot" JSONB,
    "preservedHtmlCapturedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ExternalPayload_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "ChatPayload" (
    "contentId" UUID NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ChatPayload_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "title" VARCHAR(255),
    "archivedToContentNodeId" UUID,
    "activeContextId" UUID,
    "targetFolderId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatContext" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "ChatContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
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

-- CreateTable
CREATE TABLE "ConversationAssociation" (
    "conversationId" UUID NOT NULL,
    "contentNodeId" UUID NOT NULL,
    "source" "ConversationAssociationSource" NOT NULL,
    "lastReferencedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationAssociation_pkey" PRIMARY KEY ("conversationId","contentNodeId")
);

-- CreateTable
CREATE TABLE "AIConnection" (
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

-- CreateTable
CREATE TABLE "AIFeatureRoute" (
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

-- CreateTable
CREATE TABLE "VisualizationPayload" (
    "contentId" UUID NOT NULL,
    "engine" VARCHAR(50) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "VisualizationPayload_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "DataPayload" (
    "contentId" UUID NOT NULL,
    "mode" VARCHAR(20) NOT NULL,
    "source" JSONB NOT NULL DEFAULT '{}',
    "schema" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DataPayload_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "HopePayload" (
    "contentId" UUID NOT NULL,
    "kind" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "targetDate" TIMESTAMPTZ(6),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "HopePayload_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "WorkflowPayload" (
    "contentId" UUID NOT NULL,
    "engine" VARCHAR(50) NOT NULL,
    "definition" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkflowPayload_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "ReusableCategory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "scope" "ReusableCategoryScope" NOT NULL,
    "userId" UUID,
    "parentId" UUID,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ReusableCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedBlock" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "blockType" VARCHAR(100) NOT NULL,
    "tiptapJson" JSONB NOT NULL,
    "searchText" TEXT NOT NULL DEFAULT '',
    "categoryId" UUID NOT NULL,
    "userId" UUID,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SavedBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentTemplate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "tiptapJson" JSONB NOT NULL,
    "searchText" TEXT NOT NULL DEFAULT '',
    "categoryId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ContentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snippet" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255),
    "content" TEXT NOT NULL,
    "tiptapJson" JSONB,
    "searchText" TEXT NOT NULL DEFAULT '',
    "categoryId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMPTZ(6),
    "isAiContext" BOOLEAN NOT NULL DEFAULT true,
    "isVisibleInUI" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Snippet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageTemplate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "tiptapJson" JSONB NOT NULL,
    "searchText" TEXT NOT NULL DEFAULT '',
    "categoryId" UUID NOT NULL,
    "userId" UUID,
    "defaultTitle" VARCHAR(255),
    "customIcon" VARCHAR(100),
    "iconColor" VARCHAR(20),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "displayName" VARCHAR(255) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'active',
    "syncStatus" VARCHAR(20) NOT NULL DEFAULT 'idle',
    "providerConfig" JSONB NOT NULL DEFAULT '{}',
    "syncCursor" TEXT,
    "lastSyncedAt" TIMESTAMPTZ(6),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSource" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "connectionId" UUID,
    "title" VARCHAR(255) NOT NULL,
    "color" VARCHAR(7) NOT NULL DEFAULT '#2563EB',
    "timezone" VARCHAR(100),
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "isReadOnly" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "syncMode" VARCHAR(20) NOT NULL DEFAULT 'local',
    "externalCalendarId" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "lastSyncedAt" TIMESTAMPTZ(6),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CalendarSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "externalEventId" VARCHAR(512),
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "location" VARCHAR(512),
    "startAt" TIMESTAMPTZ(6) NOT NULL,
    "endAt" TIMESTAMPTZ(6) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "timezone" VARCHAR(100),
    "recurrenceRule" TEXT,
    "recurrenceExDates" JSONB NOT NULL DEFAULT '[]',
    "recurrenceOverrides" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    "meetingUrl" VARCHAR(512),
    "linkedContentId" UUID,
    "providerMetadata" JSONB NOT NULL DEFAULT '{}',
    "lastSyncedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventAttendee" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "eventId" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(255),
    "isOrganizer" BOOLEAN NOT NULL DEFAULT false,
    "responseStatus" VARCHAR(20) NOT NULL DEFAULT 'needs_action',

    CONSTRAINT "CalendarEventAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "displayName" VARCHAR(255) NOT NULL,
    "isPersonal" BOOLEAN NOT NULL DEFAULT false,
    "homeTemplate" VARCHAR(120),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitePage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "kind" VARCHAR(60) NOT NULL,
    "navLabel" VARCHAR(120),
    "navOrder" INTEGER NOT NULL DEFAULT 0,
    "visibility" TEXT NOT NULL DEFAULT 'draft',
    "config" JSONB NOT NULL DEFAULT '{}',
    "draftConfig" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SitePage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantHost" (
    "host" VARCHAR(253) NOT NULL,
    "tenantId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMPTZ(6),
    "vercelConfigData" JSONB,

    CONSTRAINT "TenantHost_pkey" PRIMARY KEY ("host")
);

-- CreateTable
CREATE TABLE "PublicPath" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "parentId" UUID,
    "tenantId" UUID,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "icon" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PublicPath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Series" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "heroImageUrl" VARCHAR(2048),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "tenantId" UUID,
    "contentNodeId" UUID NOT NULL,
    "pathId" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "payloadType" "PublicItemType" NOT NULL,
    "publicTitle" VARCHAR(255),
    "publicTags" TEXT[],
    "state" "PublishState" NOT NULL DEFAULT 'draft',
    "scheduledFor" TIMESTAMPTZ(6),
    "workingRevisionId" UUID,
    "publishedRevisionId" UUID,
    "seriesId" UUID,
    "seriesOrder" INTEGER,
    "deletedAt" TIMESTAMPTZ(6),
    "firstPublishedAt" TIMESTAMPTZ(6),
    "lastPublishedAt" TIMESTAMPTZ(6),
    "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'unchecked',
    "validationCheckedAt" TIMESTAMPTZ(6),
    "validationIssues" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PublicItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicItemRevision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "publicItemId" UUID NOT NULL,
    "bodyJson" JSONB NOT NULL,
    "metadataSnapshot" JSONB NOT NULL DEFAULT '{}',
    "ogTitle" VARCHAR(255),
    "ogDescription" TEXT,
    "ogImageUrl" VARCHAR(2048),
    "readingTimeMinutes" INTEGER,
    "wordCount" INTEGER,
    "note" VARCHAR(500),
    "bodyHash" VARCHAR(64) NOT NULL,
    "metadataHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(6),
    "authorId" UUID NOT NULL,

    CONSTRAINT "PublicItemRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicPathRedirect" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "tenantId" UUID,
    "fromPath" VARCHAR(2048) NOT NULL,
    "toPathId" UUID,
    "toPublicItemId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PublicPathRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreviewToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token" VARCHAR(255) NOT NULL,
    "publicItemId" UUID NOT NULL,
    "revisionId" UUID,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "accessCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PreviewToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogPostPayload" (
    "publicItemId" UUID NOT NULL,
    "coverImageUrl" VARCHAR(2048),
    "coverPosition" "CoverPosition" NOT NULL DEFAULT 'center',
    "excerpt" TEXT,
    "canonicalUrl" VARCHAR(2048),
    "relatedStrategy" "RelatedStrategy" NOT NULL DEFAULT 'same_tags',
    "relatedItemIds" UUID[],

    CONSTRAINT "BlogPostPayload_pkey" PRIMARY KEY ("publicItemId")
);

-- CreateTable
CREATE TABLE "ProjectPayload" (
    "publicItemId" UUID NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "coverImageUrl" VARCHAR(2048),
    "coverPosition" "CoverPosition" NOT NULL DEFAULT 'center',
    "repoUrl" VARCHAR(2048),
    "liveUrl" VARCHAR(2048),
    "technologies" TEXT[],

    CONSTRAINT "ProjectPayload_pkey" PRIMARY KEY ("publicItemId")
);

-- CreateTable
CREATE TABLE "ProfileSectionPayload" (
    "publicItemId" UUID NOT NULL,
    "layout" "ProfileLayout" NOT NULL DEFAULT 'single_column',
    "avatarUrl" VARCHAR(2048),
    "headline" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ProfileSectionPayload_pkey" PRIMARY KEY ("publicItemId")
);

-- CreateTable
CREATE TABLE "CaseStudyPayload" (
    "publicItemId" UUID NOT NULL,
    "coverImageUrl" VARCHAR(2048),
    "coverPosition" "CoverPosition" NOT NULL DEFAULT 'center',
    "clientName" VARCHAR(255),
    "outcome" VARCHAR(500),
    "technologies" TEXT[],
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),

    CONSTRAINT "CaseStudyPayload_pkey" PRIMARY KEY ("publicItemId")
);

-- CreateTable
CREATE TABLE "BookmarkPayload" (
    "publicItemId" UUID NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "ogTitle" VARCHAR(255),
    "ogDescription" TEXT,
    "ogImageUrl" VARCHAR(2048),
    "siteName" VARCHAR(255),

    CONSTRAINT "BookmarkPayload_pkey" PRIMARY KEY ("publicItemId")
);

-- CreateTable
CREATE TABLE "PagePayload" (
    "publicItemId" UUID NOT NULL,
    "coverImageUrl" VARCHAR(2048),
    "coverPosition" "CoverPosition" NOT NULL DEFAULT 'center',
    "isRoot" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "PagePayload_pkey" PRIMARY KEY ("publicItemId")
);

-- CreateTable
CREATE TABLE "MediaItemPayload" (
    "publicItemId" UUID NOT NULL,
    "displayVariant" "MediaDisplayVariant" NOT NULL DEFAULT 'single',
    "caption" TEXT,
    "altText" VARCHAR(500),
    "credit" VARCHAR(255),
    "mediaContentIds" UUID[],

    CONSTRAINT "MediaItemPayload_pkey" PRIMARY KEY ("publicItemId")
);

-- CreateTable
CREATE TABLE "ConnectionInvite" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inviterId" UUID NOT NULL,
    "inviteeIdentifier" VARCHAR(255) NOT NULL,
    "inviteeUserId" UUID,
    "status" "ConnectionInviteStatus" NOT NULL DEFAULT 'pending',
    "message" VARCHAR(280),
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "respondedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ConnectionInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserConnection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userAId" UUID NOT NULL,
    "userBId" UUID NOT NULL,
    "connectedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),
    "deletedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "UserConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "blockerId" UUID NOT NULL,
    "blockedUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" VARCHAR(100) NOT NULL,
    "actorType" "ActivityActorType" NOT NULL,
    "actorUserId" UUID,
    "actorLabel" VARCHAR(120),
    "payload" JSONB NOT NULL,
    "subjectType" VARCHAR(50),
    "subjectId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "collapseKey" VARCHAR(120),
    "readAt" TIMESTAMPTZ(6),
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmThread" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pairKey" VARCHAR(80),
    "lastMessageAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DmThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmParticipant" (
    "threadId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadAt" TIMESTAMPTZ(6),
    "lastActiveAt" TIMESTAMPTZ(6),
    "archivedAt" TIMESTAMPTZ(6),
    "deletedAt" TIMESTAMPTZ(6),
    "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmParticipant_pkey" PRIMARY KEY ("threadId","userId")
);

-- CreateTable
CREATE TABLE "DmMessage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "threadId" UUID NOT NULL,
    "senderId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMPTZ(6),
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "DmMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitCounter" (
    "key" VARCHAR(160) NOT NULL,
    "windowStart" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "WorkflowDefinition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "engine" VARCHAR(50) NOT NULL,
    "engineRef" VARCHAR(200) NOT NULL,
    "inputSchema" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "definitionId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'queued',
    "engine" VARCHAR(50) NOT NULL,
    "engineRunId" VARCHAR(200),
    "engineGateRef" TEXT,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "error" JSONB,
    "gateToken" VARCHAR(200),
    "conversationId" UUID,
    "startedAt" TIMESTAMPTZ(6),
    "finishedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRunEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "runId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "key" VARCHAR(200),
    "type" VARCHAR(50) NOT NULL,
    "stepName" VARCHAR(120),
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRunArtifact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "runId" UUID NOT NULL,
    "contentNodeId" UUID NOT NULL,
    "kind" VARCHAR(50) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRunArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgenticMetadata" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nodeId" UUID NOT NULL,
    "tiptapJson" JSONB NOT NULL,
    "derivedText" TEXT NOT NULL DEFAULT '',
    "sectionsMeta" JSONB NOT NULL DEFAULT '{}',
    "sourceContentHash" VARCHAR(64),
    "contextDirty" BOOLEAN NOT NULL DEFAULT false,
    "summaryHash" VARCHAR(64),
    "contextOptOut" BOOLEAN NOT NULL DEFAULT false,
    "model" VARCHAR(100),
    "generatedAt" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AgenticMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioSourceSelection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "folderId" UUID NOT NULL,
    "includedNodeIds" JSONB NOT NULL DEFAULT '[]',
    "excludedNodeIds" JSONB NOT NULL DEFAULT '[]',
    "tokenBudget" INTEGER NOT NULL DEFAULT 64000,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "StudioSourceSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioGenerationRun" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "folderId" UUID NOT NULL,
    "toolId" VARCHAR(50) NOT NULL,
    "variantId" VARCHAR(50),
    "sourceNodeIds" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(20) NOT NULL DEFAULT 'running',
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "stepTotal" INTEGER NOT NULL DEFAULT 1,
    "stepLabel" VARCHAR(200) NOT NULL DEFAULT '',
    "outputNodeId" UUID,
    "outputBodyHash" VARCHAR(64),
    "error" TEXT,
    "promptSnapshot" TEXT NOT NULL DEFAULT '',
    "model" VARCHAR(100) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "StudioGenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioContextSpend" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "generationCalls" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "StudioContextSpend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentNode_ownerId_deletedAt_idx" ON "ContentNode"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "ContentNode_parentId_displayOrder_idx" ON "ContentNode"("parentId", "displayOrder");

-- CreateIndex
CREATE INDEX "ContentNode_categoryId_displayOrder_idx" ON "ContentNode"("categoryId", "displayOrder");

-- CreateIndex
CREATE INDEX "ContentNode_peopleGroupId_displayOrder_idx" ON "ContentNode"("peopleGroupId", "displayOrder");

-- CreateIndex
CREATE INDEX "ContentNode_personId_displayOrder_idx" ON "ContentNode"("personId", "displayOrder");

-- CreateIndex
CREATE INDEX "ContentNode_deletedAt_idx" ON "ContentNode"("deletedAt");

-- CreateIndex
CREATE INDEX "ContentNode_role_idx" ON "ContentNode"("role");

-- CreateIndex
CREATE INDEX "ContentNode_ownedByNoteId_idx" ON "ContentNode"("ownedByNoteId");

-- CreateIndex
CREATE INDEX "ContentNode_ownerId_lastViewedAt_idx" ON "ContentNode"("ownerId", "lastViewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentNode_ownerId_slug_key" ON "ContentNode"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "PeriodicNoteIndex_contentId_idx" ON "PeriodicNoteIndex"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodicNoteIndex_ownerId_kind_periodKey_key" ON "PeriodicNoteIndex"("ownerId", "kind", "periodKey");

-- CreateIndex
CREATE INDEX "FlashcardDeck_ownerId_deletedAt_idx" ON "FlashcardDeck"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "FlashcardDeck_ownerId_slug_idx" ON "FlashcardDeck"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "FlashcardDeck_parentDeckId_displayOrder_idx" ON "FlashcardDeck"("parentDeckId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FlashcardDeck_ownerId_path_key" ON "FlashcardDeck"("ownerId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "FlashcardDeck_ownerId_parentDeckId_name_key" ON "FlashcardDeck"("ownerId", "parentDeckId", "name");

-- CreateIndex
CREATE INDEX "Flashcard_sourceContentId_idx" ON "Flashcard"("sourceContentId");

-- CreateIndex
CREATE INDEX "Flashcard_ownerId_deckId_idx" ON "Flashcard"("ownerId", "deckId");

-- CreateIndex
CREATE INDEX "Flashcard_ownerId_due_idx" ON "Flashcard"("ownerId", "due");

-- CreateIndex
CREATE INDEX "Flashcard_ownerId_state_due_idx" ON "Flashcard"("ownerId", "state", "due");

-- CreateIndex
CREATE INDEX "Flashcard_ownerId_deletedAt_idx" ON "Flashcard"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Flashcard_ownerId_noteId_idx" ON "Flashcard"("ownerId", "noteId");

-- CreateIndex
CREATE INDEX "FlashcardReviewAttempt_flashcardId_createdAt_idx" ON "FlashcardReviewAttempt"("flashcardId", "createdAt");

-- CreateIndex
CREATE INDEX "FlashcardReviewAttempt_ownerId_createdAt_idx" ON "FlashcardReviewAttempt"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "FlashcardReviewAttempt_ownerId_rating_createdAt_idx" ON "FlashcardReviewAttempt"("ownerId", "rating", "createdAt");

-- CreateIndex
CREATE INDEX "NotePayload_searchText_idx" ON "NotePayload" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "FilePayload_uploadStatus_idx" ON "FilePayload"("uploadStatus");

-- CreateIndex
CREATE INDEX "FilePayload_storageProvider_uploadedAt_idx" ON "FilePayload"("storageProvider", "uploadedAt" DESC);

-- CreateIndex
CREATE INDEX "FilePayload_checksum_fileSize_idx" ON "FilePayload"("checksum", "fileSize");

-- CreateIndex
CREATE INDEX "FilePayload_mimeType_idx" ON "FilePayload"("mimeType");

-- CreateIndex
CREATE INDEX "FilePayload_processingStatus_isProcessed_idx" ON "FilePayload"("processingStatus", "isProcessed");

-- CreateIndex
CREATE INDEX "FilePayload_searchText_idx" ON "FilePayload" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "HtmlPayload_searchText_idx" ON "HtmlPayload" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "HtmlPayload_isTemplate_idx" ON "HtmlPayload"("isTemplate");

-- CreateIndex
CREATE INDEX "CodePayload_searchText_idx" ON "CodePayload" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "CodePayload_language_idx" ON "CodePayload"("language");

-- CreateIndex
CREATE INDEX "ContentHistory_contentId_version_idx" ON "ContentHistory"("contentId", "version" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ContentHistory_contentId_version_key" ON "ContentHistory"("contentId", "version");

-- CreateIndex
CREATE INDEX "ContentPath_path_idx" ON "ContentPath"("path");

-- CreateIndex
CREATE INDEX "ContentPath_depth_idx" ON "ContentPath"("depth");

-- CreateIndex
CREATE INDEX "ContentLink_targetId_idx" ON "ContentLink"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentLink_sourceId_targetId_linkType_key" ON "ContentLink"("sourceId", "targetId", "linkType");

-- CreateIndex
CREATE INDEX "ContentTag_tagId_idx" ON "ContentTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentTag_contentId_tagId_key" ON "ContentTag"("contentId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "TrashBin_contentId_key" ON "TrashBin"("contentId");

-- CreateIndex
CREATE INDEX "TrashBin_deletedBy_idx" ON "TrashBin"("deletedBy");

-- CreateIndex
CREATE INDEX "TrashBin_scheduledDeletion_idx" ON "TrashBin"("scheduledDeletion");

-- CreateIndex
CREATE INDEX "TrashBin_deletedAt_idx" ON "TrashBin"("deletedAt" DESC);

-- CreateIndex
CREATE INDEX "StorageProviderConfig_userId_isDefault_idx" ON "StorageProviderConfig"("userId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "StorageProviderConfig_userId_provider_key" ON "StorageProviderConfig"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "ContentWorkspace_ownerId_status_idx" ON "ContentWorkspace"("ownerId", "status");

-- CreateIndex
CREATE INDEX "ContentWorkspace_ownerId_isMain_idx" ON "ContentWorkspace"("ownerId", "isMain");

-- CreateIndex
CREATE INDEX "ContentWorkspace_expiresAt_idx" ON "ContentWorkspace"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentWorkspace_ownerId_slug_key" ON "ContentWorkspace"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "ContentWorkspaceItem_contentId_assignmentType_expiresAt_idx" ON "ContentWorkspaceItem"("contentId", "assignmentType", "expiresAt");

-- CreateIndex
CREATE INDEX "ContentWorkspaceItem_workspaceId_assignmentType_idx" ON "ContentWorkspaceItem"("workspaceId", "assignmentType");

-- CreateIndex
CREATE INDEX "ContentWorkspaceItem_expiresAt_idx" ON "ContentWorkspaceItem"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentWorkspaceItem_workspaceId_contentId_key" ON "ContentWorkspaceItem"("workspaceId", "contentId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_ownerId_displayOrder_idx" ON "Category"("ownerId", "displayOrder");

-- CreateIndex
CREATE INDEX "Tag_userId_name_idx" ON "Tag"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_slug_key" ON "Tag"("userId", "slug");

-- CreateIndex
CREATE INDEX "ViewGrant_userId_idx" ON "ViewGrant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ViewGrant_contentId_userId_key" ON "ViewGrant"("contentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationDocument_contentId_key" ON "CollaborationDocument"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationDocument_documentName_key" ON "CollaborationDocument"("documentName");

-- CreateIndex
CREATE INDEX "CollaborationDocument_ownerId_updatedAt_idx" ON "CollaborationDocument"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "CollaborationPresence_contentId_lastSeenAt_idx" ON "CollaborationPresence"("contentId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "CollaborationPresence_sessionId_idx" ON "CollaborationPresence"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationPresence_contentId_sessionId_key" ON "CollaborationPresence"("contentId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PeopleGroup_defaultForOwnerId_key" ON "PeopleGroup"("defaultForOwnerId");

-- CreateIndex
CREATE INDEX "PeopleGroup_ownerId_parentGroupId_displayOrder_idx" ON "PeopleGroup"("ownerId", "parentGroupId", "displayOrder");

-- CreateIndex
CREATE INDEX "PeopleGroup_ownerId_isDefault_idx" ON "PeopleGroup"("ownerId", "isDefault");

-- CreateIndex
CREATE INDEX "PeopleGroup_parentGroupId_idx" ON "PeopleGroup"("parentGroupId");

-- CreateIndex
CREATE INDEX "PeopleGroup_deletedAt_idx" ON "PeopleGroup"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PeopleGroup_ownerId_slug_key" ON "PeopleGroup"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "Person_ownerId_primaryGroupId_displayOrder_idx" ON "Person"("ownerId", "primaryGroupId", "displayOrder");

-- CreateIndex
CREATE INDEX "Person_ownerId_displayName_idx" ON "Person"("ownerId", "displayName");

-- CreateIndex
CREATE INDEX "Person_email_idx" ON "Person"("email");

-- CreateIndex
CREATE INDEX "Person_deletedAt_idx" ON "Person"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Person_ownerId_slug_key" ON "Person"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "PeopleFileTreeMount_ownerId_contentParentId_displayOrder_idx" ON "PeopleFileTreeMount"("ownerId", "contentParentId", "displayOrder");

-- CreateIndex
CREATE INDEX "PeopleFileTreeMount_contentParentId_idx" ON "PeopleFileTreeMount"("contentParentId");

-- CreateIndex
CREATE UNIQUE INDEX "PeopleFileTreeMount_ownerId_groupId_key" ON "PeopleFileTreeMount"("ownerId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "PeopleFileTreeMount_ownerId_personId_key" ON "PeopleFileTreeMount"("ownerId", "personId");

-- CreateIndex
CREATE INDEX "PersonMention_ownerId_personId_idx" ON "PersonMention"("ownerId", "personId");

-- CreateIndex
CREATE INDEX "PersonMention_personId_idx" ON "PersonMention"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonMention_contentId_personId_key" ON "PersonMention"("contentId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceToken_tokenHash_key" ON "ServiceToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ServiceToken_userId_revokedAt_idx" ON "ServiceToken"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "ServiceToken_tokenPrefix_idx" ON "ServiceToken"("tokenPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "BrowserExtensionToken_tokenHash_key" ON "BrowserExtensionToken"("tokenHash");

-- CreateIndex
CREATE INDEX "BrowserExtensionToken_userId_revokedAt_idx" ON "BrowserExtensionToken"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "BrowserExtensionToken_tokenPrefix_idx" ON "BrowserExtensionToken"("tokenPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "BrowserExtensionInstall_tokenId_key" ON "BrowserExtensionInstall"("tokenId");

-- CreateIndex
CREATE INDEX "BrowserExtensionInstall_userId_revokedAt_idx" ON "BrowserExtensionInstall"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BrowserExtensionInstall_userId_installInstanceId_key" ON "BrowserExtensionInstall"("userId", "installInstanceId");

-- CreateIndex
CREATE INDEX "BookmarkSyncConnection_userId_appRootId_idx" ON "BookmarkSyncConnection"("userId", "appRootId");

-- CreateIndex
CREATE INDEX "BookmarkSyncConnection_tokenId_idx" ON "BookmarkSyncConnection"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "BookmarkSyncConnection_userId_chromeRootId_key" ON "BookmarkSyncConnection"("userId", "chromeRootId");

-- CreateIndex
CREATE INDEX "BookmarkSyncConnectionInstall_installId_idx" ON "BookmarkSyncConnectionInstall"("installId");

-- CreateIndex
CREATE UNIQUE INDEX "BookmarkSyncConnectionInstall_connectionId_installId_key" ON "BookmarkSyncConnectionInstall"("connectionId", "installId");

-- CreateIndex
CREATE INDEX "BookmarkSyncLink_connectionId_nodeType_idx" ON "BookmarkSyncLink"("connectionId", "nodeType");

-- CreateIndex
CREATE INDEX "BookmarkSyncLink_contentId_idx" ON "BookmarkSyncLink"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "BookmarkSyncLink_connectionId_contentId_key" ON "BookmarkSyncLink"("connectionId", "contentId");

-- CreateIndex
CREATE UNIQUE INDEX "BookmarkSyncLink_connectionId_chromeNodeId_key" ON "BookmarkSyncLink"("connectionId", "chromeNodeId");

-- CreateIndex
CREATE INDEX "WebResource_userId_canonicalUrl_idx" ON "WebResource"("userId", "canonicalUrl");

-- CreateIndex
CREATE INDEX "WebResource_userId_normalizedUrl_idx" ON "WebResource"("userId", "normalizedUrl");

-- CreateIndex
CREATE INDEX "WebResource_userId_sourceDomain_idx" ON "WebResource"("userId", "sourceDomain");

-- CreateIndex
CREATE UNIQUE INDEX "WebResource_userId_identityUrl_key" ON "WebResource"("userId", "identityUrl");

-- CreateIndex
CREATE INDEX "WebResourceContentLink_userId_contentId_idx" ON "WebResourceContentLink"("userId", "contentId");

-- CreateIndex
CREATE INDEX "WebResourceContentLink_userId_webResourceId_idx" ON "WebResourceContentLink"("userId", "webResourceId");

-- CreateIndex
CREATE UNIQUE INDEX "WebResourceContentLink_webResourceId_contentId_key" ON "WebResourceContentLink"("webResourceId", "contentId");

-- CreateIndex
CREATE INDEX "WebResourceViewState_userId_webResourceId_idx" ON "WebResourceViewState"("userId", "webResourceId");

-- CreateIndex
CREATE INDEX "WebResourceViewState_userId_contentId_idx" ON "WebResourceViewState"("userId", "contentId");

-- CreateIndex
CREATE UNIQUE INDEX "WebResourceViewState_installId_webResourceId_contentId_key" ON "WebResourceViewState"("installId", "webResourceId", "contentId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Account_provider_idx" ON "Account"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_targetUserId_createdAt_idx" ON "AuditLog"("targetUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "FolderPayload_viewMode_idx" ON "FolderPayload"("viewMode");

-- CreateIndex
CREATE INDEX "ExternalPayload_url_idx" ON "ExternalPayload"("url");

-- CreateIndex
CREATE INDEX "ExternalPayload_webResourceId_idx" ON "ExternalPayload"("webResourceId");

-- CreateIndex
CREATE INDEX "ExternalPayload_normalizedUrl_idx" ON "ExternalPayload"("normalizedUrl");

-- CreateIndex
CREATE INDEX "ExternalPayload_canonicalUrl_idx" ON "ExternalPayload"("canonicalUrl");

-- CreateIndex
CREATE INDEX "ExternalPayload_readingStatus_idx" ON "ExternalPayload"("readingStatus");

-- CreateIndex
CREATE INDEX "ExternalPayload_resourceType_idx" ON "ExternalPayload"("resourceType");

-- CreateIndex
CREATE INDEX "ExternalPayload_resourceRelationship_idx" ON "ExternalPayload"("resourceRelationship");

-- CreateIndex
CREATE INDEX "ExternalPayload_userIntent_idx" ON "ExternalPayload"("userIntent");

-- CreateIndex
CREATE INDEX "ExternalPayload_sourceDomain_idx" ON "ExternalPayload"("sourceDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_archivedToContentNodeId_key" ON "Conversation"("archivedToContentNodeId");

-- CreateIndex
CREATE INDEX "Conversation_ownerId_updatedAt_idx" ON "Conversation"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Conversation_ownerId_deletedAt_idx" ON "Conversation"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Conversation_ownerId_targetFolderId_idx" ON "Conversation"("ownerId", "targetFolderId");

-- CreateIndex
CREATE INDEX "ChatContext_ownerId_updatedAt_idx" ON "ChatContext"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatContext_ownerId_deletedAt_idx" ON "ChatContext"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_createdAt_idx" ON "ConversationMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_parentId_idx" ON "ConversationMessage"("conversationId", "parentId");

-- CreateIndex
CREATE INDEX "ConversationAssociation_contentNodeId_idx" ON "ConversationAssociation"("contentNodeId");

-- CreateIndex
CREATE INDEX "ConversationAssociation_conversationId_source_lastReference_idx" ON "ConversationAssociation"("conversationId", "source", "lastReferencedAt");

-- CreateIndex
CREATE INDEX "AIConnection_ownerId_kind_idx" ON "AIConnection"("ownerId", "kind");

-- CreateIndex
CREATE INDEX "AIConnection_ownerId_isPinned_pinOrder_idx" ON "AIConnection"("ownerId", "isPinned", "pinOrder");

-- CreateIndex
CREATE INDEX "AIConnection_ownerId_deletedAt_idx" ON "AIConnection"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "AIFeatureRoute_ownerId_featureId_idx" ON "AIFeatureRoute"("ownerId", "featureId");

-- CreateIndex
CREATE INDEX "AIFeatureRoute_connectionId_idx" ON "AIFeatureRoute"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "AIFeatureRoute_ownerId_featureId_position_key" ON "AIFeatureRoute"("ownerId", "featureId", "position");

-- CreateIndex
CREATE INDEX "VisualizationPayload_engine_idx" ON "VisualizationPayload"("engine");

-- CreateIndex
CREATE INDEX "DataPayload_mode_idx" ON "DataPayload"("mode");

-- CreateIndex
CREATE INDEX "HopePayload_kind_idx" ON "HopePayload"("kind");

-- CreateIndex
CREATE INDEX "HopePayload_status_idx" ON "HopePayload"("status");

-- CreateIndex
CREATE INDEX "WorkflowPayload_enabled_idx" ON "WorkflowPayload"("enabled");

-- CreateIndex
CREATE INDEX "ReusableCategory_userId_scope_displayOrder_idx" ON "ReusableCategory"("userId", "scope", "displayOrder");

-- CreateIndex
CREATE INDEX "ReusableCategory_parentId_idx" ON "ReusableCategory"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ReusableCategory_userId_scope_slug_key" ON "ReusableCategory"("userId", "scope", "slug");

-- CreateIndex
CREATE INDEX "SavedBlock_userId_categoryId_idx" ON "SavedBlock"("userId", "categoryId");

-- CreateIndex
CREATE INDEX "SavedBlock_userId_blockType_idx" ON "SavedBlock"("userId", "blockType");

-- CreateIndex
CREATE INDEX "SavedBlock_searchText_idx" ON "SavedBlock" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ContentTemplate_userId_categoryId_displayOrder_idx" ON "ContentTemplate"("userId", "categoryId", "displayOrder");

-- CreateIndex
CREATE INDEX "ContentTemplate_userId_lastUsedAt_idx" ON "ContentTemplate"("userId", "lastUsedAt" DESC);

-- CreateIndex
CREATE INDEX "ContentTemplate_searchText_idx" ON "ContentTemplate" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Snippet_userId_categoryId_displayOrder_idx" ON "Snippet"("userId", "categoryId", "displayOrder");

-- CreateIndex
CREATE INDEX "Snippet_userId_isAiContext_idx" ON "Snippet"("userId", "isAiContext");

-- CreateIndex
CREATE INDEX "Snippet_userId_isVisibleInUI_idx" ON "Snippet"("userId", "isVisibleInUI");

-- CreateIndex
CREATE INDEX "Snippet_searchText_idx" ON "Snippet" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "PageTemplate_userId_categoryId_displayOrder_idx" ON "PageTemplate"("userId", "categoryId", "displayOrder");

-- CreateIndex
CREATE INDEX "PageTemplate_searchText_idx" ON "PageTemplate" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "CalendarConnection_userId_provider_idx" ON "CalendarConnection"("userId", "provider");

-- CreateIndex
CREATE INDEX "CalendarSource_userId_connectionId_idx" ON "CalendarSource"("userId", "connectionId");

-- CreateIndex
CREATE INDEX "CalendarSource_userId_syncMode_idx" ON "CalendarSource"("userId", "syncMode");

-- CreateIndex
CREATE INDEX "CalendarSource_userId_isPrimary_idx" ON "CalendarSource"("userId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSource_userId_externalCalendarId_key" ON "CalendarSource"("userId", "externalCalendarId");

-- CreateIndex
CREATE INDEX "CalendarEvent_userId_startAt_endAt_idx" ON "CalendarEvent"("userId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_sourceId_startAt_idx" ON "CalendarEvent"("sourceId", "startAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_linkedContentId_idx" ON "CalendarEvent"("linkedContentId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_sourceId_externalEventId_key" ON "CalendarEvent"("sourceId", "externalEventId");

-- CreateIndex
CREATE INDEX "CalendarEventAttendee_eventId_idx" ON "CalendarEventAttendee"("eventId");

-- CreateIndex
CREATE INDEX "CalendarEventAttendee_email_idx" ON "CalendarEventAttendee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_ownerId_idx" ON "Tenant"("ownerId");

-- CreateIndex
CREATE INDEX "SitePage_tenantId_visibility_navOrder_idx" ON "SitePage"("tenantId", "visibility", "navOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SitePage_tenantId_slug_key" ON "SitePage"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "TenantHost_tenantId_idx" ON "TenantHost"("tenantId");

-- CreateIndex
CREATE INDEX "PublicPath_ownerId_parentId_displayOrder_idx" ON "PublicPath"("ownerId", "parentId", "displayOrder");

-- CreateIndex
CREATE INDEX "PublicPath_ownerId_idx" ON "PublicPath"("ownerId");

-- CreateIndex
CREATE INDEX "PublicPath_tenantId_parentId_idx" ON "PublicPath"("tenantId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicPath_parentId_slug_key" ON "PublicPath"("parentId", "slug");

-- CreateIndex
CREATE INDEX "Series_ownerId_displayOrder_idx" ON "Series"("ownerId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Series_ownerId_slug_key" ON "Series"("ownerId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "PublicItem_workingRevisionId_key" ON "PublicItem"("workingRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicItem_publishedRevisionId_key" ON "PublicItem"("publishedRevisionId");

-- CreateIndex
CREATE INDEX "PublicItem_ownerId_state_idx" ON "PublicItem"("ownerId", "state");

-- CreateIndex
CREATE INDEX "PublicItem_ownerId_payloadType_idx" ON "PublicItem"("ownerId", "payloadType");

-- CreateIndex
CREATE INDEX "PublicItem_contentNodeId_idx" ON "PublicItem"("contentNodeId");

-- CreateIndex
CREATE INDEX "PublicItem_seriesId_seriesOrder_idx" ON "PublicItem"("seriesId", "seriesOrder");

-- CreateIndex
CREATE INDEX "PublicItem_scheduledFor_idx" ON "PublicItem"("scheduledFor");

-- CreateIndex
CREATE INDEX "PublicItem_deletedAt_idx" ON "PublicItem"("deletedAt");

-- CreateIndex
CREATE INDEX "PublicItem_ownerId_lastPublishedAt_idx" ON "PublicItem"("ownerId", "lastPublishedAt" DESC);

-- CreateIndex
CREATE INDEX "PublicItem_tenantId_state_idx" ON "PublicItem"("tenantId", "state");

-- CreateIndex
CREATE INDEX "PublicItem_tenantId_state_deletedAt_idx" ON "PublicItem"("tenantId", "state", "deletedAt");

-- CreateIndex
CREATE INDEX "PublicItem_tenantId_lastPublishedAt_idx" ON "PublicItem"("tenantId", "lastPublishedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PublicItem_pathId_slug_key" ON "PublicItem"("pathId", "slug");

-- CreateIndex
CREATE INDEX "PublicItemRevision_publicItemId_createdAt_idx" ON "PublicItemRevision"("publicItemId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PublicItemRevision_authorId_idx" ON "PublicItemRevision"("authorId");

-- CreateIndex
CREATE INDEX "PublicItemRevision_publishedAt_idx" ON "PublicItemRevision"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublicPathRedirect_fromPath_key" ON "PublicPathRedirect"("fromPath");

-- CreateIndex
CREATE INDEX "PublicPathRedirect_ownerId_isActive_idx" ON "PublicPathRedirect"("ownerId", "isActive");

-- CreateIndex
CREATE INDEX "PublicPathRedirect_expiresAt_idx" ON "PublicPathRedirect"("expiresAt");

-- CreateIndex
CREATE INDEX "PublicPathRedirect_tenantId_isActive_idx" ON "PublicPathRedirect"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PreviewToken_token_key" ON "PreviewToken"("token");

-- CreateIndex
CREATE INDEX "PreviewToken_publicItemId_idx" ON "PreviewToken"("publicItemId");

-- CreateIndex
CREATE INDEX "PreviewToken_expiresAt_idx" ON "PreviewToken"("expiresAt");

-- CreateIndex
CREATE INDEX "ConnectionInvite_inviterId_status_idx" ON "ConnectionInvite"("inviterId", "status");

-- CreateIndex
CREATE INDEX "ConnectionInvite_inviteeUserId_status_idx" ON "ConnectionInvite"("inviteeUserId", "status");

-- CreateIndex
CREATE INDEX "ConnectionInvite_status_expiresAt_idx" ON "ConnectionInvite"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "UserConnection_userAId_deletedAt_idx" ON "UserConnection"("userAId", "deletedAt");

-- CreateIndex
CREATE INDEX "UserConnection_userBId_deletedAt_idx" ON "UserConnection"("userBId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserConnection_userAId_userBId_key" ON "UserConnection"("userAId", "userBId");

-- CreateIndex
CREATE INDEX "UserBlock_blockedUserId_idx" ON "UserBlock"("blockedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedUserId_key" ON "UserBlock"("blockerId", "blockedUserId");

-- CreateIndex
CREATE INDEX "ActivityEvent_kind_createdAt_idx" ON "ActivityEvent"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_subjectType_subjectId_idx" ON "ActivityEvent"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_readAt_idx" ON "NotificationRecipient"("userId", "readAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_archivedAt_createdAt_idx" ON "NotificationRecipient"("userId", "archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_collapseKey_idx" ON "NotificationRecipient"("userId", "collapseKey");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_eventId_userId_key" ON "NotificationRecipient"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DmThread_pairKey_key" ON "DmThread"("pairKey");

-- CreateIndex
CREATE INDEX "DmThread_lastMessageAt_idx" ON "DmThread"("lastMessageAt");

-- CreateIndex
CREATE INDEX "DmParticipant_userId_deletedAt_idx" ON "DmParticipant"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "DmMessage_threadId_createdAt_idx" ON "DmMessage"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDefinition_ownerId_slug_key" ON "WorkflowDefinition"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "WorkflowRun_ownerId_status_idx" ON "WorkflowRun"("ownerId", "status");

-- CreateIndex
CREATE INDEX "WorkflowRun_definitionId_createdAt_idx" ON "WorkflowRun"("definitionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRunEvent_runId_seq_key" ON "WorkflowRunEvent"("runId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRunEvent_runId_key_key" ON "WorkflowRunEvent"("runId", "key");

-- CreateIndex
CREATE INDEX "WorkflowRunArtifact_runId_idx" ON "WorkflowRunArtifact"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "AgenticMetadata_nodeId_key" ON "AgenticMetadata"("nodeId");

-- CreateIndex
CREATE INDEX "AgenticMetadata_contextDirty_idx" ON "AgenticMetadata"("contextDirty");

-- CreateIndex
CREATE UNIQUE INDEX "StudioSourceSelection_ownerId_folderId_key" ON "StudioSourceSelection"("ownerId", "folderId");

-- CreateIndex
CREATE INDEX "StudioGenerationRun_ownerId_folderId_createdAt_idx" ON "StudioGenerationRun"("ownerId", "folderId", "createdAt");

-- CreateIndex
CREATE INDEX "StudioGenerationRun_outputNodeId_idx" ON "StudioGenerationRun"("outputNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "StudioContextSpend_ownerId_day_key" ON "StudioContextSpend"("ownerId", "day");

-- AddForeignKey
ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ContentNode"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_ownedByNoteId_fkey" FOREIGN KEY ("ownedByNoteId") REFERENCES "ContentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_peopleGroupId_fkey" FOREIGN KEY ("peopleGroupId") REFERENCES "PeopleGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodicNoteIndex" ADD CONSTRAINT "PeriodicNoteIndex_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodicNoteIndex" ADD CONSTRAINT "PeriodicNoteIndex_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardDeck" ADD CONSTRAINT "FlashcardDeck_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardDeck" ADD CONSTRAINT "FlashcardDeck_parentDeckId_fkey" FOREIGN KEY ("parentDeckId") REFERENCES "FlashcardDeck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "FlashcardDeck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_sourceContentId_fkey" FOREIGN KEY ("sourceContentId") REFERENCES "ContentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardReviewAttempt" ADD CONSTRAINT "FlashcardReviewAttempt_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "Flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardReviewAttempt" ADD CONSTRAINT "FlashcardReviewAttempt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotePayload" ADD CONSTRAINT "NotePayload_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilePayload" ADD CONSTRAINT "FilePayload_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HtmlPayload" ADD CONSTRAINT "HtmlPayload_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodePayload" ADD CONSTRAINT "CodePayload_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentHistory" ADD CONSTRAINT "ContentHistory_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentHistory" ADD CONSTRAINT "ContentHistory_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPath" ADD CONSTRAINT "ContentPath_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentLink" ADD CONSTRAINT "ContentLink_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentLink" ADD CONSTRAINT "ContentLink_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTag" ADD CONSTRAINT "ContentTag_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTag" ADD CONSTRAINT "ContentTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrashBin" ADD CONSTRAINT "TrashBin_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrashBin" ADD CONSTRAINT "TrashBin_deletedBy_fkey" FOREIGN KEY ("deletedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageProviderConfig" ADD CONSTRAINT "StorageProviderConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_primaryTenantId_fkey" FOREIGN KEY ("primaryTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentWorkspace" ADD CONSTRAINT "ContentWorkspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentWorkspace" ADD CONSTRAINT "ContentWorkspace_viewRootContentId_fkey" FOREIGN KEY ("viewRootContentId") REFERENCES "ContentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentWorkspaceItem" ADD CONSTRAINT "ContentWorkspaceItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ContentWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentWorkspaceItem" ADD CONSTRAINT "ContentWorkspaceItem_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewGrant" ADD CONSTRAINT "ViewGrant_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewGrant" ADD CONSTRAINT "ViewGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaborationDocument" ADD CONSTRAINT "CollaborationDocument_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaborationDocument" ADD CONSTRAINT "CollaborationDocument_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaborationPresence" ADD CONSTRAINT "CollaborationPresence_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeopleGroup" ADD CONSTRAINT "PeopleGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeopleGroup" ADD CONSTRAINT "PeopleGroup_defaultForOwnerId_fkey" FOREIGN KEY ("defaultForOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeopleGroup" ADD CONSTRAINT "PeopleGroup_parentGroupId_fkey" FOREIGN KEY ("parentGroupId") REFERENCES "PeopleGroup"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_primaryGroupId_fkey" FOREIGN KEY ("primaryGroupId") REFERENCES "PeopleGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeopleFileTreeMount" ADD CONSTRAINT "PeopleFileTreeMount_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeopleFileTreeMount" ADD CONSTRAINT "PeopleFileTreeMount_contentParentId_fkey" FOREIGN KEY ("contentParentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeopleFileTreeMount" ADD CONSTRAINT "PeopleFileTreeMount_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PeopleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeopleFileTreeMount" ADD CONSTRAINT "PeopleFileTreeMount_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonMention" ADD CONSTRAINT "PersonMention_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonMention" ADD CONSTRAINT "PersonMention_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonMention" ADD CONSTRAINT "PersonMention_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceToken" ADD CONSTRAINT "ServiceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrowserExtensionToken" ADD CONSTRAINT "BrowserExtensionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrowserExtensionInstall" ADD CONSTRAINT "BrowserExtensionInstall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrowserExtensionInstall" ADD CONSTRAINT "BrowserExtensionInstall_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "BrowserExtensionToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookmarkSyncConnection" ADD CONSTRAINT "BookmarkSyncConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookmarkSyncConnection" ADD CONSTRAINT "BookmarkSyncConnection_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "BrowserExtensionToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookmarkSyncConnection" ADD CONSTRAINT "BookmarkSyncConnection_appRootId_fkey" FOREIGN KEY ("appRootId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookmarkSyncConnectionInstall" ADD CONSTRAINT "BookmarkSyncConnectionInstall_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BookmarkSyncConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookmarkSyncConnectionInstall" ADD CONSTRAINT "BookmarkSyncConnectionInstall_installId_fkey" FOREIGN KEY ("installId") REFERENCES "BrowserExtensionInstall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookmarkSyncLink" ADD CONSTRAINT "BookmarkSyncLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BookmarkSyncConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookmarkSyncLink" ADD CONSTRAINT "BookmarkSyncLink_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebResource" ADD CONSTRAINT "WebResource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebResourceContentLink" ADD CONSTRAINT "WebResourceContentLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebResourceContentLink" ADD CONSTRAINT "WebResourceContentLink_webResourceId_fkey" FOREIGN KEY ("webResourceId") REFERENCES "WebResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebResourceContentLink" ADD CONSTRAINT "WebResourceContentLink_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebResourceViewState" ADD CONSTRAINT "WebResourceViewState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebResourceViewState" ADD CONSTRAINT "WebResourceViewState_installId_fkey" FOREIGN KEY ("installId") REFERENCES "BrowserExtensionInstall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebResourceViewState" ADD CONSTRAINT "WebResourceViewState_webResourceId_fkey" FOREIGN KEY ("webResourceId") REFERENCES "WebResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebResourceViewState" ADD CONSTRAINT "WebResourceViewState_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetContentId_fkey" FOREIGN KEY ("targetContentId") REFERENCES "ContentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderPayload" ADD CONSTRAINT "FolderPayload_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPayload" ADD CONSTRAINT "ExternalPayload_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPayload" ADD CONSTRAINT "ExternalPayload_webResourceId_fkey" FOREIGN KEY ("webResourceId") REFERENCES "WebResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPayload" ADD CONSTRAINT "ChatPayload_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_archivedToContentNodeId_fkey" FOREIGN KEY ("archivedToContentNodeId") REFERENCES "ContentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_activeContextId_fkey" FOREIGN KEY ("activeContextId") REFERENCES "ChatContext"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_targetFolderId_fkey" FOREIGN KEY ("targetFolderId") REFERENCES "ContentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatContext" ADD CONSTRAINT "ChatContext_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ConversationMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationAssociation" ADD CONSTRAINT "ConversationAssociation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationAssociation" ADD CONSTRAINT "ConversationAssociation_contentNodeId_fkey" FOREIGN KEY ("contentNodeId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConnection" ADD CONSTRAINT "AIConnection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIFeatureRoute" ADD CONSTRAINT "AIFeatureRoute_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIFeatureRoute" ADD CONSTRAINT "AIFeatureRoute_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "AIConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualizationPayload" ADD CONSTRAINT "VisualizationPayload_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataPayload" ADD CONSTRAINT "DataPayload_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HopePayload" ADD CONSTRAINT "HopePayload_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowPayload" ADD CONSTRAINT "WorkflowPayload_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReusableCategory" ADD CONSTRAINT "ReusableCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReusableCategory" ADD CONSTRAINT "ReusableCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ReusableCategory"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SavedBlock" ADD CONSTRAINT "SavedBlock_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ReusableCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedBlock" ADD CONSTRAINT "SavedBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTemplate" ADD CONSTRAINT "ContentTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ReusableCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTemplate" ADD CONSTRAINT "ContentTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snippet" ADD CONSTRAINT "Snippet_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ReusableCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snippet" ADD CONSTRAINT "Snippet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageTemplate" ADD CONSTRAINT "PageTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ReusableCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageTemplate" ADD CONSTRAINT "PageTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSource" ADD CONSTRAINT "CalendarSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSource" ADD CONSTRAINT "CalendarSource_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CalendarSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_linkedContentId_fkey" FOREIGN KEY ("linkedContentId") REFERENCES "ContentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventAttendee" ADD CONSTRAINT "CalendarEventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePage" ADD CONSTRAINT "SitePage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantHost" ADD CONSTRAINT "TenantHost_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicPath" ADD CONSTRAINT "PublicPath_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicPath" ADD CONSTRAINT "PublicPath_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicPath" ADD CONSTRAINT "PublicPath_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PublicPath"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Series" ADD CONSTRAINT "Series_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicItem" ADD CONSTRAINT "PublicItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicItem" ADD CONSTRAINT "PublicItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicItem" ADD CONSTRAINT "PublicItem_contentNodeId_fkey" FOREIGN KEY ("contentNodeId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicItem" ADD CONSTRAINT "PublicItem_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "PublicPath"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicItem" ADD CONSTRAINT "PublicItem_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicItem" ADD CONSTRAINT "PublicItem_workingRevisionId_fkey" FOREIGN KEY ("workingRevisionId") REFERENCES "PublicItemRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicItem" ADD CONSTRAINT "PublicItem_publishedRevisionId_fkey" FOREIGN KEY ("publishedRevisionId") REFERENCES "PublicItemRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicItemRevision" ADD CONSTRAINT "PublicItemRevision_publicItemId_fkey" FOREIGN KEY ("publicItemId") REFERENCES "PublicItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicItemRevision" ADD CONSTRAINT "PublicItemRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicPathRedirect" ADD CONSTRAINT "PublicPathRedirect_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicPathRedirect" ADD CONSTRAINT "PublicPathRedirect_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicPathRedirect" ADD CONSTRAINT "PublicPathRedirect_toPathId_fkey" FOREIGN KEY ("toPathId") REFERENCES "PublicPath"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicPathRedirect" ADD CONSTRAINT "PublicPathRedirect_toPublicItemId_fkey" FOREIGN KEY ("toPublicItemId") REFERENCES "PublicItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewToken" ADD CONSTRAINT "PreviewToken_publicItemId_fkey" FOREIGN KEY ("publicItemId") REFERENCES "PublicItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewToken" ADD CONSTRAINT "PreviewToken_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPostPayload" ADD CONSTRAINT "BlogPostPayload_publicItemId_fkey" FOREIGN KEY ("publicItemId") REFERENCES "PublicItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPayload" ADD CONSTRAINT "ProjectPayload_publicItemId_fkey" FOREIGN KEY ("publicItemId") REFERENCES "PublicItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileSectionPayload" ADD CONSTRAINT "ProfileSectionPayload_publicItemId_fkey" FOREIGN KEY ("publicItemId") REFERENCES "PublicItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStudyPayload" ADD CONSTRAINT "CaseStudyPayload_publicItemId_fkey" FOREIGN KEY ("publicItemId") REFERENCES "PublicItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookmarkPayload" ADD CONSTRAINT "BookmarkPayload_publicItemId_fkey" FOREIGN KEY ("publicItemId") REFERENCES "PublicItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagePayload" ADD CONSTRAINT "PagePayload_publicItemId_fkey" FOREIGN KEY ("publicItemId") REFERENCES "PublicItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaItemPayload" ADD CONSTRAINT "MediaItemPayload_publicItemId_fkey" FOREIGN KEY ("publicItemId") REFERENCES "PublicItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionInvite" ADD CONSTRAINT "ConnectionInvite_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionInvite" ADD CONSTRAINT "ConnectionInvite_inviteeUserId_fkey" FOREIGN KEY ("inviteeUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserConnection" ADD CONSTRAINT "UserConnection_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserConnection" ADD CONSTRAINT "UserConnection_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ActivityEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmParticipant" ADD CONSTRAINT "DmParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DmThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmParticipant" ADD CONSTRAINT "DmParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmMessage" ADD CONSTRAINT "DmMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DmThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmMessage" ADD CONSTRAINT "DmMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRunEvent" ADD CONSTRAINT "WorkflowRunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRunArtifact" ADD CONSTRAINT "WorkflowRunArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRunArtifact" ADD CONSTRAINT "WorkflowRunArtifact_contentNodeId_fkey" FOREIGN KEY ("contentNodeId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgenticMetadata" ADD CONSTRAINT "AgenticMetadata_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioSourceSelection" ADD CONSTRAINT "StudioSourceSelection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioSourceSelection" ADD CONSTRAINT "StudioSourceSelection_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioGenerationRun" ADD CONSTRAINT "StudioGenerationRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioGenerationRun" ADD CONSTRAINT "StudioGenerationRun_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioContextSpend" ADD CONSTRAINT "StudioContextSpend_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

