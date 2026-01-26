-- Check for duplicate records at root level
SELECT
  id,
  title,
  "displayOrder",
  "createdAt"
FROM "ContentNode"
WHERE "parentId" IS NULL
  AND "deletedAt" IS NULL
ORDER BY title, "displayOrder";
