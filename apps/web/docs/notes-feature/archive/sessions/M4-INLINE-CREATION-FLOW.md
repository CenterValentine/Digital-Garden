# M4 Inline Creation Flow

**Feature:** Context menu "New" creates files/folders inline with immediate naming
**Status:** ✅ Complete
**Date:** January 18, 2026

---

## Overview

When users create a new file or folder via the context menu, a temporary placeholder node appears in the tree where the user can immediately type the name. Pressing Enter creates the actual file via API, while Escape cancels.

This replaces the old pattern of showing a separate input field at the top of the sidebar.

---

## User Flow

### Creating a File/Folder

1. **Trigger Creation:**
   - Right-click on file/folder/empty space
   - Select **New** → (Note, Folder, Code, HTML)
   - OR: Press **A** key to open context menu

2. **Name Inline:**
   - Temporary placeholder node appears in tree
   - Node automatically enters edit mode (input field)
   - User types the desired name

3. **Submit:**
   - **Enter** - Creates file/folder via API with typed name
   - **Escape** - Cancels creation, removes placeholder
   - **Click away (blur)** - If name is empty, cancels; otherwise creates

4. **Result:**
   - Tree refreshes to show newly created item
   - Temporary node is replaced with real node (server-assigned ID)

---

## Implementation Details

### 1. Temporary Node Creation

**File:** `LeftSidebarContent.tsx` → `handleCreate()`

```typescript
const tempId = `temp-${Date.now()}-${Math.random()}`;

const tempNode: TreeNode = {
  id: tempId,
  title: "", // Empty - user will type the name
  slug: "",
  contentType: type, // "note", "folder", "code", "html"
  parentId: parentId,
  displayOrder: 0,
  customIcon: null,
  iconColor: null,
  isPublished: false,
  children: type === "folder" ? [] : [],
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};
```

**Key Points:**
- Temporary ID uses timestamp + random for uniqueness
- Title is empty string (user fills it in)
- All required TreeNode fields present to satisfy TypeScript
- Inserted at beginning of target location (first child or first root item)

### 2. Auto-Trigger Edit Mode

**File:** `FileTree.tsx` → `useEffect` watching `editingNodeId`

```typescript
useEffect(() => {
  if (!editingNodeId) return;

  const tree = treeRef.current;
  if (!tree) return;

  // Small delay to ensure the node is rendered in the DOM
  const timeoutId = setTimeout(() => {
    const node = tree.visibleNodes?.find((n: any) => n.id === editingNodeId);

    if (node && !node.isEditing) {
      node.edit(); // Trigger react-arborist inline edit
    }
  }, 50);

  return () => clearTimeout(timeoutId);
}, [editingNodeId]);
```

**Why 50ms delay?**
- React needs time to render the temporary node in the virtual tree
- react-arborist needs time to process the new node and add it to `visibleNodes`
- 50ms is imperceptible to users but sufficient for rendering

**How it works:**
1. Parent sets `editingNodeId={creatingItem?.tempId}` prop
2. FileTree watches this prop with `useEffect`
3. Finds node in tree's `visibleNodes` array
4. Calls `node.edit()` to enter inline edit mode
5. react-arborist shows input field with current title (empty string)

### 3. Dual-Purpose Rename Handler

**File:** `LeftSidebarContent.tsx` → `handleRename()`

```typescript
const handleRename = async (id: string, newName: string) => {
  // Check if this is a temporary node being created
  if (creatingItem && id === creatingItem.tempId) {
    // This is inline creation - create the actual file/folder
    await handleCreateSubmit(newName.trim());
    return;
  }

  // Regular rename flow for existing nodes
  // ... PATCH request to /api/notes/content/{id}
};
```

**Decision Logic:**
- If `id` matches `creatingItem.tempId` → Route to creation flow
- Otherwise → Route to rename flow

**Why dual-purpose?**
- react-arborist's `onRename` callback fires for both rename AND inline creation
- No way to distinguish at the Tree component level
- Parent component has the context (`creatingItem` state) to make the decision

### 4. Create Submission

**File:** `LeftSidebarContent.tsx` → `handleCreateSubmit()`

```typescript
const handleCreateSubmit = async (title: string) => {
  if (!creatingItem || !title.trim()) {
    // User submitted empty name - cancel creation
    handleCreateCancel();
    return;
  }

  const { type, parentId, tempId } = creatingItem;

  // Prepare payload based on content type
  const defaults = {
    folder: { title: title.trim() },
    note: {
      title: title.trim(),
      payload: { tiptapJson: { type: "doc", content: [{ type: "paragraph" }] } },
    },
    code: {
      title: title.trim(),
      payload: { code: "// Your code here", language: "javascript" },
    },
    html: {
      title: title.trim(),
      payload: { html: "<h1>Hello World</h1>" },
    },
  };

  // Build request body with type-specific payloads
  // ... POST to /api/notes/content

  // Success! Clear creating state and refresh tree
  setCreatingItem(null);
  await fetchTree();
};
```

**Payload Strategy:**
- Each content type has default payload structure
- `folder` → `isFolder: true`
- `note` → Empty TipTap document
- `code` → Placeholder code with JavaScript language
- `html` → Minimal HTML boilerplate

### 5. Cancel Creation

**File:** `LeftSidebarContent.tsx` → `handleCreateCancel()`

```typescript
const handleCreateCancel = () => {
  if (!creatingItem || !treeData) return;

  const { tempId } = creatingItem;

  // Remove temporary node from tree (recursive filter)
  const removeTempNode = (nodes: TreeNode[]): TreeNode[] => {
    return nodes
      .filter((node) => node.id !== tempId)
      .map((node) => ({
        ...node,
        children: node.children ? removeTempNode(node.children) : [],
      }));
  };

  const newTreeData = removeTempNode(treeData);
  setTreeData(newTreeData);
  setCreatingItem(null);
};
```

**When called:**
- User presses Escape (react-arborist cancels edit, submits empty string)
- User blurs input with empty name
- Any error during creation (keeps temp node for retry)

---

## State Management

### Creating Item State

```typescript
const [creatingItem, setCreatingItem] = useState<{
  type: "folder" | "note" | "file" | "code" | "html";
  parentId: string | null;
  tempId: string; // Temporary ID for the placeholder node
} | null>(null);
```

**Why track this?**
- Determines if `handleRename` should create or rename
- Provides `tempId` to trigger auto-edit via `editingNodeId` prop
- Stores content type and parent ID for API request

**Lifecycle:**
1. Set in `handleCreate()` when user clicks "New" menu item
2. Passed to `FileTree` as `editingNodeId={creatingItem?.tempId}`
3. Cleared in `handleCreateSubmit()` on success
4. Cleared in `handleCreateCancel()` on cancel/error

---

## Edge Cases Handled

### Edge Case 1: Empty Name Submission
**Scenario:** User presses Enter without typing anything

**Behavior:**
- `handleCreateSubmit()` detects `!title.trim()`
- Calls `handleCreateCancel()` to remove placeholder
- No API call made

**Works?** ✅ Yes

---

### Edge Case 2: API Failure
**Scenario:** Network error or validation failure during creation

**Behavior:**
- Error message shown to user (alert)
- Temporary node remains in tree
- `creatingItem` state NOT cleared
- User can retry by editing the temp node again

**Works?** ✅ Yes

---

### Edge Case 3: Blur with Partial Name
**Scenario:** User types "test" and clicks outside input

**Behavior:**
- react-arborist submits with value "test"
- `handleRename()` detects temp node, routes to `handleCreateSubmit()`
- Creates file named "test"

**Works?** ✅ Yes

---

### Edge Case 4: Keyboard Shortcuts During Edit
**Scenario:** User types "d" while naming a file

**Behavior:**
- FileTree's keyboard handler checks `isTyping` and `isAnyNodeEditing`
- Shortcuts disabled during edit
- "d" is typed into input, NOT triggering delete dialog

**Works?** ✅ Yes (fixed in M4-KEYBOARD-SHORTCUTS-FIX.md)

---

## Comparison: Old vs New Flow

### Old Flow (Deprecated)

```
1. User clicks + button in header
2. Separate input field appears at TOP of sidebar
3. User types name
4. User clicks checkmark or presses Enter
5. API creates file
6. Tree refreshes
7. New file appears (could be anywhere in tree)
```

**Problems:**
- Input field location disconnected from where file appears
- User loses context of where file is being created
- Extra UI element clutters header

### New Flow (Current)

```
1. User right-clicks on target location
2. Selects "New" → content type
3. Placeholder appears AT target location
4. User types name inline (no separate UI)
5. Presses Enter
6. API creates file
7. Tree refreshes, placeholder replaced with real node
```

**Benefits:**
- ✅ Visual feedback at exact creation location
- ✅ No separate UI - leverages react-arborist editing
- ✅ Matches native file explorer UX (macOS Finder, Windows Explorer)
- ✅ Consistent with rename flow (same inline edit UI)

---

## Integration with Context Menu

**File:** `file-tree-actions.tsx`

The "New" submenu items call `onCreate` callbacks:

```typescript
{
  id: "new-note",
  label: "Note (Markdown)",
  icon: <FileText className="h-4 w-4" />,
  onClick: () => onCreateNote?.(targetId || null),
}
```

**Wired in FileNode:**

```typescript
onCreateNote: onCreate
  ? async (parentId: string | null) => onCreate(parentId, "note")
  : undefined,
```

**Target ID Resolution:**
- Empty space → `null` (root level)
- Folder → `clickedId` (create inside)
- File → `clickedNode.parentId` (create as sibling)

See [M4-CONTEXT-MENU-CREATE-BEHAVIOR.md](./M4-CONTEXT-MENU-CREATE-BEHAVIOR.md) for details.

---

## Files Modified

1. **`components/notes/content/LeftSidebarContent.tsx`**
   - Added `handleCreateSubmit()` - Creates file via API
   - Added `handleCreateCancel()` - Removes temporary node
   - Updated `handleRename()` - Routes to create or rename based on ID
   - Updated `handleCreate()` - Creates temporary node and sets state
   - Removed old inline creation UI (separate input field)
   - Passes `editingNodeId={creatingItem?.tempId}` to FileTree

2. **`components/notes/FileTree.tsx`**
   - Added `editingNodeId?: string` prop
   - Added `useEffect` to auto-trigger `node.edit()` when `editingNodeId` changes

**Total:** 2 files, ~120 lines added, ~60 lines removed

---

## Testing Checklist

### Basic Creation
- [x] Right-click folder → New → Note → Type name → Enter → File created
- [x] Right-click file → New → Folder → Type name → Enter → Folder created
- [x] Right-click empty space → New → Code → Type name → Enter → Code created
- [x] Press A key → New → HTML → Type name → Enter → HTML created

### Cancellation
- [x] New → Note → Press Escape → Placeholder removed
- [x] New → Folder → Type nothing → Press Enter → Placeholder removed
- [x] New → Code → Type "test" → Delete all → Press Enter → Placeholder removed
- [x] New → HTML → Click outside input with empty name → Placeholder removed

### Edge Cases
- [x] Type "file.md" with "d" in the name → No delete dialog appears
- [x] Type "test" → Click outside input → File created with name "test"
- [x] Network error during creation → Placeholder remains, can retry
- [x] Create inside deeply nested folder → Appears in correct location

### Parent Resolution
- [x] Right-click folder → New → Note → Created inside folder (child)
- [x] Right-click file → New → Folder → Created next to file (sibling)
- [x] Right-click empty space → New → Note → Created at root level

---

## Performance Considerations

### Temporary Node Insertion
- **Operation:** O(n) recursive tree traversal
- **Impact:** Minimal - trees typically <1000 nodes, modern devices handle easily
- **Optimization:** Could use immutable data structures (Immer) for faster updates

### Auto-Edit Delay
- **Delay:** 50ms timeout
- **Why needed:** React rendering + react-arborist virtual tree processing
- **Perceived latency:** Imperceptible to users (<100ms threshold)

### Tree Refresh After Creation
- **Operation:** Full tree fetch from `/api/notes/content/tree`
- **Impact:** Moderate - O(n) server query + network roundtrip
- **Future optimization:** Optimistic update (replace temp node with real node from API response)

---

## Future Enhancements

### 1. Optimistic Update (No Refresh)
Instead of refreshing entire tree:

```typescript
// Replace temp node with real node from API response
const replaceNode = (nodes: TreeNode[]): TreeNode[] => {
  return nodes.map((node) => {
    if (node.id === tempId) {
      return result.data.node; // Real node from API
    }
    if (node.children) {
      return { ...node, children: replaceNode(node.children) };
    }
    return node;
  });
};

setTreeData(replaceNode(treeData));
setCreatingItem(null);
```

**Benefits:**
- Faster (no network roundtrip)
- Preserves tree state (open/closed folders)
- Less UI flicker

**Trade-offs:**
- Must ensure API response includes full TreeNode structure
- Siblings' `displayOrder` values might be stale (minor issue)

### 2. Template Selection
Allow users to choose from templates when creating notes:

```
New → Note (Markdown) → [Submenu]
  → Blank Note
  → Daily Note (with date template)
  → Meeting Notes (with agenda template)
  → Project Note (with sections)
```

### 3. Smart Default Names
Generate contextual default names:

- **Daily notes:** "2026-01-18"
- **Meeting notes:** "Meeting - [Current date]"
- **Code snippets:** "snippet.[language-extension]"
- **Folders:** "New Folder" (with auto-increment: "New Folder 2", etc.)

### 4. Duplicate Detection
Warn user if name already exists in target location:

```
Input shows error state:
"❌ A file named 'test.md' already exists"

Options:
- Rename to "test (2).md"
- Replace existing file
- Cancel
```

---

## Related Documentation

- [M4-CONTEXT-MENU-CREATE-BEHAVIOR.md](./M4-CONTEXT-MENU-CREATE-BEHAVIOR.md) - Parent resolution logic
- [M4-KEYBOARD-SHORTCUTS-FIX.md](./M4-KEYBOARD-SHORTCUTS-FIX.md) - Input protection during edit
- [M4-SUBMENU-TEST.md](./M4-SUBMENU-TEST.md) - Submenu interaction patterns
- [ADDING-NEW-CONTENT-TYPES.md](./ADDING-NEW-CONTENT-TYPES.md) - Extending with new types

---

## Conclusion

The inline creation flow provides a native file explorer experience where users create files/folders exactly where they intend, with immediate visual feedback and inline naming.

**Key Innovation:** Dual-purpose rename handler that routes based on temp node detection, eliminating the need for separate creation and rename code paths.

**Result:** Intuitive, fast, and consistent with modern UI patterns (VS Code, macOS Finder, etc.).
