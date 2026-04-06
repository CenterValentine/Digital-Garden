-- Baseline migration: Tables were created via prisma db push.
-- This migration records them in migration history for future deploy tracking.
-- All statements use IF NOT EXISTS to be safe.

-- ReusableCategoryScope enum
DO $$ BEGIN
  CREATE TYPE "ReusableCategoryScope" AS ENUM ('content_template', 'snippet', 'page_template', 'saved_block');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ReusableCategory
CREATE TABLE IF NOT EXISTS "ReusableCategory" (
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

-- SavedBlock
CREATE TABLE IF NOT EXISTS "SavedBlock" (
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

-- ContentTemplate
CREATE TABLE IF NOT EXISTS "ContentTemplate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "tiptapJson" JSONB NOT NULL,
    "searchText" TEXT NOT NULL DEFAULT '',
    "categoryId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "ContentTemplate_pkey" PRIMARY KEY ("id")
);

-- Snippet
CREATE TABLE IF NOT EXISTS "Snippet" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255),
    "content" TEXT NOT NULL,
    "tiptapJson" JSONB,
    "searchText" TEXT NOT NULL DEFAULT '',
    "categoryId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMPTZ(6),
    "isAiContext" BOOLEAN NOT NULL DEFAULT true,
    "isVisibleInUI" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "Snippet_pkey" PRIMARY KEY ("id")
);

-- PageTemplate
CREATE TABLE IF NOT EXISTS "PageTemplate" (
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
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "PageTemplate_pkey" PRIMARY KEY ("id")
);

-- Indexes (IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS "ReusableCategory_userId_scope_slug_key" ON "ReusableCategory"("userId", "scope", "slug");
CREATE INDEX IF NOT EXISTS "ReusableCategory_userId_scope_displayOrder_idx" ON "ReusableCategory"("userId", "scope", "displayOrder");
CREATE INDEX IF NOT EXISTS "ReusableCategory_parentId_idx" ON "ReusableCategory"("parentId");

CREATE INDEX IF NOT EXISTS "SavedBlock_userId_categoryId_idx" ON "SavedBlock"("userId", "categoryId");
CREATE INDEX IF NOT EXISTS "SavedBlock_userId_blockType_idx" ON "SavedBlock"("userId", "blockType");
CREATE INDEX IF NOT EXISTS "SavedBlock_searchText_idx" ON "SavedBlock" USING GIN ("searchText" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "ContentTemplate_userId_categoryId_idx" ON "ContentTemplate"("userId", "categoryId");
CREATE INDEX IF NOT EXISTS "ContentTemplate_userId_lastUsedAt_idx" ON "ContentTemplate"("userId", "lastUsedAt" DESC);
CREATE INDEX IF NOT EXISTS "ContentTemplate_searchText_idx" ON "ContentTemplate" USING GIN ("searchText" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Snippet_userId_categoryId_idx" ON "Snippet"("userId", "categoryId");
CREATE INDEX IF NOT EXISTS "Snippet_userId_isAiContext_idx" ON "Snippet"("userId", "isAiContext");
CREATE INDEX IF NOT EXISTS "Snippet_userId_isVisibleInUI_idx" ON "Snippet"("userId", "isVisibleInUI");
CREATE INDEX IF NOT EXISTS "Snippet_searchText_idx" ON "Snippet" USING GIN ("searchText" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "PageTemplate_userId_categoryId_idx" ON "PageTemplate"("userId", "categoryId");
CREATE INDEX IF NOT EXISTS "PageTemplate_searchText_idx" ON "PageTemplate" USING GIN ("searchText" gin_trgm_ops);

-- Foreign keys (DO blocks to skip if already present)
DO $$ BEGIN
  ALTER TABLE "ReusableCategory" ADD CONSTRAINT "ReusableCategory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ReusableCategory" ADD CONSTRAINT "ReusableCategory_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "ReusableCategory"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SavedBlock" ADD CONSTRAINT "SavedBlock_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ReusableCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SavedBlock" ADD CONSTRAINT "SavedBlock_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContentTemplate" ADD CONSTRAINT "ContentTemplate_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ReusableCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContentTemplate" ADD CONSTRAINT "ContentTemplate_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Snippet" ADD CONSTRAINT "Snippet_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ReusableCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Snippet" ADD CONSTRAINT "Snippet_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PageTemplate" ADD CONSTRAINT "PageTemplate_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ReusableCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PageTemplate" ADD CONSTRAINT "PageTemplate_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
