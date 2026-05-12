-- Backfill: this migration was applied to production via `prisma db push`
-- without producing a migration file. SQL reconstructed from schema state.
-- Apply on prod via: `npx prisma migrate resolve --applied 20260423100000_add_reusable_item_display_order`

-- AlterTable
ALTER TABLE "ReusableCategory" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ContentTemplate" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Snippet" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PageTemplate" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ReusableCategory_userId_scope_displayOrder_idx" ON "ReusableCategory"("userId", "scope", "displayOrder");

-- CreateIndex
CREATE INDEX "ContentTemplate_userId_categoryId_displayOrder_idx" ON "ContentTemplate"("userId", "categoryId", "displayOrder");

-- CreateIndex
CREATE INDEX "Snippet_userId_categoryId_displayOrder_idx" ON "Snippet"("userId", "categoryId", "displayOrder");

-- CreateIndex
CREATE INDEX "PageTemplate_userId_categoryId_displayOrder_idx" ON "PageTemplate"("userId", "categoryId", "displayOrder");
