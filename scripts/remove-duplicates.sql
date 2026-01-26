-- Remove duplicate ContentNode records
-- Keeps the most recent version (by updatedAt) of each title within the same parent

-- Step 1: Identify duplicates
SELECT '=== DUPLICATE RECORDS ===' as status;
SELECT
  COALESCE(CAST("parentId" AS TEXT), 'ROOT') as parent,
  title,
  COUNT(*) as count,
  STRING_AGG(SUBSTRING(id::TEXT, 1, 8), ', ') as id_prefixes
FROM "ContentNode"
WHERE "deletedAt" IS NULL
GROUP BY "parentId", title
HAVING COUNT(*) > 1
ORDER BY parent, title;

-- Step 2: Soft delete duplicates, keeping the most recent one
-- Using a CTE to identify which records to keep
WITH ranked_duplicates AS (
  SELECT
    id,
    title,
    "parentId",
    "updatedAt",
    ROW_NUMBER() OVER (
      PARTITION BY "parentId", title
      ORDER BY "updatedAt" DESC, "createdAt" DESC
    ) as rn
  FROM "ContentNode"
  WHERE "deletedAt" IS NULL
)
UPDATE "ContentNode" AS cn
SET
  "deletedAt" = NOW(),
  "deletedBy" = (SELECT id FROM "User" LIMIT 1)  -- Use first user as deletedBy
FROM ranked_duplicates AS rd
WHERE cn.id = rd.id
  AND rd.rn > 1  -- Delete all but the most recent one
RETURNING
  SUBSTRING(cn.id::TEXT, 1, 8) as id_prefix,
  cn.title,
  cn."updatedAt";

-- Step 3: Verify no duplicates remain
SELECT '=== VERIFICATION: Remaining duplicates ===' as status;
SELECT
  COALESCE(CAST("parentId" AS TEXT), 'ROOT') as parent,
  title,
  COUNT(*) as count
FROM "ContentNode"
WHERE "deletedAt" IS NULL
GROUP BY "parentId", title
HAVING COUNT(*) > 1
ORDER BY parent, title;

-- Step 4: Show count of deleted vs remaining records
SELECT '=== SUMMARY ===' as status;
SELECT
  'Active records' as type,
  COUNT(*) as count
FROM "ContentNode"
WHERE "deletedAt" IS NULL
UNION ALL
SELECT
  'Deleted (duplicates)' as type,
  COUNT(*) as count
FROM "ContentNode"
WHERE "deletedAt" IS NOT NULL;
