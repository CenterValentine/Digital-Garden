-- Backfill: columns that shipped to the schema via `prisma db execute` without
-- a migration file (commit ac3319d — "DB column applied surgically; drift is a
-- separate concern, tracked outside this PR"). Every statement is idempotent,
-- so this is safe on dev (already applied via db execute/push), prod, and fresh
-- installs.

-- User.canClaimCustomHosts — permission gate for claiming custom hosts.
ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "canClaimCustomHosts" BOOLEAN NOT NULL DEFAULT false;

-- TenantHost: domain verification timestamp + Vercel domain config metadata.
ALTER TABLE "TenantHost"
    ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMPTZ(6);
ALTER TABLE "TenantHost"
    ADD COLUMN IF NOT EXISTS "vercelConfigData" JSONB;
