-- Chat Contexts (custom-instruction presets).
--
-- Adds:
--   - ChatContext table — user-authored named instruction blocks that,
--     when active, shape the chat assistant's voice/output.
--   - Conversation.activeContextId — single active context per chat
--     (ChatGPT-style), FK with ON DELETE SET NULL so deleting a context
--     clears the link instead of cascading away the conversation.
--
-- Every statement is idempotent so this is safe against dev (db push may
-- have already created these), prod, and fresh installs.

-- ─── ChatContext table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ChatContext" (
    "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
    "ownerId"   UUID         NOT NULL,
    "name"      VARCHAR(120) NOT NULL,
    "body"      TEXT         NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),
    CONSTRAINT "ChatContext_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChatContext_ownerId_updatedAt_idx"
    ON "ChatContext" ("ownerId", "updatedAt");
CREATE INDEX IF NOT EXISTS "ChatContext_ownerId_deletedAt_idx"
    ON "ChatContext" ("ownerId", "deletedAt");

-- owner FK (cascade: deleting a user removes their contexts)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ChatContext_ownerId_fkey'
    ) THEN
        ALTER TABLE "ChatContext"
            ADD CONSTRAINT "ChatContext_ownerId_fkey"
            FOREIGN KEY ("ownerId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── Conversation.activeContextId ───────────────────────────────────
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "activeContextId" UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Conversation_activeContextId_fkey'
    ) THEN
        ALTER TABLE "Conversation"
            ADD CONSTRAINT "Conversation_activeContextId_fkey"
            FOREIGN KEY ("activeContextId") REFERENCES "ChatContext"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
