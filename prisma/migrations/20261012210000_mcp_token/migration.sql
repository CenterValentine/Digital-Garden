-- CreateTable
CREATE TABLE "McpToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "tokenPrefix" VARCHAR(16) NOT NULL,
    "capabilities" TEXT[] DEFAULT ARRAY['garden:read']::TEXT[],
    "rootIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allChats" BOOLEAN NOT NULL DEFAULT false,
    "readTokenCap" INTEGER,
    "dailyCallCap" INTEGER,
    "issuedVia" VARCHAR(16) NOT NULL DEFAULT 'pat',
    "lastUsedAt" TIMESTAMPTZ(6),
    "expiresAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "McpToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpToken_tokenHash_key" ON "McpToken"("tokenHash");

-- CreateIndex
CREATE INDEX "McpToken_userId_revokedAt_idx" ON "McpToken"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "McpToken_tokenPrefix_idx" ON "McpToken"("tokenPrefix");

-- AddForeignKey
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
