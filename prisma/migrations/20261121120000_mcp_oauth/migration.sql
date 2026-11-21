-- CreateTable
CREATE TABLE "McpOAuthClient" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clientId" VARCHAR(64) NOT NULL,
    "clientName" VARCHAR(200) NOT NULL,
    "redirectUris" TEXT[],
    "lastUsedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpOAuthCode" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codeHash" CHAR(64) NOT NULL,
    "clientId" VARCHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" VARCHAR(128) NOT NULL,
    "codeChallengeMethod" VARCHAR(8) NOT NULL,
    "scope" TEXT[],
    "grant" JSONB NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthClient_clientId_key" ON "McpOAuthClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthCode_codeHash_key" ON "McpOAuthCode"("codeHash");

-- CreateIndex
CREATE INDEX "McpOAuthCode_expiresAt_idx" ON "McpOAuthCode"("expiresAt");

-- AddForeignKey
ALTER TABLE "McpOAuthCode" ADD CONSTRAINT "McpOAuthCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthCode" ADD CONSTRAINT "McpOAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

