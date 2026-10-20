-- CreateTable
CREATE TABLE "WorkMeta" (
    "contentId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "workKey" VARCHAR(500) NOT NULL,
    "identifierKeys" TEXT[],
    "type" VARCHAR(40) NOT NULL,
    "title" VARCHAR(1000) NOT NULL,
    "authors" TEXT[],
    "year" INTEGER,
    "venue" VARCHAR(500),
    "abstract" TEXT,
    "identifiers" JSONB NOT NULL DEFAULT '{}',
    "face" JSONB NOT NULL DEFAULT '{}',
    "license" VARCHAR(60),
    "copyPolicy" VARCHAR(20) NOT NULL DEFAULT 'link',
    "copyUrl" TEXT,
    "retraction" JSONB,
    "readingStatus" VARCHAR(20),
    "sourceAdapter" VARCHAR(80) NOT NULL DEFAULT 'search',
    "provenance" TEXT[],
    "zoteroKey" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkMeta_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "WorkCache" (
    "key" VARCHAR(500) NOT NULL,
    "workKey" VARCHAR(500) NOT NULL,
    "work" JSONB NOT NULL,
    "sources" TEXT[],
    "fetchedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkCache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "WorkMeta_ownerId_idx" ON "WorkMeta"("ownerId");

-- CreateIndex
CREATE INDEX "WorkMeta_ownerId_workKey_idx" ON "WorkMeta"("ownerId", "workKey");

-- CreateIndex
CREATE INDEX "WorkMeta_identifierKeys_idx" ON "WorkMeta" USING GIN ("identifierKeys");

-- CreateIndex
CREATE UNIQUE INDEX "WorkMeta_ownerId_zoteroKey_key" ON "WorkMeta"("ownerId", "zoteroKey");

-- CreateIndex
CREATE INDEX "WorkCache_workKey_idx" ON "WorkCache"("workKey");

-- CreateIndex
CREATE INDEX "WorkCache_fetchedAt_idx" ON "WorkCache"("fetchedAt");

-- AddForeignKey
ALTER TABLE "WorkMeta" ADD CONSTRAINT "WorkMeta_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkMeta" ADD CONSTRAINT "WorkMeta_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

