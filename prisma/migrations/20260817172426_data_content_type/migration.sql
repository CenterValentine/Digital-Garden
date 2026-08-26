/*
  Warnings:

  - You are about to drop the column `schema` on the `DataPayload` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "DataColumnType" AS ENUM ('text', 'longText', 'number', 'checkbox', 'date', 'select', 'multiSelect', 'status', 'person', 'relation', 'contentLink', 'file', 'url', 'email', 'phone', 'autoNumber', 'formula', 'rollup', 'lookup', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy');

-- AlterTable
ALTER TABLE "DataPayload" DROP COLUMN "schema",
ADD COLUMN     "defaultViewId" UUID,
ADD COLUMN     "description" VARCHAR(280),
ADD COLUMN     "rowCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "mode" SET DEFAULT 'inline';

-- CreateTable
CREATE TABLE "DataColumn" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tableId" UUID NOT NULL,
    "key" VARCHAR(16) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "DataColumnType" NOT NULL,
    "position" VARCHAR(64) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "description" VARCHAR(280),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "DataColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRow" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tableId" UUID NOT NULL,
    "sortKey" VARCHAR(64) NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "contentId" UUID,
    "searchText" TEXT NOT NULL DEFAULT '',
    "createdBy" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "DataRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRowLink" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "columnId" UUID NOT NULL,
    "fromRowId" UUID NOT NULL,
    "toRowId" UUID NOT NULL,
    "position" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataRowLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataView" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tableId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "mode" VARCHAR(20) NOT NULL DEFAULT 'grid',
    "access" VARCHAR(20) NOT NULL DEFAULT 'collaborative',
    "section" VARCHAR(80),
    "filters" JSONB NOT NULL DEFAULT '{}',
    "sorts" JSONB NOT NULL DEFAULT '[]',
    "groupByColumnId" UUID,
    "columnPrefs" JSONB NOT NULL DEFAULT '{}',
    "config" JSONB NOT NULL DEFAULT '{}',
    "position" VARCHAR(64) NOT NULL,
    "publicConfig" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DataView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataColumn_tableId_position_idx" ON "DataColumn"("tableId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "DataColumn_tableId_key_key" ON "DataColumn"("tableId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "DataRow_contentId_key" ON "DataRow"("contentId");

-- CreateIndex
CREATE INDEX "DataRow_tableId_sortKey_idx" ON "DataRow"("tableId", "sortKey");

-- CreateIndex
CREATE INDEX "DataRow_tableId_deletedAt_idx" ON "DataRow"("tableId", "deletedAt");

-- CreateIndex
CREATE INDEX "DataRow_data_idx" ON "DataRow" USING GIN ("data" jsonb_path_ops);

-- CreateIndex
CREATE INDEX "DataRowLink_toRowId_idx" ON "DataRowLink"("toRowId");

-- CreateIndex
CREATE UNIQUE INDEX "DataRowLink_columnId_fromRowId_toRowId_key" ON "DataRowLink"("columnId", "fromRowId", "toRowId");

-- CreateIndex
CREATE INDEX "DataView_tableId_position_idx" ON "DataView"("tableId", "position");

-- CreateIndex
CREATE INDEX "DataView_ownerId_idx" ON "DataView"("ownerId");

-- AddForeignKey
ALTER TABLE "DataColumn" ADD CONSTRAINT "DataColumn_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DataPayload"("contentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRow" ADD CONSTRAINT "DataRow_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DataPayload"("contentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRow" ADD CONSTRAINT "DataRow_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRowLink" ADD CONSTRAINT "DataRowLink_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "DataColumn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRowLink" ADD CONSTRAINT "DataRowLink_fromRowId_fkey" FOREIGN KEY ("fromRowId") REFERENCES "DataRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRowLink" ADD CONSTRAINT "DataRowLink_toRowId_fkey" FOREIGN KEY ("toRowId") REFERENCES "DataRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataView" ADD CONSTRAINT "DataView_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DataPayload"("contentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataView" ADD CONSTRAINT "DataView_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
