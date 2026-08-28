-- AlterEnum
ALTER TYPE "ContentType" ADD VALUE 'shortcut';

-- CreateTable
CREATE TABLE "ShortcutPayload" (
    "contentId" UUID NOT NULL,
    "targetContentId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ShortcutPayload_pkey" PRIMARY KEY ("contentId")
);

-- CreateIndex
CREATE INDEX "ShortcutPayload_targetContentId_idx" ON "ShortcutPayload"("targetContentId");

-- AddForeignKey
ALTER TABLE "ShortcutPayload" ADD CONSTRAINT "ShortcutPayload_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortcutPayload" ADD CONSTRAINT "ShortcutPayload_targetContentId_fkey" FOREIGN KEY ("targetContentId") REFERENCES "ContentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
