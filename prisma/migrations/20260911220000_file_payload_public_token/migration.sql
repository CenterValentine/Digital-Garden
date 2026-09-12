-- AlterTable
ALTER TABLE "FilePayload" ADD COLUMN     "publicToken" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "FilePayload_publicToken_key" ON "FilePayload"("publicToken");
