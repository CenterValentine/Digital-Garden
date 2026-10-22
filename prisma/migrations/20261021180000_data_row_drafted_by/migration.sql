-- AlterTable
ALTER TABLE "DataRow" ADD COLUMN     "draftedAt" TIMESTAMPTZ(6),
ADD COLUMN     "draftedBy" VARCHAR(16),
ADD COLUMN     "draftedByRef" VARCHAR(64);

