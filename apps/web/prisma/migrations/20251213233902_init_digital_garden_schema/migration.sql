-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(50) NOT NULL,
    "passwordHash" CHAR(60) NOT NULL,
    "email" VARCHAR(255) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StructuredDocument" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "docType" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "contentData" JSONB NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "parentId" UUID,

    CONSTRAINT "StructuredDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentHistory" (
    "id" BIGSERIAL NOT NULL,
    "documentId" UUID NOT NULL,
    "revisionData" JSONB NOT NULL,
    "editedById" UUID NOT NULL,
    "editedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPath" (
    "documentId" UUID NOT NULL,
    "pathSlug" VARCHAR(1024) NOT NULL,
    "pathText" VARCHAR(1024) NOT NULL,
    "depth" SMALLINT NOT NULL,

    CONSTRAINT "DocumentPath_pkey" PRIMARY KEY ("documentId")
);

-- CreateTable
CREATE TABLE "DocumentLink" (
    "sourceId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "linkType" VARCHAR(50) NOT NULL,
    "targetFragment" VARCHAR(255),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentLink_pkey" PRIMARY KEY ("sourceId","targetId")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTag" (
    "documentId" UUID NOT NULL,
    "tagId" BIGINT NOT NULL,

    CONSTRAINT "DocumentTag_pkey" PRIMARY KEY ("documentId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StructuredDocument_slug_key" ON "StructuredDocument"("slug");

-- CreateIndex
CREATE INDEX "StructuredDocument_ownerId_docType_isPublished_idx" ON "StructuredDocument"("ownerId", "docType", "isPublished");

-- CreateIndex
CREATE INDEX "StructuredDocument_parentId_idx" ON "StructuredDocument"("parentId");

-- CreateIndex
CREATE INDEX "DocumentHistory_documentId_idx" ON "DocumentHistory"("documentId");

-- CreateIndex
CREATE INDEX "DocumentHistory_editedAt_idx" ON "DocumentHistory"("editedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPath_pathSlug_key" ON "DocumentPath"("pathSlug");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPath_pathText_key" ON "DocumentPath"("pathText");

-- CreateIndex
CREATE INDEX "DocumentLink_targetId_sourceId_idx" ON "DocumentLink"("targetId", "sourceId");

-- CreateIndex
CREATE INDEX "DocumentLink_targetFragment_idx" ON "DocumentLink"("targetFragment");

-- CreateIndex
CREATE INDEX "DocumentLink_displayOrder_idx" ON "DocumentLink"("displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "DocumentTag_tagId_documentId_idx" ON "DocumentTag"("tagId", "documentId");



-- Custom Indexes for Advanced Queries

-- GIN Index for JSONB Search (structured_documents.contentData)
CREATE INDEX idx_struct_content_data_gin ON "StructuredDocument" USING GIN ("contentData");

-- Materialized Path Index for prefix search (path_text)
CREATE INDEX idx_path_text_prefix ON "DocumentPath" ("pathText" text_pattern_ops);



-- AddForeignKey
ALTER TABLE "StructuredDocument" ADD CONSTRAINT "StructuredDocument_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StructuredDocument"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "StructuredDocument" ADD CONSTRAINT "StructuredDocument_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StructuredDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPath" ADD CONSTRAINT "DocumentPath_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StructuredDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "StructuredDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "StructuredDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTag" ADD CONSTRAINT "DocumentTag_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StructuredDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTag" ADD CONSTRAINT "DocumentTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
