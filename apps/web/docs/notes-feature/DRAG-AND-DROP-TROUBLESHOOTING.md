# Drag-and-Drop Troubleshooting Guide

This document contains lessons learned from debugging file tree drag-and-drop persistence issues (January 2026).

## Problem Summary

File tree items were not maintaining their order after drag-and-drop operations. Items would either:
- Revert to original position after refresh
- Jump to incorrect positions (one position too far)
- Not move at all when dropped on adjacent positions

## Root Causes Identified

### 1. Database Corruption: Duplicate Records

**Issue:** The `ContentNode` table contained duplicate records with the same title and parent, created by seed scripts or previous upload operations.

**Symptoms:**
- Move API was updating 30+ items when only 8-10 were visible in the UI
- `displayOrder` values were non-sequential (0, 1, 3, 8, 65, 66 instead of 0, 1, 2, 3, 4, 5)
- Items had duplicate `displayOrder` values under the same parent

**Fix:**
```sql
-- Remove duplicates, keeping the most recent version
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
  "deletedBy" = (SELECT id FROM "User" LIMIT 1)
FROM ranked_duplicates AS rd
WHERE cn.id = rd.id
  AND rd.rn > 1;

-- Then renumber all siblings sequentially
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
  AND cn."displayOrder" != rn.new_order;
```

**Scripts created:**
- `apps/web/scripts/remove-duplicates.sql` - Soft-delete duplicate records
- `apps/web/scripts/fix-display-order-v2.sql` - Renumber all siblings sequentially

### 2. Move API Including Soft-Deleted Items

**Issue:** The `moveContentToPosition()` function in the move API was fetching siblings WITHOUT filtering out soft-deleted records.

**Location:** `apps/web/app/api/notes/content/move/route.ts` line 286-294

**Fix:**
```typescript
const siblings = await prisma.contentNode.findMany({
  where: {
    parentId,
    deletedAt: null  // CRITICAL: Exclude soft-deleted items
  },
  include: { /* ... */ },
});
```

**Why this mattered:** Even after soft-deleting duplicates, the move API was still including them in calculations, causing items to be positioned among invisible records.

### 3. React-Arborist Index Mismatch

**Issue:** React-arborist's `index` parameter represents the **insertion point** (where to insert), but our server expected the **final visual position** (where the item ends up after removal).

**Symptoms:**
- Moving an item down by 1 position caused it to jump 2 positions
- Dropping an item on itself caused it to shift one position down

**The problem:**
When moving an item from position 4 to position 5:
1. React-arborist sends `index: 5` (insert here)
2. Client optimistic update adjusts: `5 - 1 = 4` (accounts for removal)
3. Server receives original `index: 5` (unadjusted)
4. Server removes item from 4, inserts at 5 → **final position 5 (one too far!)**

**Fix:** Adjust the index when moving DOWN within the same parent before sending to API.

**Location:** `apps/web/components/notes/content/LeftSidebarContent.tsx` line 275-292

```typescript
// Calculate the API index: react-arborist gives us insertion point, but server expects final visual position
// If moving down within same parent, we need to subtract 1 because server removes item first
let apiIndex = index;
if (isSameParent && currentIndex < index) {
  apiIndex = index - 1; // Adjust for removal shifting items left
}
```

### 4. Drop Zone Ambiguity

**Issue:** When hovering over an item, react-arborist shows TWO drop indicators:
- Blue line ABOVE the item → `index: N`
- Blue line BELOW the item → `index: N+1`

Both should keep the item in its current position if dropped, but only the "above" case worked initially.

**Fix:** Detect when the drop would result in no position change and skip the API call entirely.

**Location:** `apps/web/components/notes/content/LeftSidebarContent.tsx` line 258-273

```typescript
// Find the dragged node's current position
const findNode = (nodes: TreeNode[], parent: string | null = null): boolean => {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === dragIds[0]) {
      currentParentId = parent;
      currentIndex = i;
      return true;
    }
    if (nodes[i].children && nodes[i].children.length > 0) {
      if (findNode(nodes[i].children, nodes[i].id)) return true;
    }
  }
  return false;
};

findNode(originalTree);

// Check if this is actually a position change
const isSameParent = currentParentId === parentId;
const isSamePosition = isSameParent && (currentIndex === index || currentIndex === index - 1);

if (isSamePosition) {
  console.log('[handleMove] No position change detected, skipping API call');
  return; // Skip the move - item is being dropped in same position
}
```

## Debugging Process

### Step 1: Add Debug Logging

Add logging to both client and server to see what's happening:

**Client-side** (`LeftSidebarContent.tsx`):
```typescript
console.log('[handleMove] Drag analysis:', {
  draggedItem: dragIds[0],
  from: { parent: currentParentId || 'ROOT', index: currentIndex },
  to: { parent: parentId || 'ROOT', index },
  isSamePosition,
});
```

**Server-side** (`move/route.ts`):
```typescript
console.log('[Move API] Saving new order for parent:', parentId);
siblings.forEach((sibling, index) => {
  console.log(`  - ${sibling.title} → displayOrder: ${index} ${sibling.id === contentId ? '(MOVED ITEM)' : ''}`);
});
```

**Tree API** (`tree/route.ts`):
```typescript
console.log('[Tree API] Raw database displayOrder values:');
const grouped = allContent.reduce((acc, item) => {
  const key = item.parentId || 'ROOT';
  if (!acc[key]) acc[key] = [];
  acc[key].push({ id: item.id, title: item.title, displayOrder: item.displayOrder });
  return acc;
}, {} as Record<string, any[]>);

for (const [parentId, items] of Object.entries(grouped)) {
  console.log(`  Parent ${parentId}:`);
  items.forEach(item => {
    console.log(`    - ${item.title} (order: ${item.displayOrder})`);
  });
}
```

### Step 2: Check for Database Corruption

Run diagnostic queries to identify issues:

```sql
-- Check for duplicate titles under same parent
SELECT
  COALESCE(CAST("parentId" AS TEXT), 'ROOT') as parent,
  title,
  COUNT(*) as count,
  STRING_AGG(SUBSTRING(id::TEXT, 1, 8), ', ') as id_prefixes
FROM "ContentNode"
WHERE "deletedAt" IS NULL
GROUP BY "parentId", title
HAVING COUNT(*) > 1;

-- Check for duplicate or non-sequential displayOrder values
SELECT
  COALESCE(CAST("parentId" AS TEXT), 'ROOT') AS parent,
  ARRAY_AGG("displayOrder" ORDER BY "displayOrder") AS orders
FROM "ContentNode"
WHERE "deletedAt" IS NULL
GROUP BY "parentId"
HAVING COUNT(*) > 1;
```

### Step 3: Trace Through the Flow

1. **User drags item** from position A to position B
2. **React-arborist** calls `onMove({ dragIds, parentId, index })`
3. **Client** finds current position, checks if it's a no-op, calculates API index
4. **Client** applies optimistic update to UI
5. **API receives** move request with adjusted index
6. **Server** fetches siblings (excluding deleted), sorts by displayOrder
7. **Server** removes item from list, inserts at target index, renumbers ALL siblings (0, 1, 2, 3...)
8. **Server** saves to database in transaction
9. **Client** refetches tree to get canonical ordering
10. **UI updates** with server's authoritative state

## Prevention

### Database Schema Constraints

Consider adding a unique constraint to prevent future duplicates:

```sql
-- Unique constraint on (parentId, title) within same owner
CREATE UNIQUE INDEX idx_content_node_unique_title_per_parent
ON "ContentNode" ("ownerId", "parentId", "title")
WHERE "deletedAt" IS NULL;
```

### Testing Checklist

When modifying drag-and-drop functionality, test:

1. ✅ Move item up (to lower index)
2. ✅ Move item down (to higher index)
3. ✅ Move item to first position
4. ✅ Move item to last position
5. ✅ Drop item on its current position (both above and below indicators)
6. ✅ Drop item on adjacent position (should move exactly 1 space)
7. ✅ Move item to different parent (folder)
8. ✅ Move folder with children
9. ✅ Refresh page and verify order persists
10. ✅ Check server logs show correct displayOrder values

### Key Principles

1. **Always filter out soft-deleted records** in any query that fetches siblings or children
2. **React-arborist's index is an insertion point**, not a final position - adjust accordingly
3. **Renumber ALL siblings sequentially** after every move to prevent gaps/duplicates
4. **Refetch tree after move** to ensure UI matches server's canonical state
5. **Use debug logging** liberally during development to trace data flow
6. **Test edge cases** like dropping on self, moving to first/last position

## Files Modified

- `apps/web/app/api/notes/content/move/route.ts` - Added `deletedAt: null` filter, adjusted index calculation
- `apps/web/components/notes/content/LeftSidebarContent.tsx` - Added position change detection, API index adjustment
- `apps/web/scripts/remove-duplicates.sql` - Script to clean up duplicate records
- `apps/web/scripts/fix-display-order-v2.sql` - Script to renumber displayOrder sequentially

## Related Documentation

- [M4-FILE-TREE-IMPLEMENTATION.md](./M4-FILE-TREE-IMPLEMENTATION.md) - Original file tree implementation
- [TREE-UPDATE-FLOW.md](./TREE-UPDATE-FLOW.md) - How tree updates propagate through the system
- [PRISMA-DATABASE-GUIDE.md](./PRISMA-DATABASE-GUIDE.md) - Database management best practices
