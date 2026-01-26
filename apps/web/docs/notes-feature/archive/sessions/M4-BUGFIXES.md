# M4 Bug Fixes - January 17, 2026

## Issues Found During Testing

1. **Context menu not appearing** ❌
2. **Keyboard shortcuts triggering browser defaults** ❌
3. **Tree state not persisting** ❌

---

## Fixes Applied

### 1. Context Menu Not Rendering

**Problem:** ContextMenu component was created but never added to the app.

**Fix:**
- Added `ContextMenu` component to `ResizablePanels.tsx`
- Wrapped return in Fragment (`<>...</>`)
- Registered `fileTreeActionProvider` for "file-tree" panel

**File:** `components/notes/ResizablePanels.tsx`

```tsx
import { ContextMenu } from "./context-menu/ContextMenu";
import { fileTreeActionProvider } from "./context-menu/file-tree-actions";

// ... in return:
return (
  <>
    <Allotment>...</Allotment>

    {/* Global context menu */}
    <ContextMenu
      actionProviders={{
        "file-tree": fileTreeActionProvider,
      }}
    />
  </>
);
```

---

### 2. Keyboard Shortcuts Fixed

**Problem:** Event listeners attached to window, allowing browser defaults to fire first. Also, shortcuts conflicted with common browser commands (Cmd+N, Cmd+R, Backspace).

**Fix:**
- Changed from window listener to tree element listener
- Added `e.stopPropagation()` to prevent bubbling
- **Changed shortcuts to avoid browser conflicts:**
  - ~~Cmd+N~~ → **A** (new note, Obsidian-style)
  - ~~Cmd+Shift+N~~ → **Shift+A** (new folder)
  - ~~Backspace~~ → **Delete key only** (Backspace navigates back in browsers)
  - **F2** → Kept (standard for rename in VS Code, Windows Explorer)
  - ~~Cmd+R~~ → Removed (conflicts with browser reload)

**File:** `components/notes/FileTree.tsx`

```tsx
// Changed from window to tree element:
const treeElement = treeRef.current?.root?.node;
treeElement.addEventListener("keydown", handleKeyDown);

// New safe shortcuts:
if (e.key === "F2") {
  e.preventDefault();
  e.stopPropagation();
  // Rename selected node
}

if (e.key === "Delete") {  // Mac Delete key, not Backspace
  e.preventDefault();
  e.stopPropagation();
  // Delete selected node
}

if (e.key === "a" && isPlainKey) {  // No modifiers
  e.preventDefault();
  e.stopPropagation();
  // Create new note (Obsidian-style)
}

if (e.key === "A" && e.shiftKey) {  // Shift+A
  e.preventDefault();
  e.stopPropagation();
  // Create new folder
}
```

**New Keyboard Shortcuts (Browser-Safe):**
- **F2** - Rename selected item
- **Delete** - Delete selected item (Mac Delete key, not Backspace)
- **A** - Create new note (when tree focused)
- **Shift+A** - Create new folder (when tree focused)

---

### 3. Tree State Persistence Fixed

**Problem:** `handleToggle` was checking `node.isOpen` which doesn't reflect persisted state correctly.

**Fix:**
- Changed to check `expandedIds.has(id)` from the store
- This ensures we're toggling based on the persisted state, not the current render state

**File:** `components/notes/FileTree.tsx`

```tsx
// Before (BAD):
const handleToggle = (id: string) => {
  const tree = treeRef.current;
  if (!tree) return;
  const node = tree.get(id);
  if (node) {
    setExpanded(id, !node.isOpen); // Wrong source of truth
  }
};

// After (GOOD):
const handleToggle = (id: string) => {
  // Check the CURRENT state in expandedIds, not the node state
  const isCurrentlyExpanded = expandedIds.has(id);
  setExpanded(id, !isCurrentlyExpanded); // Correct source of truth
};
```

---

## Test Results After Fixes

**Expected:**

1. ✅ **Context Menu:** Right-click on folder/file/empty space shows menu
2. ✅ **Keyboard Shortcuts:** F2, Delete, Cmd+N work without triggering browser
3. ✅ **Tree Persistence:** Expanded folders stay expanded after reload

**Test Again:**
- Run through `M4-QUICK-TEST.md` again
- Verify all 5 tests pass

---

## Files Modified

1. `components/notes/ResizablePanels.tsx` - Added ContextMenu component
2. `components/notes/FileTree.tsx` - Fixed keyboard listeners + tree persistence + callback forwarding
3. `components/notes/content/LeftSidebarContent.tsx` - Wired handlers + compact menu styling
4. `components/notes/context-menu/ContextMenu.tsx` - Compact styling improvements
5. `components/notes/FileNode.tsx` - Added callback props + passed to context menu

**Total Changes:** 5 files, ~70 lines modified

---

### 5. Keyboard Shortcuts Not Firing

**Problem:** Keyboard shortcuts (A, R, D, Shift+A) did nothing when pressed, even though tree was clicked.

**Root Cause:** Tree container div wasn't focusable, so keyboard events weren't being captured.

**Fix:**
- Added `tabIndex={0}` to tree container div to make it focusable
- Added `containerRef` to reference the wrapper div
- Changed event listener from `treeRef.current?.root?.node` (react-arborist internal) to `containerRef.current` (our wrapper)
- Added `focus:outline-none` for clean styling

**File:** `components/notes/FileTree.tsx`

```tsx
// Added ref and tabIndex:
const containerRef = useRef<HTMLDivElement>(null);

return (
  <div
    ref={containerRef}
    className="h-full w-full focus:outline-none"
    data-tree-id="file-tree"
    tabIndex={0}  // Makes div focusable for keyboard events
  >
    <Tree>...</Tree>
  </div>
);

// Changed event listener target:
const container = containerRef.current;
container.addEventListener("keydown", handleKeyDown);
```

**Result:** Keyboard shortcuts now work when tree is clicked/focused.

---

### 4. Context Menu Items Enabled

**Problem:** All context menu items appeared disabled (no hover highlight, cursor-not-allowed).

**Root Cause:** Callbacks weren't being passed through the react-arborist component chain to FileNode, then to the context menu.

**Fix (Multi-step):**

**Step 1:** Added placeholder handlers in LeftSidebarContent.tsx
```tsx
const handleRename = async (id: string, newName: string) => {
  console.log("Rename:", id, newName);
  // TODO: Wire to API
};

const handleDelete = async (id: string) => {
  console.log("Delete:", id);
  if (confirm("Delete this item?")) {
    alert("Delete functionality coming soon!");
  }
};

const handleCreate = async (parentId: string | null, type: "folder" | "note") => {
  console.log("Create:", type, "in parent:", parentId);
  alert(`Create ${type} functionality coming soon!`);
};

// Wired to FileTree:
<FileTree
  data={treeData}
  onMove={handleMove}
  onSelect={handleSelect}
  onRename={handleRename}
  onCreate={handleCreate}
  onDelete={handleDelete}
  height={800}
/>
```

**Step 2:** Created wrapper component in FileTree.tsx to forward callbacks
```tsx
// FileTree.tsx - Wrapper component to pass callbacks through react-arborist
const NodeWithCallbacks = (props: any) => {
  return <FileNode {...props} onRename={onRename} onCreate={onCreate} onDelete={onDelete} />;
};

// Use wrapper instead of FileNode directly:
<Tree>
  {NodeWithCallbacks}
</Tree>
```

**Step 3:** Updated FileNode.tsx to accept and pass callbacks to context menu
```tsx
// FileNode.tsx - Added callback props
interface FileNodeProps extends NodeRendererProps<TreeNode> {
  onRename?: (id: string, name: string) => Promise<void>;
  onCreate?: (parentId: string | null, type: "folder" | "note") => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

// Pass callbacks to context menu when opening:
const handleContextMenu = (e: React.MouseEvent) => {
  openMenu("file-tree", { x: e.clientX, y: e.clientY }, {
    selectedIds,
    clickedId: data.id,
    clickedNode: { ... },
    // NEW: Pass callbacks to context menu provider
    onRename: onRename ? (id: string) => onRename(id, "") : undefined,
    onDelete: onDelete ? async (ids: string[]) => {
      for (const id of ids) await onDelete(id);
    } : undefined,
    onCreateNote: onCreate ? async (parentId: string | null) => onCreate(parentId, "note") : undefined,
    onCreateFolder: onCreate ? async (parentId: string | null) => onCreate(parentId, "folder") : undefined,
  });
};
```

**Context Menu Styling Improvements:**
- Reduced min-width from 200px to 180px
- Made section headers more compact (py-0.5, text-[10px])
- Made section headers softer (text-gray-400/500)
- Made menu text darker (text-gray-900/100)
- Reduced padding throughout (px-2.5, py-1)
- Smaller keyboard shortcuts (text-[11px])

---

---

## Test Results After All Fixes

**✅ VERIFIED - January 17, 2026:**

1. ✅ **Context Menu:** Right-click shows menu with clickable items
2. ✅ **Menu Styling:** Compact, soft headers, dark text
3. ✅ **Menu Items Respond:** Console logs, alerts, and confirms work
4. ✅ **Multi-Selection:** Cmd+Click highlights multiple items
5. ✅ **Keyboard Shortcuts:** Prevented from triggering browser defaults
6. ✅ **Tree Persistence:** Fixed toggle logic

**✅ FULLY VERIFIED - January 17, 2026:**

7. ✅ **Keyboard Shortcuts Working:** A, R, D, Shift+A all trigger correctly when tree is focused
8. ✅ **Tree State Persistence:** Verified working (folders stay expanded after reload)
9. ✅ **Focus System:** Added tabIndex={0} to tree container for proper keyboard focus

---

## Remaining Notes

The context menu infrastructure is **fully functional** and items are **clickable**. The action callbacks are **placeholder implementations** showing alerts/confirms/console.logs:

- `handleRename` - Logs to console (TODO: Wire to PATCH /api/notes/content/[id])
- `handleCreate` - Shows alert (TODO: Wire to existing create flow)
- `handleDelete` - Shows confirm dialog (TODO: Wire to DELETE /api/notes/content/[id])

This is intentional - we built the infrastructure first and verified it works. Implementing actual API calls is straightforward once we're ready.

**Callback Flow (Working):**
```
LeftSidebarContent (handlers)
  → FileTree (props)
    → NodeWithCallbacks (wrapper with closure)
      → FileNode (receives callbacks)
        → openMenu() (passes to context)
          → fileTreeActionProvider (checks callbacks, enables items)
            → ContextMenu (renders enabled buttons)
```

---

## Known Issues (Future Work)

### Auto-Save Race Conditions

**Problem:** Editor has a 2-second auto-save delay. If user navigates away (clicks another note, folder, or backlink) before the save completes, changes may not persist.

**Impact:**
- Wiki-links typed but not saved won't appear in backlinks panel
- Folder navigation before save completes loses recent edits
- Fast clicking between notes can cause data loss

**Current Workaround:** Wait ~2 seconds after typing before navigating away.

**Potential Solutions (Not Implemented Yet):**

1. **Immediate Save on Navigation**
   - Hook into navigation events (tree click, wiki-link click, backlink click)
   - Trigger immediate save before allowing navigation
   - Show spinner during save
   ```tsx
   const handleNavigation = async (newId: string) => {
     if (hasUnsavedChanges) {
       await handleSave(currentContent); // Wait for save
     }
     setSelectedContentId(newId);
   };
   ```

2. **Visual Indicators**
   - Show "Saving..." indicator prominently
   - Disable navigation buttons during save
   - Show "Unsaved changes" warning before navigation

3. **Reduce Auto-Save Delay**
   - Current: 2000ms (2 seconds)
   - Could reduce to 500ms for better responsiveness
   - Trade-off: More API calls, higher server load

4. **Block Navigation During Save**
   - Prevent clicks on tree, backlinks, wiki-links while saving
   - Show modal overlay with "Saving, please wait..."
   - Most intrusive but safest option

**Related Files:**
- `components/notes/editor/MarkdownEditor.tsx` - Auto-save logic (line ~100)
- `components/notes/content/MainPanelContent.tsx` - handleSave callback
- `stores/editor-stats-store.ts` - isSaving, hasUnsavedChanges state

**Priority:** Medium - Affects UX but has simple workaround (wait before clicking)

**Milestone:** M7 or later (UX polish phase)
