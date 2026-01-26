# M4 File Tree - Quick Test Plan

**5-Minute Feature Verification**

---

## 1. Context Menu (Right-Click) - 1 min

**Test:**
1. Right-click on a folder
2. Right-click on a file
3. Right-click on empty space in tree

**Expected:**
- ✅ Menu appears with different options for folder vs file
- ✅ Keyboard shortcuts shown (⌘N, F2, ⌫, etc.)
- ✅ Delete option appears in red
- ✅ Click outside closes menu
- ✅ Press Escape closes menu

Right click on folder, file or empty space doesn't do anything. Nothing appears except the default browser menu. 

---

## 2. Multi-Selection - 1 min

**Test:**
1. Click a file/folder normally (should select it)
2. Cmd+Click on another item (should add to selection)
3. Cmd+Click on a third item
4. Right-click on one of the selected items

**Expected:**
- ✅ Multiple items have primary background color
- ✅ NO checkmarks visible (bg highlight only)
- ✅ Context menu shows "Delete 3 items" (batch label)
- ✅ Normal click clears multi-selection

All expected behaviors work as described except the context menu does not work. See results from test 1.

---

## 3. Keyboard Navigation - 1 min

**Test:**
1. Click on the file tree to focus it
2. Press **F2** (should start rename)
3. Press **Escape** (should cancel rename)
4. Press **A** (should prompt for new note)
5. Press **Shift+A** (should prompt for new folder)
6. Press **Delete** key (should prompt to delete)

**Expected:**
- ✅ All shortcuts work when tree is focused
- ✅ Shortcuts don't fire when editor is focused
- ✅ Browser shortcuts still work (Cmd+N for new window, Cmd+R for reload)

**Updated Shortcuts (Browser-Safe):**
- **F2** - Rename (VS Code standard)
- **A** - New note (Obsidian-style)
- **Shift+A** - New folder (Obsidian-style)
- **Delete** - Delete item (Mac Delete key, not Backspace)

**Previous Issues (FIXED):**
- ~~Cmd+N conflicted with browser "New Window"~~ → Changed to **A**
- ~~Backspace navigated back in browser~~ → Changed to **Delete key only**
- ~~Event listeners on window~~ → Changed to tree element  


---

## 4. Tree State Persistence - 1 min

**Test:**
1. Expand a few folders
2. Reload the page (Cmd+R)
3. Check if folders are still expanded

**Expected:**
- ✅ Expanded folders remain expanded after reload
- ✅ Collapsed folders remain collapsed

**Verify localStorage:**
```javascript
// In browser console:
localStorage.getItem('tree-state-storage')
// Should show: {"state":{"expandedIds":["id1","id2",...]}}
```
The expanded state does not persist after reload. All folders are collapsed again. 'tree-state-storage' in localStorage shows blank array for expandedIds (ie expandedIds:[]).


---

## 5. Optimistic Updates - 1 min

**Test:**
1. Drag a file to a different folder
2. Watch for instant UI update
3. (Optional) Turn off network in DevTools and try drag-and-drop

**Expected:**
- ✅ Tree updates immediately (no loading spinner)
- ✅ If network is off, drag-and-drop rolls back to original position


This works.  Optimisitc updates do not exist for new files/folder creation yet, but drag-and-drop appears instant.
---

## Quick Verification Checklist

- [ ] Context menu works (right-click)
- [ ] Multi-selection works (Cmd+Click)
- [ ] NO checkmarks visible
- [ ] Keyboard shortcuts work (F2, Delete, Cmd+N)
- [ ] Tree state persists on reload
- [ ] Drag-and-drop is instant (optimistic)

**Time:** ~5 minutes total

**Pass Criteria:** All checkboxes above are checked ✅

---

## Bonus: Advanced Tests (Optional)

**Multi-Selection Context Menu:**
1. Select 5 items with Cmd+Click
2. Right-click on one of them
3. Verify menu shows "Delete 5 items", "Copy 5 items", etc.

**Keyboard + Multi-Selection:**
1. Cmd+Click to select 3 items
2. Press Delete key
3. Should delete all 3 items (if delete handler is implemented)

**Tree Persistence Edge Cases:**
1. Expand all folders
2. Reload page
3. All should still be expanded
4. Clear localStorage in DevTools
5. Reload again
6. All should be collapsed (default state)
