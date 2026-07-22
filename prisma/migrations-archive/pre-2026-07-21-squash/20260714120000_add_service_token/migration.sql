-- CreateTable
CREATE TABLE "ServiceToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "tokenPrefix" VARCHAR(16) NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['workflows:callback']::TEXT[],
    "lastUsedAt" TIMESTAMPTZ(6),
    "expiresAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ServiceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceToken_tokenHash_key" ON "ServiceToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ServiceToken_userId_revokedAt_idx" ON "ServiceToken"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "ServiceToken_tokenPrefix_idx" ON "ServiceToken"("tokenPrefix");

-- AddForeignKey
ALTER TABLE "ServiceToken" ADD CONSTRAINT "ServiceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

