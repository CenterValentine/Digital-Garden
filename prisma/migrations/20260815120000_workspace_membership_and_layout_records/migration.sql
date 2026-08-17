
-- CreateTable
CREATE TABLE "ContentWorkspaceTab" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "affinityH" VARCHAR(8),
    "affinityV" VARCHAR(8),
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentWorkspaceTab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentWorkspaceLayoutRecord" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL,
    "family" VARCHAR(48) NOT NULL,
    "deviceId" VARCHAR(64) NOT NULL,
    "layoutMode" VARCHAR(32) NOT NULL DEFAULT 'single',
    "paneOrder" JSONB NOT NULL DEFAULT '[]',
    "lastActive" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ContentWorkspaceLayoutRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentWorkspaceTab_workspaceId_contentId_key" ON "ContentWorkspaceTab"("workspaceId", "contentId");

-- CreateIndex
CREATE INDEX "ContentWorkspaceTab_contentId_idx" ON "ContentWorkspaceTab"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentWorkspaceLayoutRecord_workspaceId_family_deviceId_key" ON "ContentWorkspaceLayoutRecord"("workspaceId", "family", "deviceId");

-- CreateIndex
CREATE INDEX "ContentWorkspaceLayoutRecord_workspaceId_updatedAt_idx" ON "ContentWorkspaceLayoutRecord"("workspaceId", "updatedAt");

-- AddForeignKey
ALTER TABLE "ContentWorkspaceTab" ADD CONSTRAINT "ContentWorkspaceTab_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ContentWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentWorkspaceTab" ADD CONSTRAINT "ContentWorkspaceTab_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentWorkspaceLayoutRecord" ADD CONSTRAINT "ContentWorkspaceLayoutRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ContentWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
