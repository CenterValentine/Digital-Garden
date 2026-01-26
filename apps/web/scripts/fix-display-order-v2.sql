-- Fix displayOrder values - Version 2 with better verification
-- Step 1: Show all root items BEFORE fix
SELECT '=== BEFORE FIX: Root Items ===' as status;
SELECT
  SUBSTRING(id::TEXT, 1, 8) as id_prefix,
  title,
  "displayOrder",
  "updatedAt"
FROM "ContentNode"
WHERE "parentId" IS NULL
  AND "deletedAt" IS NULL
ORDER BY "displayOrder", title;

-- Step 2: Apply fix using ROW_NUMBER() for sequential ordering
WITH ranked_nodes AS (
  SELECT
    id,
    "parentId",
    ROW_NUMBER() OVER (PARTITION BY "parentId" ORDER BY "displayOrder" ASC, title ASC) - 1 AS new_order,
    "displayOrder" as old_order
  FROM "ContentNode"
  WHERE "deletedAt" IS NULL
)
UPDATE "ContentNode" AS cn
SET
  "displayOrder" = rn.new_order,
  "updatedAt" = NOW()
FROM ranked_nodes AS rn
WHERE cn.id = rn.id
  AND cn."displayOrder" != rn.new_order
RETURNING
  SUBSTRING(cn.id::TEXT, 1, 8) as id_prefix,
  cn.title,
  rn.old_order,
  rn.new_order;

-- Step 3: Show all root items AFTER fix
SELECT '=== AFTER FIX: Root Items ===' as status;
SELECT
  SUBSTRING(id::TEXT, 1, 8) as id_prefix,
  title,
  "displayOrder",
  "updatedAt"
FROM "ContentNode"
WHERE "parentId" IS NULL
  AND "deletedAt" IS NULL
ORDER BY "displayOrder", title;

-- Step 4: Verify no duplicates exist
SELECT '=== VERIFICATION: Checking for duplicate displayOrder values ===' as status;
SELECT
  COALESCE(CAST("parentId" AS TEXT), 'ROOT') AS parent,
  "displayOrder",
  COUNT(*) as count,
  STRING_AGG(title, ', ') as titles
FROM "ContentNode"
WHERE "deletedAt" IS NULL
GROUP BY "parentId", "displayOrder"
HAVING COUNT(*) > 1
ORDER BY parent, "displayOrder";
