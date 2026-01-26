-- Add userId and color fields to Tag table
-- Remove old unique constraints
ALTER TABLE "Tag" DROP CONSTRAINT IF EXISTS "Tag_name_key";
ALTER TABLE "Tag" DROP CONSTRAINT IF EXISTS "Tag_slug_key";

-- Add new columns
ALTER TABLE "Tag" ADD COLUMN IF NOT EXISTS "userId" UUID;
ALTER TABLE "Tag" ADD COLUMN IF NOT EXISTS "color" VARCHAR(7);

-- Set default userId for existing tags (if any)
-- This uses the first user in the database as the owner
UPDATE "Tag"
SET "userId" = (SELECT "id" FROM "User" LIMIT 1)
WHERE "userId" IS NULL;

-- Make userId NOT NULL after setting defaults
ALTER TABLE "Tag" ALTER COLUMN "userId" SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE "Tag" DROP CONSTRAINT IF EXISTS "Tag_userId_fkey";
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- Add composite unique constraint
ALTER TABLE "Tag" DROP CONSTRAINT IF EXISTS "Tag_userId_slug_key";
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_slug_key" UNIQUE ("userId", "slug");

-- Add index
DROP INDEX IF EXISTS "Tag_userId_name_idx";
CREATE INDEX "Tag_userId_name_idx" ON "Tag"("userId", "name");
