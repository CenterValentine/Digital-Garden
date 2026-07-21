-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'admin', 'member', 'guest');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('uploading', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('r2', 's3', 'vercel');

-- CreateTable
CREATE TABLE "ContentNode" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "parentId" UUID,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "categoryId" UUID,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,
    "deletedBy" UUID,
    "customIcon" VARCHAR(100),
    "iconColor" VARCHAR(20),

    CONSTRAINT "ContentNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotePayload" (
    "contentId" UUID NOT NULL,
    "tiptapJson" JSONB NOT NULL,
    "searchText" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

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
    "uploadedAt" TIMESTAMPTZ,
    "uploadError" TEXT,
    "processingStatus" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "thumbnailUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration" INTEGER,
    "lastAccessedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

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
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "HtmlPayload_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "CodePayload" (
    "contentId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "language" VARCHAR(50) NOT NULL,
    "searchText" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "CodePayload_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "ContentHistory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contentId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedBy" UUID NOT NULL,
    "changedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPath" (
    "contentId" UUID NOT NULL,
    "path" VARCHAR(2048) NOT NULL,
    "pathSegments" TEXT[],
    "depth" INTEGER NOT NULL,
    "lastUpdated" TIMESTAMPTZ NOT NULL,

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
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentTag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contentId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrashBin" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contentId" UUID NOT NULL,
    "originalPath" TEXT,
    "deletedBy" UUID NOT NULL,
    "deletedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledDeletion" TIMESTAMPTZ NOT NULL,
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
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "StorageProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(50) NOT NULL,
    "passwordHash" CHAR(60),
    "email" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'guest',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
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
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewGrant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accessLevel" VARCHAR(20) NOT NULL,
    "grantedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ,

    CONSTRAINT "ViewGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "providerAccId" VARCHAR(255) NOT NULL,
    "refreshToken" TEXT,
    "accessToken" TEXT,
    "expiresAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentNode_slug_key" ON "ContentNode"("slug");

-- CreateIndex
CREATE INDEX "ContentNode_ownerId_deletedAt_idx" ON "ContentNode"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "ContentNode_parentId_displayOrder_idx" ON "ContentNode"("parentId", "displayOrder");

-- CreateIndex
CREATE INDEX "ContentNode_categoryId_displayOrder_idx" ON "ContentNode"("categoryId", "displayOrder");

-- CreateIndex
CREATE INDEX "ContentNode_deletedAt_idx" ON "ContentNode"("deletedAt");

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
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_ownerId_displayOrder_idx" ON "Category"("ownerId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "Tag_name_idx" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "ViewGrant_userId_idx" ON "ViewGrant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ViewGrant_contentId_userId_key" ON "ViewGrant"("contentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccId_key" ON "Account"("provider", "providerAccId");

-- AddForeignKey
ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ContentNode"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotePayload" ADD CONSTRAINT "NotePayload_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilePayload" ADD CONSTRAINT "FilePayload_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HtmlPayload" ADD CONSTRAINT "HtmlPayload_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodePayload" ADD CONSTRAINT "CodePayload_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentHistory" ADD CONSTRAINT "ContentHistory_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentHistory" ADD CONSTRAINT "ContentHistory_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "Category" ADD CONSTRAINT "Category_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewGrant" ADD CONSTRAINT "ViewGrant_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewGrant" ADD CONSTRAINT "ViewGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
