-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'admin', 'member', 'guest');

-- DropIndex
DROP INDEX "idx_path_text_prefix";

-- DropIndex
DROP INDEX "idx_struct_content_data_gin";

-- AlterTable
ALTER TABLE "StructuredDocument" ADD COLUMN     "categoryId" UUID,
ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'guest',
ALTER COLUMN "passwordHash" DROP NOT NULL;

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
    "providerAccountId" VARCHAR(255) NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" BIGINT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "branchPreset" VARCHAR(50),
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "ownerId" UUID NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewGrant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "viewKey" VARCHAR(100) NOT NULL,
    "userId" UUID,
    "role" "UserRole",
    "categoryId" UUID,
    "documentId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViewGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Account_provider_idx" ON "Account"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_ownerId_isPublished_displayOrder_idx" ON "Category"("ownerId", "isPublished", "displayOrder");

-- CreateIndex
CREATE INDEX "Category_displayOrder_idx" ON "Category"("displayOrder");

-- CreateIndex
CREATE INDEX "ViewGrant_viewKey_idx" ON "ViewGrant"("viewKey");

-- CreateIndex
CREATE INDEX "ViewGrant_userId_viewKey_idx" ON "ViewGrant"("userId", "viewKey");

-- CreateIndex
CREATE INDEX "ViewGrant_role_viewKey_idx" ON "ViewGrant"("role", "viewKey");

-- CreateIndex
CREATE INDEX "ViewGrant_categoryId_idx" ON "ViewGrant"("categoryId");

-- CreateIndex
CREATE INDEX "ViewGrant_documentId_idx" ON "ViewGrant"("documentId");

-- CreateIndex
CREATE INDEX "StructuredDocument_categoryId_displayOrder_idx" ON "StructuredDocument"("categoryId", "displayOrder");

-- CreateIndex
CREATE INDEX "StructuredDocument_parentId_displayOrder_idx" ON "StructuredDocument"("parentId", "displayOrder");

-- AddForeignKey
ALTER TABLE "StructuredDocument" ADD CONSTRAINT "StructuredDocument_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewGrant" ADD CONSTRAINT "ViewGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewGrant" ADD CONSTRAINT "ViewGrant_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewGrant" ADD CONSTRAINT "ViewGrant_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StructuredDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
