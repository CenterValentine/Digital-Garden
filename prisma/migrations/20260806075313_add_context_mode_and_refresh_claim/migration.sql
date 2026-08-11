-- CreateEnum
CREATE TYPE "ContextMode" AS ENUM ('OPT_OUT', 'REFERENCE', 'STANDARD', 'ENHANCED');

-- AlterTable
ALTER TABLE "AgenticMetadata" ADD COLUMN     "contextMode" "ContextMode",
ADD COLUMN     "refreshClaimedAt" TIMESTAMPTZ(6);

UPDATE "AgenticMetadata" SET "contextMode" = 'OPT_OUT' WHERE "contextOptOut" = true;
