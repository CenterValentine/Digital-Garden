# M4 Keyboard Shortcuts - Input Conflict Fix

**Issue:** Keyboard shortcuts interfering with inline editing
**Fixed:** January 18, 2026
**Status:** ✅ Complete

---

## Problem

When renaming a file in the tree, typing certain letters would trigger keyboard shortcuts instead of being entered into the input field.

**Example:**
- User starts renaming "file" to "file.md"
- Types "f", "i", "l", "e", ".", "m"
- When pressing "d", the **delete shortcut** is triggered instead of typing "d"
- Result: Delete confirmation dialog appears instead of completing the rename

**Root Cause:**
Keyboard shortcuts were listening on the entire tree container, including when input fields were focused.

---

## Solution

Added **two layers of protection** to prevent shortcuts from firing during input:

### Layer 1: Check Event Target
```typescript
const target = e.target as HTMLElement;
const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

if (isTyping) {
  // User is editing - let the input handle the keystroke
  return;
}
```

This checks if the keystroke originated from an input element.

### Layer 2: Check Tree Edit State
```typescript
const tree = treeRef.current;
const isAnyNodeEditing = tree?.visibleNodes?.some((node: any) => node.isEditing);

if (isAnyNodeEditing) {
  // A node is being renamed - don't intercept keystrokes
  return;
}
```

This checks if any node in the tree is currently in edit mode (react-arborist state).

---

## Protected Contexts

Keyboard shortcuts are now **disabled** in these scenarios:

1. **Inline Rename Mode**
   - When user clicks "Rename" or presses "R"
   - Input field has focus
   - All keystrokes go to the input

2. **Search Input** (future)
   - When search panel is open
   - Search input has focus
   - All keystrokes go to search

3. **Any Input Field**
   - `<input>` elements
   - `<textarea>` elements
   - `contentEditable` elements

4. **Any Node Being Edited**
   - Even if focus is temporarily lost
   - Checked via react-arborist's `isEditing` state

---

## Affected Shortcuts

These shortcuts are now properly scoped:

| Shortcut | Action | Now Works During Edit? |
|----------|--------|------------------------|
| **A** | Open Create menu | ❌ Disabled (types "a") |
| **Shift+A** | Create folder | ❌ Disabled (types "A") |
| **R** | Rename | ❌ Disabled (types "r") |
| **D** | Delete | ❌ Disabled (types "d") |
| **Enter** | (Node-specific) | ✅ Submits rename |
| **Escape** | (Node-specific) | ✅ Cancels rename |

**Note:** Enter and Escape are handled by the input field itself, not the keyboard shortcut handler.

---

## Testing

### Before Fix
```
1. Right-click file → Rename
2. Type "test.md"
3. When typing "d", delete dialog appears ❌
4. Rename is interrupted
```

### After Fix
```
1. Right-click file → Rename
2. Type "test.md"
3. All letters typed correctly ✅
4. Press Enter to save
5. File renamed successfully ✅
```

---

## Edge Cases Handled

### Edge Case 1: Multiple Nodes
**Scenario:** Two users editing different nodes simultaneously (future multi-user support)

**Behavior:** Shortcuts disabled if **any** node is being edited

**Works?** ✅ Yes

---

### Edge Case 2: Focus Lost
**Scenario:** User clicks outside input while editing, then presses "d"

**Behavior:**
- Layer 1 fails (target is no longer INPUT)
- Layer 2 catches it (node.isEditing is still true)
- Shortcut doesn't fire

**Works?** ✅ Yes

---

### Edge Case 3: Contenteditable Elements
**Scenario:** Future rich text editor inline in tree (unlikely but possible)

**Behavior:** `isContentEditable` check catches this

**Works?** ✅ Yes

---

## Code Location

**File:** `apps/web/components/notes/FileTree.tsx`

**Lines:** 133-150

**Function:** `handleKeyDown` inside `useEffect`

---

## Future Enhancements

### 1. Search Panel Integration
When search panel is open, also disable shortcuts:

```typescript
const isSearchOpen = useSearchStore(state => state.isSearchOpen);

if (isSearchOpen) {
  // Search is active - don't intercept
  return;
}
```

### 2. Modal/Dialog Detection
If any modal or dialog is open, disable tree shortcuts:

```typescript
const hasOpenDialog = document.querySelector('[role="dialog"]');

if (hasOpenDialog) {
  // Dialog is open - don't intercept
  return;
}
```

### 3. Command Palette
When command palette opens (Cmd+K), disable tree shortcuts.

---

## Related Issues

This fix also resolves potential future issues with:
- Search input (M6)
- Command palette (M9)
- Any inline editing in the tree
- Any modal dialogs with inputs

---

## Testing Checklist

- [x] Can type "d" during rename without delete dialog
- [x] Can type "a" during rename without create menu
- [x] Can type "r" during rename without triggering another rename
- [x] Enter still submits rename
- [x] Escape still cancels rename
- [x] Shortcuts work normally when NOT editing
- [x] Shortcuts work after completing rename (blur)

---

## Conclusion

Keyboard shortcuts now properly respect input contexts and will not interfere with typing during inline edits or in search fields.

**Result:** Users can safely rename files with any characters, including those that would normally trigger shortcuts.
