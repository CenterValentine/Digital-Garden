-- AI row digests (AI-BULK-ROW-READING-PLAN §5): per-table opt-in plus a
-- 1:1 sidecar holding one AI-written line per row with its provenance.

-- AlterTable
ALTER TABLE "DataPayload" ADD COLUMN     "rowDigests" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DataRowDigest" (
    "rowId" UUID NOT NULL,
    "digest" VARCHAR(400) NOT NULL,
    "sourceHash" VARCHAR(64) NOT NULL,
    "dirty" BOOLEAN NOT NULL DEFAULT false,
    "model" VARCHAR(100),
    "generatedAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DataRowDigest_pkey" PRIMARY KEY ("rowId")
);

-- CreateIndex
CREATE INDEX "DataRowDigest_dirty_idx" ON "DataRowDigest"("dirty");

-- AddForeignKey
ALTER TABLE "DataRowDigest" ADD CONSTRAINT "DataRowDigest_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "DataRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
