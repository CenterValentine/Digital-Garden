-- CreateEnum
CREATE TYPE "ConnectionInviteStatus" AS ENUM ('pending', 'accepted', 'declined', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "ActivityActorType" AS ENUM ('user', 'system', 'ai', 'extension');

-- CreateTable
CREATE TABLE "ConnectionInvite" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inviterId" UUID NOT NULL,
    "inviteeIdentifier" VARCHAR(255) NOT NULL,
    "inviteeUserId" UUID,
    "status" "ConnectionInviteStatus" NOT NULL DEFAULT 'pending',
    "message" VARCHAR(280),
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "respondedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ConnectionInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserConnection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userAId" UUID NOT NULL,
    "userBId" UUID NOT NULL,
    "connectedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),
    "deletedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "UserConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "blockerId" UUID NOT NULL,
    "blockedUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" VARCHAR(100) NOT NULL,
    "actorType" "ActivityActorType" NOT NULL,
    "actorUserId" UUID,
    "actorLabel" VARCHAR(120),
    "payload" JSONB NOT NULL,
    "subjectType" VARCHAR(50),
    "subjectId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "collapseKey" VARCHAR(120),
    "readAt" TIMESTAMPTZ(6),
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmThread" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pairKey" VARCHAR(80),
    "lastMessageAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DmThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmParticipant" (
    "threadId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadAt" TIMESTAMPTZ(6),
    "lastActiveAt" TIMESTAMPTZ(6),
    "archivedAt" TIMESTAMPTZ(6),
    "deletedAt" TIMESTAMPTZ(6),
    "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmParticipant_pkey" PRIMARY KEY ("threadId","userId")
);

-- CreateTable
CREATE TABLE "DmMessage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "threadId" UUID NOT NULL,
    "senderId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMPTZ(6),
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "DmMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitCounter" (
    "key" VARCHAR(160) NOT NULL,
    "windowStart" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE INDEX "ConnectionInvite_inviterId_status_idx" ON "ConnectionInvite"("inviterId", "status");

-- CreateIndex
CREATE INDEX "ConnectionInvite_inviteeUserId_status_idx" ON "ConnectionInvite"("inviteeUserId", "status");

-- CreateIndex
CREATE INDEX "ConnectionInvite_status_expiresAt_idx" ON "ConnectionInvite"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "UserConnection_userAId_deletedAt_idx" ON "UserConnection"("userAId", "deletedAt");

-- CreateIndex
CREATE INDEX "UserConnection_userBId_deletedAt_idx" ON "UserConnection"("userBId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserConnection_userAId_userBId_key" ON "UserConnection"("userAId", "userBId");

-- CreateIndex
CREATE INDEX "UserBlock_blockedUserId_idx" ON "UserBlock"("blockedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedUserId_key" ON "UserBlock"("blockerId", "blockedUserId");

-- CreateIndex
CREATE INDEX "ActivityEvent_kind_createdAt_idx" ON "ActivityEvent"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_subjectType_subjectId_idx" ON "ActivityEvent"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_readAt_idx" ON "NotificationRecipient"("userId", "readAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_archivedAt_createdAt_idx" ON "NotificationRecipient"("userId", "archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_collapseKey_idx" ON "NotificationRecipient"("userId", "collapseKey");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_eventId_userId_key" ON "NotificationRecipient"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DmThread_pairKey_key" ON "DmThread"("pairKey");

-- CreateIndex
CREATE INDEX "DmThread_lastMessageAt_idx" ON "DmThread"("lastMessageAt");

-- CreateIndex
CREATE INDEX "DmParticipant_userId_deletedAt_idx" ON "DmParticipant"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "DmMessage_threadId_createdAt_idx" ON "DmMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "ConnectionInvite" ADD CONSTRAINT "ConnectionInvite_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionInvite" ADD CONSTRAINT "ConnectionInvite_inviteeUserId_fkey" FOREIGN KEY ("inviteeUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserConnection" ADD CONSTRAINT "UserConnection_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserConnection" ADD CONSTRAINT "UserConnection_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ActivityEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmParticipant" ADD CONSTRAINT "DmParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DmThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmParticipant" ADD CONSTRAINT "DmParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmMessage" ADD CONSTRAINT "DmMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DmThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmMessage" ADD CONSTRAINT "DmMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

