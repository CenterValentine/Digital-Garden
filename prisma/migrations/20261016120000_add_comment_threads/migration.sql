-- Comment threads on notes (COMMENTS-ANNOTATIONS-PLAN.md §3): the anchor is the
-- `comment` mark in the document; these rows hold the discussion beside it.

-- CreateTable
CREATE TABLE "CommentThread" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contentId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "anchor" JSONB,
    "resolvedAt" TIMESTAMPTZ(6),
    "resolvedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CommentThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "threadId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" JSONB NOT NULL DEFAULT '[]',
    "editedAt" TIMESTAMPTZ(6),
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommentThread_contentId_resolvedAt_idx" ON "CommentThread"("contentId", "resolvedAt");

-- CreateIndex
CREATE INDEX "CommentThread_contentId_updatedAt_idx" ON "CommentThread"("contentId", "updatedAt");

-- CreateIndex
CREATE INDEX "Comment_threadId_createdAt_idx" ON "Comment"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "CommentThread" ADD CONSTRAINT "CommentThread_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentThread" ADD CONSTRAINT "CommentThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CommentThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

