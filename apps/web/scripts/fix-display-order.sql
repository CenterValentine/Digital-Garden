-- Fix displayOrder values for all ContentNode siblings
-- This ensures each group of siblings has sequential displayOrder values: 0, 1, 2, 3...

-- First, let's see the current state
SELECT
  COALESCE(CAST("parentId" AS TEXT), 'ROOT') AS parent,
  COUNT(*) AS item_count,
  ARRAY_AGG("displayOrder" ORDER BY "displayOrder") AS orders
FROM "ContentNode"
WHERE "deletedAt" IS NULL
GROUP BY "parentId"
HAVING COUNT(*) > 1  -- Only show groups with multiple items
ORDER BY parent;

-- Now fix each parent group by setting sequential displayOrder
-- We'll use a CTE to calculate the new order for each node
WITH ranked_nodes AS (
  SELECT
    id,
    "parentId",
    ROW_NUMBER() OVER (PARTITION BY "parentId" ORDER BY "displayOrder" ASC, title ASC) - 1 AS new_order
  FROM "ContentNode"
  WHERE "deletedAt" IS NULL
)
UPDATE "ContentNode" AS cn
SET
  "displayOrder" = rn.new_order,
  "updatedAt" = NOW()
FROM ranked_nodes AS rn
WHERE cn.id = rn.id
  AND cn."displayOrder" != rn.new_order;  -- Only update if changed

-- Show the result
SELECT
  COALESCE(CAST("parentId" AS TEXT), 'ROOT') AS parent,
  COUNT(*) AS item_count,
  ARRAY_AGG("displayOrder" ORDER BY "displayOrder") AS orders
FROM "ContentNode"
WHERE "deletedAt" IS NULL
GROUP BY "parentId"
HAVING COUNT(*) > 1
ORDER BY parent;
