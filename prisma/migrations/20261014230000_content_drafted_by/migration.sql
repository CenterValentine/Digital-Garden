-- Who drafted a content node when an AI did ("ai-chat" | "mcp"), which chat
-- or MCP token, and when. Additive and nullable: existing rows read as
-- user-drafted, so this deploys AHEAD of the code that writes it.

-- AlterTable
ALTER TABLE "ContentNode" ADD COLUMN     "draftedAt" TIMESTAMPTZ(6),
ADD COLUMN     "draftedBy" VARCHAR(16),
ADD COLUMN     "draftedByRef" VARCHAR(64);
