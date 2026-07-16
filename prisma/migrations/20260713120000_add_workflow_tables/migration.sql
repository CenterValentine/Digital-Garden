-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('queued', 'running', 'waiting', 'succeeded', 'failed', 'canceled');

-- CreateTable
CREATE TABLE "WorkflowDefinition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "engine" VARCHAR(50) NOT NULL,
    "engineRef" VARCHAR(200) NOT NULL,
    "inputSchema" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "definitionId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'queued',
    "engine" VARCHAR(50) NOT NULL,
    "engineRunId" VARCHAR(200),
    "engineGateRef" TEXT,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "error" JSONB,
    "gateToken" VARCHAR(200),
    "conversationId" UUID,
    "startedAt" TIMESTAMPTZ(6),
    "finishedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRunEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "runId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "key" VARCHAR(200),
    "type" VARCHAR(50) NOT NULL,
    "stepName" VARCHAR(120),
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRunArtifact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "runId" UUID NOT NULL,
    "contentNodeId" UUID NOT NULL,
    "kind" VARCHAR(50) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRunArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDefinition_ownerId_slug_key" ON "WorkflowDefinition"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "WorkflowRun_ownerId_status_idx" ON "WorkflowRun"("ownerId", "status");

-- CreateIndex
CREATE INDEX "WorkflowRun_definitionId_createdAt_idx" ON "WorkflowRun"("definitionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRunEvent_runId_seq_key" ON "WorkflowRunEvent"("runId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRunEvent_runId_key_key" ON "WorkflowRunEvent"("runId", "key");

-- CreateIndex
CREATE INDEX "WorkflowRunArtifact_runId_idx" ON "WorkflowRunArtifact"("runId");

-- AddForeignKey
ALTER TABLE "WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRunEvent" ADD CONSTRAINT "WorkflowRunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRunArtifact" ADD CONSTRAINT "WorkflowRunArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRunArtifact" ADD CONSTRAINT "WorkflowRunArtifact_contentNodeId_fkey" FOREIGN KEY ("contentNodeId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

