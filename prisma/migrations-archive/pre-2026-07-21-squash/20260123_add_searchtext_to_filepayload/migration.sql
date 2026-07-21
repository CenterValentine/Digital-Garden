-- Add searchText field to FilePayload for full-text search
ALTER TABLE "FilePayload" ADD COLUMN IF NOT EXISTS "searchText" TEXT NOT NULL DEFAULT '';

-- Add GIN index for full-text search on searchText
CREATE INDEX IF NOT EXISTS "FilePayload_searchText_idx" ON "FilePayload" USING GIN ("searchText" gin_trgm_ops);
