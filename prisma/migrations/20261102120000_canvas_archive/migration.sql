-- CreateTable
CREATE TABLE "CanvasConnection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "baseUrl" VARCHAR(500) NOT NULL,
    "tokenEncrypted" TEXT,
    "canvasUserId" VARCHAR(64),
    "displayName" VARCHAR(255),
    "lastUsedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CanvasConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasSyncLink" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connectionId" UUID NOT NULL,
    "contentId" UUID,
    "courseId" VARCHAR(128) NOT NULL,
    "canvasType" VARCHAR(32) NOT NULL,
    "canvasKey" VARCHAR(255) NOT NULL,
    "moduleId" VARCHAR(128),
    "remoteVersion" VARCHAR(128),
    "importedHash" VARCHAR(64),
    "status" VARCHAR(20) NOT NULL DEFAULT 'linked',
    "importedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CanvasSyncLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CanvasConnection_ownerId_baseUrl_key" ON "CanvasConnection"("ownerId", "baseUrl");

-- CreateIndex
CREATE UNIQUE INDEX "CanvasSyncLink_contentId_key" ON "CanvasSyncLink"("contentId");

-- CreateIndex
CREATE INDEX "CanvasSyncLink_connectionId_courseId_moduleId_idx" ON "CanvasSyncLink"("connectionId", "courseId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "CanvasSyncLink_connectionId_courseId_canvasKey_key" ON "CanvasSyncLink"("connectionId", "courseId", "canvasKey");

-- AddForeignKey
ALTER TABLE "CanvasConnection" ADD CONSTRAINT "CanvasConnection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasSyncLink" ADD CONSTRAINT "CanvasSyncLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CanvasConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasSyncLink" ADD CONSTRAINT "CanvasSyncLink_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
