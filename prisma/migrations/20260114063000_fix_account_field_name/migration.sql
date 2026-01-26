-- Rename Account.providerAccId to Account.providerAccountId
ALTER TABLE "Account" RENAME COLUMN "providerAccId" TO "providerAccountId";

-- Drop old unique constraint
ALTER TABLE "Account" DROP CONSTRAINT IF EXISTS "Account_provider_providerAccId_key";

-- Add new unique constraint
ALTER TABLE "Account" ADD CONSTRAINT "Account_provider_providerAccountId_key" UNIQUE ("provider", "providerAccountId");
