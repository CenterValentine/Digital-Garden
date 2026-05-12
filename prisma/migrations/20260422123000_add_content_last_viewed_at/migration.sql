-- Backfill: this migration was applied to production via `prisma db push`
-- without producing a migration file. SQL reconstructed from schema state.
-- Apply on prod via: `npx prisma migrate resolve --applied 20260422123000_add_content_last_viewed_at`

-- AlterTable
ALTER TABLE "ContentNode" ADD COLUMN "lastViewedAt" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "ContentNode_ownerId_lastViewedAt_idx" ON "ContentNode"("ownerId", "lastViewedAt");
