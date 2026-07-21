-- Fix slug unique constraint to be per-user instead of global
-- This allows different users to upload files with the same name

-- Step 1: Drop the existing global unique constraint on slug
ALTER TABLE "ContentNode" DROP CONSTRAINT IF EXISTS "ContentNode_slug_key";

-- Step 2: Add composite unique constraint on (ownerId, slug)
-- This ensures slugs are unique per user, not globally
ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_ownerId_slug_key" UNIQUE ("ownerId", "slug");
