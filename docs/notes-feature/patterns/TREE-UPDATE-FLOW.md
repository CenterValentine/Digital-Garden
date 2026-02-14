# Content Tree Update Flow

## How the Tree Updates on Drag & Drop

### Overview

The content tree follows a **client-optimistic + server-authoritative** pattern:

1. **User drags** item in tree UI
2. **Client optimistically updates** UI immediately (feels instant)
3. **API call** sent to server (POST /api/content/content/move)
4. **Server validates** and persists change
5. **Client reconciles** on success or reverts on error

---

## Flow Diagram

```
User Drags File
      ↓
┌─────────────────────────────────────┐
│ 1. Client: Optimistic Update        │
│    - Update local Zustand state     │
│    - Reorder tree visually           │
│    - Show loading indicator          │
└─────────────────────────────────────┘
      ↓
┌─────────────────────────────────────┐
│ 2. API Call                          │
│    POST /api/content/content/move      │
│    {                                 │
│      contentId,                      │
│      targetParentId,                 │
│      newDisplayOrder                 │
│    }                                 │
└─────────────────────────────────────┘
      ↓
┌─────────────────────────────────────┐
│ 3. Server Processing                 │
│    - Validate ownership              │
│    - Prevent cycles                  │
│    - Update ContentNode.parentId     │
│    - Update ContentNode.displayOrder │
│    - Update ContentPath (materialized)│
│    - Recursively update child paths  │
└─────────────────────────────────────┘
      ↓
┌─────────────────────────────────────┐
│ 4. Client Reconciliation             │
│    ✓ Success: Keep optimistic update │
│    ✗ Error: Revert to previous state │
└─────────────────────────────────────┘
```

---

## Client Implementation (Example with Zustand + React)

### State Management

```typescript
// stores/tree-store.ts
import { create } from "zustand";
import type { ContentListItem } from "@/lib/content";

interface TreeState {
  tree: ContentListItem[];
  isMoving: boolean;
  
  // Optimistic update
  moveNode: (contentId: string, targetParentId: string | null, newDisplayOrder: number) => void;
  
  // Revert on error
  revertMove: (originalTree: ContentListItem[]) => void;
  
  // Reconcile after API call
  confirmMove: () => void;
  
  // Refetch tree
  refetchTree: () => Promise<void>;
}

export const useTreeStore = create<TreeState>((set, get) => ({
  tree: [],
  isMoving: false,
  
  moveNode: (contentId, targetParentId, newDisplayOrder) => {
    const { tree } = get();
    
    // Save original state for potential revert
    const originalTree = structuredClone(tree);
    
    // Optimistically update tree
    const updated = optimisticallyMoveNode(tree, contentId, targetParentId, newDisplayOrder);
    
    set({ tree: updated, isMoving: true });
    
    // Make API call
    fetch("/api/content/content/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId, targetParentId, newDisplayOrder }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Move failed");
        return res.json();
      })
      .then(() => {
        // Success: confirm move
        get().confirmMove();
      })
      .catch((error) => {
        // Error: revert
        console.error("Move failed:", error);
        get().revertMove(originalTree);
        alert("Failed to move item. Please try again.");
      });
  },
  
  revertMove: (originalTree) => {
    set({ tree: originalTree, isMoving: false });
  },
  
  confirmMove: () => {
    set({ isMoving: false });
  },
  
  refetchTree: async () => {
    const res = await fetch("/api/content/content/tree");
    const data = await res.json();
    set({ tree: data.data.tree });
  },
}));

// Helper: Optimistically move node in tree
function optimisticallyMoveNode(
  tree: ContentListItem[],
  contentId: string,
  targetParentId: string | null,
  newDisplayOrder: number
): ContentListItem[] {
  const updated = structuredClone(tree);
  
  // Find node to move
  const node = findNodeById(updated, contentId);
  if (!node) return tree;
  
  // Remove from current parent
  removeNodeFromParent(updated, contentId);
  
  // Update node
  node.parentId = targetParentId;
  node.displayOrder = newDisplayOrder;
  
  // Insert into new parent
  insertNodeIntoParent(updated, node, targetParentId);
  
  return updated;
}
```

### React Component (with react-arborist)

```typescript
// components/FileTree.tsx
import { Tree } from "react-arborist";
import { useTreeStore } from "@/stores/tree-store";

export function FileTree() {
  const { tree, isMoving, moveNode } = useTreeStore();
  
  return (
    <Tree
      data={tree}
      onMove={({ dragIds, parentId, index }) => {
        const contentId = dragIds[0];
        moveNode(contentId, parentId, index);
      }}
      // Show loading state during move
      disableDrag={isMoving}
      disableDrop={isMoving}
    />
  );
}
```

---

## Server Implementation (Already Done)

### POST /api/content/content/move

```typescript
// app/api/content/content/move/route.ts

export async function POST(request: NextRequest) {
  const { contentId, targetParentId, newDisplayOrder } = await request.json();
  
  // 1. Validate ownership
  const content = await prisma.contentNode.findUnique({ where: { id: contentId } });
  if (content.ownerId !== session.user.id) throw new Error("Forbidden");
  
  // 2. Prevent cycles
  if (await checkIsDescendant(targetParentId, contentId)) {
    throw new Error("Cannot move to descendant");
  }
  
  // 3. Update database
  await prisma.contentNode.update({
    where: { id: contentId },
    data: {
      parentId: targetParentId,
      displayOrder: newDisplayOrder,
    },
  });
  
  // 4. Update materialized path
  await updateMaterializedPath(contentId);
  await updateChildrenPaths(contentId);
  
  return NextResponse.json({ success: true });
}
```

---

## Alternative Patterns

### Pattern A: Full Refetch (Simpler, Less Performant)

```typescript
// After API call succeeds:
await refetchTree();
```

**Pros:**
- Simple implementation
- Always in sync with server
- No complex client-side tree manipulation

**Cons:**
- Slower (network roundtrip)
- Causes full tree re-render
- Not ideal for large trees

### Pattern B: Optimistic Only (Current Recommendation)

```typescript
// Optimistically update → API call → revert on error
moveNode(contentId, targetParentId, newDisplayOrder);
```

**Pros:**
- Instant visual feedback
- Good UX (feels fast)
- Minimal network traffic

**Cons:**
- Requires careful state management
- Potential for inconsistency if API fails silently

### Pattern C: WebSocket Real-Time

```typescript
// WebSocket listens for tree changes
socket.on("tree:updated", (data) => {
  updateTreeFromServer(data);
});
```

**Pros:**
- Real-time collaboration
- Multi-user sync
- Server-authoritative

**Cons:**
- Requires WebSocket infrastructure
- More complex setup
- Overkill for single-user editing

---

## Recommendation

Use **Pattern B (Optimistic Update)** for M3 (UI Foundation):

1. Optimistically update on drag
2. Make API call in background
3. Revert if API call fails
4. Optionally refetch on page load or tab focus

Add **Pattern C (WebSocket)** in M14 (Post-MVP) for collaborative editing.

---

## Testing Drag & Drop

### Manual Test Cases

1. **Happy path**: Drag file to new folder
   - ✓ UI updates immediately
   - ✓ API call succeeds
   - ✓ Change persists on page reload

2. **Cycle prevention**: Drag folder to its own child
   - ✓ API call fails with validation error
   - ✓ UI reverts to original position
   - ✓ User sees error message

3. **Permission denied**: Drag another user's file (if multi-user)
   - ✓ API call fails with 403
   - ✓ UI reverts
   - ✓ User sees permission error

4. **Network failure**: Drag with network offline
   - ✓ API call fails
   - ✓ UI reverts after timeout
   - ✓ User sees network error

5. **Concurrent moves**: Two users move same file
   - ✓ Last write wins (database)
   - ✓ Both clients eventually consistent
   - ✓ Consider adding optimistic locking (future)

---

## Summary

**Tree updates are 3-step:**
1. **Client**: Optimistic UI update
2. **Server**: Validate + persist + update paths
3. **Client**: Confirm or revert

**Why optimistic?**
- Instant feedback (UX)
- Feels responsive
- Minimal perceived latency

**Why server-authoritative?**
- Single source of truth
- Validation (cycles, ownership)
- Consistency across sessions

