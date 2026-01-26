# M4 Sub-Menu Test - Create Actions

**Quick test to verify the new "Create" sub-menu with all content types**

---

## Test: Context Menu Create Sub-Menu

### Setup
1. Navigate to `/notes`
2. Wait for file tree to load

### Test Steps

**1. Right-click on empty space in tree:**
- ✅ Context menu appears
- ✅ "Create" item shows with **chevron (›)** on the right (not a keyboard shortcut)
- ✅ Hovering over "Create" opens sub-menu to the right

**2. Verify sub-menu contains all content types:**
```
Create >
  ├─ Note (Markdown)       A
  ├─ Folder               ⇧A
  ├─ File (Upload)
  ├─ Code Snippet
  └─ HTML Document
```

- ✅ Sub-menu shows 5 content types
- ✅ "Note (Markdown)" shows keyboard shortcut **A**
- ✅ "Folder" shows keyboard shortcut **⇧A**
- ✅ Other types have no keyboard shortcuts (only available via menu)

**3. Click on each sub-menu item:**
- ✅ "Note (Markdown)" → Alert: "Create Note (Markdown) functionality coming soon!"
- ✅ "Folder" → Alert: "Create Folder functionality coming soon!"
- ✅ "File (Upload)" → Alert: "Create File (Upload) functionality coming soon!"
- ✅ "Code Snippet" → Alert: "Create Code Snippet functionality coming soon!"
- ✅ "HTML Document" → Alert: "Create HTML Document functionality coming soon!"
- ✅ Alert shows `Parent ID: root` when right-clicking empty space

**4. Right-click on a folder:**
- ✅ Context menu appears
- ✅ "Create" sub-menu opens
- ✅ Clicking any type shows alert with `Parent ID: <folder-id>`

**5. Test keyboard shortcuts:**
- Click on file tree to focus it
- Press **A** → Context menu appears with Create sub-menu (same as right-click!)
- Hover over "Create" → Sub-menu shows all 5 content types
- Press **Escape** → Menu closes
- Press **Shift+A** → Alert: "Create Folder functionality coming soon!" (direct, bypasses menu)

**6. Test hover behavior:**
- Hover over "Create" → Sub-menu appears after brief delay
- Move mouse to sub-menu → Sub-menu stays open
- Move mouse away → Sub-menu closes after brief delay (~100ms)

**7. Test menu closing:**
- Press **Escape** → Both menu and sub-menu close
- Click outside menu → Both close

---

## Expected Result

✅ **All tests pass**
- Sub-menu appears on hover
- All 5 content types are selectable
- Keyboard shortcuts A and Shift+A work from tree focus
- Hover behavior is smooth (doesn't close too quickly)
- Menu and sub-menu close properly

---

## Design Details

**Sub-Menu Visual:**
- Chevron (›) icon on right of "Create" item (indicates sub-menu)
- Sub-menu positioned 4px to the right of parent item
- Same styling as main menu (compact, glassmorphism)
- z-index: 60 (higher than main menu's 50)

**Content Types:**
1. **Note (Markdown)** - Default, most common (keyboard shortcut: A)
2. **Folder** - Second most common (keyboard shortcut: Shift+A)
3. **File (Upload)** - Binary files (PDFs, images, etc.)
4. **Code Snippet** - Code with syntax highlighting
5. **HTML Document** - Rendered HTML content

---

## Next Steps

Once this test passes:
1. Wire "Create" actions to actual API calls (POST `/api/notes/content`)
2. Implement file type selection UI for each type
3. Add file upload flow for "File (Upload)" type
4. Add syntax language picker for "Code Snippet" type
5. Update keyboard shortcuts documentation
