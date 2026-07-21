-- SitePage: low-code page-composer governance model (config + draftConfig
-- draft/publish seam). Generated via offline schema diff to avoid dragging
-- in cross-branch drift from the shared dev DB.
--
-- DEV NOTE: the shared Neon dev DB already has this table (applied earlier
-- via raw SQL), so on dev run `prisma migrate resolve --applied
-- 20260721120000_add_site_page` to record it WITHOUT re-running. On a clean
-- DB (prod) `prisma migrate deploy` creates it for real.

-- CreateTable
CREATE TABLE "SitePage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "kind" VARCHAR(60) NOT NULL,
    "navLabel" VARCHAR(120),
    "navOrder" INTEGER NOT NULL DEFAULT 0,
    "visibility" TEXT NOT NULL DEFAULT 'draft',
    "config" JSONB NOT NULL DEFAULT '{}',
    "draftConfig" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SitePage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SitePage_tenantId_visibility_navOrder_idx" ON "SitePage"("tenantId", "visibility", "navOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SitePage_tenantId_slug_key" ON "SitePage"("tenantId", "slug");

-- AddForeignKey
ALTER TABLE "SitePage" ADD CONSTRAINT "SitePage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

