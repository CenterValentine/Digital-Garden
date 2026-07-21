-- Prisma-canonical SQL (from `migrate diff --from-empty --to-schema`).
-- Drift-clean: exactly reproduces the SearchConnection model.

CREATE TABLE "SearchConnection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "SearchConnection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SearchConnection_ownerId_isDefault_idx" ON "SearchConnection"("ownerId", "isDefault");

CREATE UNIQUE INDEX "SearchConnection_ownerId_provider_key" ON "SearchConnection"("ownerId", "provider");

ALTER TABLE "SearchConnection" ADD CONSTRAINT "SearchConnection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
