-- Verify database cleanup

-- Show all root items (active)
SELECT '=== ACTIVE ROOT ITEMS ===' as status;
SELECT
  SUBSTRING(id::TEXT, 1, 8) as id_prefix,
  title,
  "displayOrder",
  "createdAt"
FROM "ContentNode"
WHERE "parentId" IS NULL
  AND "deletedAt" IS NULL
ORDER BY "displayOrder";

-- Show deleted root items
SELECT '=== DELETED ROOT ITEMS ===' as status;
SELECT
  SUBSTRING(id::TEXT, 1, 8) as id_prefix,
  title,
  "displayOrder",
  "deletedAt"
FROM "ContentNode"
WHERE "parentId" IS NULL
  AND "deletedAt" IS NOT NULL
ORDER BY "deletedAt" DESC
LIMIT 20;

-- Count active vs deleted
SELECT '=== COUNTS ===' as status;
SELECT
  'Total active' as type,
  COUNT(*) as count
FROM "ContentNode"
WHERE "deletedAt" IS NULL
UNION ALL
SELECT
  'Total deleted' as type,
  COUNT(*) as count
FROM "ContentNode"
WHERE "deletedAt" IS NOT NULL;

-- Check for duplicates in active records
SELECT '=== REMAINING DUPLICATES IN ACTIVE RECORDS ===' as status;
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
