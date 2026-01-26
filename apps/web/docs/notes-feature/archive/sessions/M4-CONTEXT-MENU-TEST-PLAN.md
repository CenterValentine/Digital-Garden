# M4 Context Menu - Complete Test Plan

**Milestone:** M4 - File Tree Context Menu Actions
**Status:** Ready for Testing
**Last Updated:** January 18, 2026

## Overview

This test plan verifies all context menu functionality including:
- ✅ Sub-menu with all 5 content types
- ✅ Create actions wired to API
- ✅ Rename action wired to API
- ✅ Delete action wired to API
- ✅ Keyboard shortcuts (A, Shift+A, R, D)

---

## Pre-Test Setup

1. **Start development server:**
   ```bash
   cd apps/web
   pnpm dev
   ```

2. **Navigate to notes page:**
   ```
   http://localhost:3000/notes
   ```

3. **Verify file tree loaded:**
   - Check that the left sidebar shows folders and files
   - Check that the seed data is present (Welcome note, etc.)

---

## Test 1: Sub-Menu Appearance

**Objective:** Verify sub-menu displays correctly with all content types

### Steps:

1. **Right-click on empty space in file tree**
   - Expected: Context menu appears

2. **Verify "Create" item:**
   - ✅ "Create" shows with chevron icon (›) on the right
   - ✅ NO keyboard shortcut displayed next to "Create" (only chevron)

3. **Hover over "Create":**
   - ✅ Sub-menu appears 4px to the right of parent menu
   - ✅ Sub-menu contains 5 items in order:
     1. Note (Markdown) - with "A" shortcut
     2. Folder - with "⇧A" shortcut
     3. File (Upload) - no shortcut
     4. Code Snippet - no shortcut
     5. HTML Document - no shortcut

4. **Verify hover behavior:**
   - ✅ Moving mouse from menu to sub-menu keeps sub-menu open
   - ✅ 4px gap between menu and sub-menu doesn't cause flickering
   - ✅ Moving mouse away closes sub-menu after brief delay (~200ms)

**Pass Criteria:** All visual elements correct, no positioning issues

---

## Test 2: Create - Note (Markdown)

**Objective:** Verify creating a new note via context menu

### Steps:

1. **Right-click on empty space in tree**
2. **Hover over "Create"**
3. **Click "Note (Markdown)"**

### Expected Result:

- ✅ Context menu closes
- ✅ API call made: `POST /api/notes/content` with:
  ```json
  {
    "title": "New Note",
    "parentId": null,
    "tiptapJson": {
      "type": "doc",
      "content": [{ "type": "paragraph" }]
    }
  }
  ```
- ✅ Tree refreshes automatically
- ✅ New note appears in tree with title "New Note"
- ✅ New note is at root level (if clicked on empty space)

### Error Cases:

- ❌ If API fails, show alert with error message
- ❌ Tree should not refresh on error

**Pass Criteria:** Note created successfully and appears in tree

---

## Test 3: Create - Folder

**Objective:** Verify creating a new folder

### Steps:

1. **Right-click on existing folder**
2. **Hover over "Create"**
3. **Click "Folder"**

### Expected Result:

- ✅ API call made: `POST /api/notes/content` with:
  ```json
  {
    "title": "New Folder",
    "parentId": "<parent-folder-id>",
    "isFolder": true
  }
  ```
- ✅ Tree refreshes
- ✅ New folder appears inside clicked folder
- ✅ Folder icon displays correctly

**Pass Criteria:** Folder created as child of clicked folder

---

## Test 4: Create - Code Snippet

**Objective:** Verify creating a code snippet

### Steps:

1. **Right-click on empty space**
2. **Hover over "Create"**
3. **Click "Code Snippet"**

### Expected Result:

- ✅ API call made: `POST /api/notes/content` with:
  ```json
  {
    "title": "New Code Snippet",
    "parentId": null,
    "code": "// Your code here",
    "language": "javascript"
  }
  ```
- ✅ Tree refreshes
- ✅ New code snippet appears with code icon

**Pass Criteria:** Code snippet created successfully

---

## Test 5: Create - HTML Document

**Objective:** Verify creating an HTML document

### Steps:

1. **Right-click on empty space**
2. **Hover over "Create"**
3. **Click "HTML Document"**

### Expected Result:

- ✅ API call made: `POST /api/notes/content` with:
  ```json
  {
    "title": "New HTML Document",
    "parentId": null,
    "html": "<h1>Hello World</h1>"
  }
  ```
- ✅ Tree refreshes
- ✅ New HTML document appears

**Pass Criteria:** HTML document created successfully

---

## Test 6: Create - File Upload (Placeholder)

**Objective:** Verify file upload shows informative message

### Steps:

1. **Right-click on empty space**
2. **Hover over "Create"**
3. **Click "File (Upload)"**

### Expected Result:

- ✅ Alert appears with message:
  ```
  File upload requires selecting a file.

  This will be implemented with a file picker dialog in a future update.

  For now, use the API directly:
  1. POST /api/notes/content/upload/initiate
  2. Upload to presigned URL
  3. POST /api/notes/content/upload/finalize
  ```
- ✅ Tree does NOT refresh
- ✅ No API call made

**Pass Criteria:** Informative placeholder message shown

---

## Test 7: Rename Action

**Objective:** Verify renaming a file or folder

### Steps:

1. **Right-click on any file or folder**
2. **Click "Rename" in context menu**

### Expected Result:

- ✅ File/folder enters inline edit mode
- ✅ Current name is selected/highlighted
- ✅ User can type new name

3. **Type new name: "Renamed Item"**
4. **Press Enter**

### Expected Result:

- ✅ API call made: `PATCH /api/notes/content/<id>` with:
  ```json
  {
    "title": "Renamed Item"
  }
  ```
- ✅ Tree refreshes
- ✅ Item shows new name "Renamed Item"

### Edge Cases:

- ❌ Empty name (just whitespace) → No API call, cancel rename
- ❌ Press Escape → Cancel rename, no API call
- ❌ Click outside → Cancel rename, no API call

**Pass Criteria:** Item renamed successfully via API

---

## Test 8: Delete Action

**Objective:** Verify soft-deleting a file or folder

### Steps:

1. **Right-click on any file or folder (e.g., "Welcome Note")**
2. **Click "Delete" in context menu**

### Expected Result:

- ✅ Confirmation dialog appears:
  ```
  Delete "Welcome Note"?

  This will move it to trash.
  ```

3. **Click "OK" to confirm**

### Expected Result:

- ✅ API call made: `DELETE /api/notes/content/<id>`
- ✅ Tree refreshes
- ✅ Item removed from tree (soft-deleted, `deletedAt` set in DB)

### Edge Cases:

- ❌ Click "Cancel" → No API call, item remains
- ❌ If API fails, show alert with error message

**Pass Criteria:** Item soft-deleted and removed from tree

---

## Test 9: Keyboard Shortcut - "A" (Open Create Menu)

**Objective:** Verify "A" key opens context menu with Create sub-menu

### Steps:

1. **Click on file tree to focus it**
2. **Select a folder by clicking on it**
3. **Press "A" key**

### Expected Result:

- ✅ Context menu appears at selected folder position
- ✅ "Create" item is visible with chevron
- ✅ Menu appears as if user right-clicked on the folder

4. **Hover over "Create"**

### Expected Result:

- ✅ Sub-menu appears with all 5 content types
- ✅ Can click any content type to create

5. **Press Escape**

### Expected Result:

- ✅ Context menu closes

**Pass Criteria:** "A" key opens context menu at selected node

---

## Test 10: Keyboard Shortcut - "Shift+A" (Create Folder Directly)

**Objective:** Verify "Shift+A" creates folder without opening menu

### Steps:

1. **Click on file tree to focus it**
2. **Select a folder by clicking on it**
3. **Press "Shift+A"**

### Expected Result:

- ✅ API call made immediately: `POST /api/notes/content` with:
  ```json
  {
    "title": "New Folder",
    "parentId": "<selected-folder-id>",
    "isFolder": true
  }
  ```
- ✅ Tree refreshes
- ✅ New folder appears inside selected folder
- ✅ NO context menu appears (direct action)

**Pass Criteria:** Folder created directly without menu

---

## Test 11: Keyboard Shortcut - "R" (Rename)

**Objective:** Verify "R" key starts inline rename

### Steps:

1. **Click on file tree to focus it**
2. **Select any file or folder**
3. **Press "R" key**

### Expected Result:

- ✅ Selected item enters inline edit mode
- ✅ Name is highlighted for editing
- ✅ Same behavior as clicking "Rename" in context menu

**Pass Criteria:** Inline rename activated via "R" key

---

## Test 12: Keyboard Shortcut - "D" (Delete)

**Objective:** Verify "D" key triggers delete confirmation

### Steps:

1. **Click on file tree to focus it**
2. **Select any file or folder**
3. **Press "D" key**

### Expected Result:

- ✅ Confirmation dialog appears (same as context menu delete)
- ✅ Shows item title in confirmation message
- ✅ Can confirm or cancel

**Pass Criteria:** Delete confirmation triggered via "D" key

---

## Test 13: Keyboard Shortcuts - Scoped to Tree Focus

**Objective:** Verify shortcuts only work when tree is focused

### Steps:

1. **Click outside the file tree (e.g., in editor panel)**
2. **Press "A"**

### Expected Result:

- ✅ Nothing happens (tree not focused)
- ✅ No context menu appears
- ✅ Character "a" may be typed in editor (normal behavior)

3. **Press "D"**

### Expected Result:

- ✅ Nothing happens
- ✅ No delete dialog appears

4. **Click on file tree to focus it**
5. **Press "A"**

### Expected Result:

- ✅ Context menu appears (tree is focused)

**Pass Criteria:** Shortcuts only active when tree has focus

---

## Test 14: Browser Shortcuts Not Conflicting

**Objective:** Verify our shortcuts don't break browser functionality

### Steps:

1. **With tree NOT focused, press:**
   - Cmd+N → New browser window opens ✅
   - Cmd+R → Page reloads ✅
   - Cmd+D → Add bookmark (Vivaldi/Chrome) ✅

2. **With tree focused, press:**
   - Cmd+R → Page still reloads ✅ (not intercepted)
   - Cmd+N → New browser window still opens ✅

**Pass Criteria:** Browser shortcuts work normally

---

## Test 15: Multi-Selection with Create

**Objective:** Verify creating content when multiple items are selected

### Steps:

1. **Cmd+Click (Mac) or Ctrl+Click (Windows) to select multiple files**
2. **Right-click on one of the selected items**
3. **Verify "Create" is NOT shown** (only available for single selection or empty space)

**Pass Criteria:** Create action disabled for multi-selection

---

## Test 16: Nested Folder Creation

**Objective:** Verify creating deeply nested folders

### Steps:

1. **Right-click on a folder**
2. **Create → Folder** (creates "New Folder" inside)
3. **Right-click on "New Folder"**
4. **Create → Folder** (creates another "New Folder" inside the first)

### Expected Result:

- ✅ Both folders created at correct hierarchy levels
- ✅ Tree shows proper nesting with indentation
- ✅ parentId correctly set in database

**Pass Criteria:** Nested folders created with correct hierarchy

---

## Test 17: Error Handling - Network Failure

**Objective:** Verify graceful error handling when API fails

### Steps:

1. **Disconnect from internet (or stop dev server)**
2. **Right-click → Create → Note**

### Expected Result:

- ✅ Alert appears: "Failed to create note. Please try again."
- ✅ Error logged to console
- ✅ Tree does NOT refresh (stays in current state)
- ✅ User can retry after reconnecting

**Pass Criteria:** Graceful error message, no UI corruption

---

## Test 18: Performance - Large Tree

**Objective:** Verify context menu works with 100+ items

### Steps:

1. **Create 50+ folders and notes using the context menu**
2. **Scroll through tree**
3. **Right-click on various items**
4. **Verify sub-menu still appears smoothly**

### Expected Result:

- ✅ No lag when opening context menu
- ✅ Sub-menu appears within 50ms
- ✅ Tree refresh after create/delete completes quickly (<500ms)

**Pass Criteria:** No performance degradation with large tree

---

## Test 19: Edge Case - Renaming to Same Name

**Objective:** Verify renaming to identical name works

### Steps:

1. **Right-click on "Welcome Note"**
2. **Click "Rename"**
3. **Type "Welcome Note" (same name)**
4. **Press Enter**

### Expected Result:

- ✅ API call still made (PATCH with same title)
- ✅ No error shown
- ✅ Tree refreshes (no visible change)

**Pass Criteria:** Rename succeeds even if name unchanged

---

## Test 20: Edge Case - Special Characters in Name

**Objective:** Verify names with special characters work

### Steps:

1. **Create note via context menu**
2. **Rename to: "Test / Note (v2.0) - Final [DRAFT]"**
3. **Press Enter**

### Expected Result:

- ✅ Name saved with special characters
- ✅ Tree displays correctly
- ✅ URL-safe slug generated automatically by backend

**Pass Criteria:** Special characters handled correctly

---

## Summary Checklist

### Context Menu Display
- [ ] Sub-menu appears 4px to right
- [ ] All 5 content types shown
- [ ] Keyboard shortcuts displayed (A, ⇧A)
- [ ] Chevron icon on "Create" item
- [ ] 200ms hover debounce working

### Create Actions
- [ ] Note (Markdown) creates successfully
- [ ] Folder creates successfully
- [ ] Code Snippet creates successfully
- [ ] HTML Document creates successfully
- [ ] File Upload shows placeholder message

### Edit Actions
- [ ] Rename updates via API
- [ ] Delete soft-deletes via API
- [ ] Confirmation dialogs appear
- [ ] Tree refreshes after actions

### Keyboard Shortcuts
- [ ] "A" opens context menu
- [ ] "Shift+A" creates folder directly
- [ ] "R" starts inline rename
- [ ] "D" triggers delete confirmation
- [ ] Shortcuts scoped to tree focus only

### Error Handling
- [ ] Network errors show alerts
- [ ] Empty names rejected
- [ ] API errors don't corrupt UI

### Performance
- [ ] No lag with 100+ items
- [ ] Sub-menu appears smoothly
- [ ] Tree refresh completes quickly

---

## Known Limitations

**File Upload:**
- Requires two-phase upload flow (initiate → upload → finalize)
- Currently shows placeholder message
- Will be implemented with file picker dialog in future update

**Auto-Selection After Create:**
- Newly created items not automatically selected/opened
- Tree refreshes but user must manually click new item
- Future enhancement: auto-select and open for editing

**Inline Rename Polish:**
- react-arborist handles inline editing
- No visual polish (could add better styling)
- Escape key cancels edit (works)

---

## Next Steps After Testing

Once all tests pass:

1. **Update IMPLEMENTATION-STATUS.md:**
   - Mark "M4: File Tree - Context Menu Actions" as complete
   - Update statistics (lines of code, files created)

2. **Update M4-FILE-TREE-IMPLEMENTATION.md:**
   - Add "Context Menu" section
   - Document all 5 create actions
   - Document keyboard shortcuts

3. **Create M5 planning:**
   - Begin planning for Search & Backlinks
   - Review M6 documentation
   - Identify next milestone tasks

---

## Test Results

**Tester:**
**Date:**
**Environment:** macOS/Windows/Linux, Browser (Chrome/Firefox/Safari)

| Test # | Name | Pass | Notes |
|--------|------|------|-------|
| 1 | Sub-Menu Appearance | ⬜ | |
| 2 | Create Note | ⬜ | |
| 3 | Create Folder | ⬜ | |
| 4 | Create Code | ⬜ | |
| 5 | Create HTML | ⬜ | |
| 6 | File Upload Placeholder | ⬜ | |
| 7 | Rename | ⬜ | |
| 8 | Delete | ⬜ | |
| 9 | Keyboard: A | ⬜ | |
| 10 | Keyboard: Shift+A | ⬜ | |
| 11 | Keyboard: R | ⬜ | |
| 12 | Keyboard: D | ⬜ | |
| 13 | Shortcuts Scoped | ⬜ | |
| 14 | Browser Shortcuts | ⬜ | |
| 15 | Multi-Selection | ⬜ | |
| 16 | Nested Folders | ⬜ | |
| 17 | Error Handling | ⬜ | |
| 18 | Performance | ⬜ | |
| 19 | Same Name Rename | ⬜ | |
| 20 | Special Characters | ⬜ | |

**Overall Status:** ⬜ Pass / ⬜ Fail

**Notes:**
