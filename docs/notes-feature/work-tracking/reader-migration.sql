-- Reader extension (EREADER-PLAN.md). Hand-written in Prisma's canonical
-- migrate-diff style for the five models in reader-schema-additions.prisma.
-- Copy to prisma/migrations/20260929120000_reader_extension/migration.sql.
-- If `prisma migrate dev` reports drift, prefer Prisma's generated SQL.

CREATE TABLE "BookMeta" (
    "contentId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "authors" TEXT[],
    "language" VARCHAR(20),
    "description" TEXT,
    "publisher" VARCHAR(255),
    "publishedYear" INTEGER,
    "isbn" VARCHAR(20),
    "openLibraryId" VARCHAR(40),
    "coverUrl" TEXT,
    "sourceAdapter" VARCHAR(80) NOT NULL DEFAULT 'upload',
    "sourceUrl" TEXT,
    "sourceEntryId" VARCHAR(255),
    "license" VARCHAR(40) NOT NULL DEFAULT 'unknown',
    "readingStatus" VARCHAR(20),
    "hardcoverBookId" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "BookMeta_pkey" PRIMARY KEY ("contentId")
);

CREATE TABLE "ReadingProgress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "targetKey" VARCHAR(255) NOT NULL,
    "locator" JSONB NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "ReadingProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReaderAnnotation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "targetKey" VARCHAR(255) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "locator" JSONB NOT NULL,
    "color" VARCHAR(20),
    "body" TEXT,
    "noteContentId" UUID,
    "source" VARCHAR(20) NOT NULL DEFAULT 'reader',
    "externalId" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "ReaderAnnotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReaderCatalog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "url" TEXT NOT NULL,
    "credentialEncrypted" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "ReaderCatalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReaderConnection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "tokenEncrypted" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "ReaderConnection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookMeta_ownerId_idx" ON "BookMeta"("ownerId");

CREATE INDEX "BookMeta_ownerId_isbn_idx" ON "BookMeta"("ownerId", "isbn");

CREATE UNIQUE INDEX "ReadingProgress_ownerId_targetKey_key" ON "ReadingProgress"("ownerId", "targetKey");

CREATE INDEX "ReaderAnnotation_ownerId_targetKey_idx" ON "ReaderAnnotation"("ownerId", "targetKey");

CREATE UNIQUE INDEX "ReaderAnnotation_ownerId_source_externalId_key" ON "ReaderAnnotation"("ownerId", "source", "externalId");

CREATE INDEX "ReaderCatalog_ownerId_idx" ON "ReaderCatalog"("ownerId");

CREATE UNIQUE INDEX "ReaderConnection_ownerId_provider_key" ON "ReaderConnection"("ownerId", "provider");

ALTER TABLE "BookMeta" ADD CONSTRAINT "BookMeta_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookMeta" ADD CONSTRAINT "BookMeta_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReaderAnnotation" ADD CONSTRAINT "ReaderAnnotation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReaderCatalog" ADD CONSTRAINT "ReaderCatalog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReaderConnection" ADD CONSTRAINT "ReaderConnection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
