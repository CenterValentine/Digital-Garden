# M4 Context Menu - "New" Item Behavior

**Updated:** January 18, 2026
**Status:** Implemented

---

## Overview

The context menu now shows **"New"** (renamed from "Create") for all single-selection scenarios, with intelligent parent resolution based on what was clicked.

---

## Behavior Rules

### 1. Right-click on Folder
**Creates items INSIDE the folder (as children)**

```
📁 Projects (right-click here)
  └─ (New items appear here)
```

**Example:**
- Right-click "Projects" folder
- New → Note (Markdown)
- Result: New note created with `parentId = "projects-id"`

---

### 2. Right-click on File
**Creates items as SIBLINGS (same parent as the file)**

```
📁 Parent Folder
  ├─ existing-note.md (right-click here)
  └─ new-note.md (appears here, as sibling)
```

**Example:**
- Right-click "existing-note.md" (which is inside "Parent Folder")
- New → Note (Markdown)
- Result: New note created with `parentId = "parent-folder-id"`
- New note appears **next to** "existing-note.md", not inside it

**Why?** Files cannot have children (they're leaf nodes), so creating "inside" a file doesn't make sense. Creating siblings is the most intuitive behavior.

---

### 3. Right-click on Empty Space
**Creates items at ROOT level**

```
📁 Root
  ├─ existing-folder
  └─ new-note.md (appears here, at root)
```

**Example:**
- Right-click on empty area in file tree
- New → Note (Markdown)
- Result: New note created with `parentId = null` (root level)

---

## Implementation Logic

**File:** `components/notes/context-menu/file-tree-actions.tsx`

```typescript
// Determine target parent ID based on what was clicked
let targetId: string | null;

if (!clickedId) {
  // Empty space → root level
  targetId = null;
} else if (isFolder) {
  // Folder → create inside it (children)
  targetId = clickedId;
} else {
  // File → create as sibling (same parent)
  targetId = clickedNode?.parentId || null;
}
```

---

## Visual Examples

### Example 1: Deep Nesting

**Tree Structure:**
```
📁 Documents
  📁 Work
    📁 Projects
      📄 proposal.md ← (right-click here)
      📄 budget.xlsx
```

**Action:** Right-click "proposal.md" → New → Note (Markdown)

**Result:**
```
📁 Documents
  📁 Work
    📁 Projects
      📄 proposal.md
      📄 budget.xlsx
      📄 New Note ← (created here, as sibling to proposal.md)
```

**Parent ID:** `parentId = "projects-id"`

---

### Example 2: Root Level File

**Tree Structure:**
```
📄 README.md ← (right-click here)
📁 src
```

**Action:** Right-click "README.md" → New → Folder

**Result:**
```
📄 README.md
📁 src
📁 New Folder ← (created at root, as sibling to README.md)
```

**Parent ID:** `parentId = null` (root)

---

### Example 3: Folder with Children

**Tree Structure:**
```
📁 Notes ← (right-click here)
  📄 todo.md
  📄 ideas.md
```

**Action:** Right-click "Notes" → New → Note (Markdown)

**Result:**
```
📁 Notes
  📄 todo.md
  📄 ideas.md
  📄 New Note ← (created inside Notes folder)
```

**Parent ID:** `parentId = "notes-id"`

---

## Menu Visibility

**"New" menu appears when:**
- ✅ Single item selected (file or folder)
- ✅ Right-clicking on empty space
- ❌ Multi-selection (not shown)

**Why hide for multi-selection?**
Creating content when multiple items are selected is ambiguous:
- Should it create inside all selected folders?
- Should it create as siblings to all selected files?
- What if selection includes both files and folders?

To avoid confusion, "New" is only shown for single selection or empty space.

---

## Updated Documentation References

The following docs have been updated to reflect "Create" → "New" rename:

- ✅ `file-tree-actions.tsx` - Changed section title and label
- ⏳ `M4-SUBMENU-TEST.md` - Update test plan (replace "Create" with "New")
- ⏳ `M4-KEYBOARD-SHORTCUTS.md` - Update shortcut descriptions
- ⏳ `M4-CONTEXT-MENU-TEST-PLAN.md` - Update all 20 tests
- ⏳ `M4-CONTEXT-MENU-COMPLETION.md` - Update summary

---

## Testing Checklist

### Test 1: File Sibling Creation
- [ ] Create a folder with 2-3 files
- [ ] Right-click on a file in the middle
- [ ] New → Note (Markdown)
- [ ] Verify new note appears as sibling (same level)
- [ ] Verify new note has same parent as clicked file

### Test 2: Folder Child Creation
- [ ] Right-click on a folder
- [ ] New → Folder
- [ ] Verify new folder appears **inside** clicked folder
- [ ] Expand clicked folder to see new item

### Test 3: Root Level Creation
- [ ] Right-click on empty space in tree
- [ ] New → Note (Markdown)
- [ ] Verify new note appears at root level
- [ ] Verify `parentId = null` in database

### Test 4: Deep Nesting
- [ ] Create folder structure: A → B → C (3 levels deep)
- [ ] Add a file inside C: `test.md`
- [ ] Right-click on `test.md`
- [ ] New → Note (Markdown)
- [ ] Verify new note appears inside C (sibling to test.md)
- [ ] Verify `parentId = C's ID`

### Test 5: Multi-Selection (Should Hide "New")
- [ ] Cmd+Click to select 2-3 items
- [ ] Right-click on one of the selected items
- [ ] Verify "New" menu does NOT appear
- [ ] Only "Rename", "Delete", etc. appear

---

## Code Changes Summary

**Files Modified:**

1. **`file-tree-actions.tsx`** (3 changes):
   - Added `parentId` to `clickedNode` interface
   - Updated condition: `if (isSingleSelection || !clickedId)` (was: `if (isFolder || !clickedId)`)
   - Added parent resolution logic for files vs folders
   - Renamed "Create" → "New" (section title + label)

2. **`FileNode.tsx`** (1 change):
   - Added `parentId: data.parentId` to `clickedNode` object

**Total:** 2 files, ~15 lines of code

---

## Edge Cases Handled

### Edge Case 1: File at Root Level
**Scenario:** Right-click on file with `parentId = null`

**Behavior:** Creates sibling at root level (`parentId = null`)

**Works?** ✅ Yes

---

### Edge Case 2: Folder with No Children
**Scenario:** Right-click on empty folder

**Behavior:** Creates child inside empty folder

**Works?** ✅ Yes

---

### Edge Case 3: Deeply Nested File
**Scenario:** Right-click on file 5+ levels deep

**Behavior:** Creates sibling at same nesting level

**Works?** ✅ Yes (uses `clickedNode.parentId`)

---

## Benefits of This Approach

✅ **Intuitive:** Users expect files to create siblings, folders to create children

✅ **Consistent:** "New" always appears for single selection

✅ **Flexible:** Works at any nesting level

✅ **Type-Safe:** TypeScript ensures `parentId` is always passed correctly

✅ **No Ambiguity:** Clear rules for every scenario

---

## Future Enhancements

### 1. Keyboard Shortcut Context
Currently pressing "A" opens menu at selected node, but doesn't distinguish between file/folder.

**Potential Improvement:**
- If selected node is a file, "A" could create sibling directly
- If selected node is a folder, "A" could create child directly
- User could still access menu with right-click for full options

### 2. Visual Indicator
Show where new item will be created before user clicks:

**Example (hover preview):**
```
📁 Notes
  📄 todo.md ← (hovering "New" menu)
  ┊ Preview: New note will appear here
  📄 ideas.md
```

### 3. Smart Positioning
New items could be inserted at a smart position:
- After clicked file (instead of at end)
- Alphabetically sorted
- By creation date

---

## Conclusion

The "New" menu now intelligently handles all creation scenarios:
- **Folders** → Create children (inside)
- **Files** → Create siblings (same level)
- **Empty space** → Create at root

This provides intuitive, predictable behavior that matches user expectations.
