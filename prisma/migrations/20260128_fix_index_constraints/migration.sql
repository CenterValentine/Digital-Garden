-- Fix Index and Constraint Drift
-- This captures minor schema differences between migration history and database

-- ContentNode: Removed unique index on slug (was changed to composite unique on ownerId+slug)
-- No action needed - composite unique index already exists per migration 20260123144248_fix_slug_unique_per_user

-- Tag table: Re-align foreign key and indexes to match schema
-- Drop old constraints if they exist
ALTER TABLE "Tag" DROP CONSTRAINT IF EXISTS "Tag_userId_fkey_old";

-- Ensure correct foreign key exists
DO $$ BEGIN
  ALTER TABLE "Tag" DROP CONSTRAINT IF EXISTS "Tag_userId_fkey";
  ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Ensure correct indexes exist
CREATE INDEX IF NOT EXISTS "Tag_userId_name_idx" ON "Tag"("userId", "name");

-- Drop old unique constraints that were replaced by composite unique
DROP INDEX IF EXISTS "Tag_name_key";
DROP INDEX IF EXISTS "Tag_slug_key";

-- Ensure composite unique constraint exists (per latest schema)
CREATE UNIQUE INDEX IF NOT EXISTS "Tag_userId_slug_key" ON "Tag"("userId", "slug");
