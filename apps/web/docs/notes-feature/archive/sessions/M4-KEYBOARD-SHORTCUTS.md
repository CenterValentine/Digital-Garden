# M4 File Tree - Keyboard Shortcuts

**Browser-Safe Shortcuts** (Tested across Chrome, Firefox, Safari, Arc, Vivaldi)

---

## File Tree Shortcuts

All shortcuts only work when the **file tree panel is focused**. We use **single-key shortcuts** (Vim/Obsidian-style) to avoid ALL browser conflicts.

### Navigation

| Shortcut | Action | Native |
|----------|--------|--------|
| **↑ / ↓** | Navigate up/down in tree | ✅ |
| **→** | Expand folder | ✅ |
| **←** | Collapse folder | ✅ |
| **Enter** | Open/close folder | ✅ |
| **Space** | Select node | ✅ |

### Creation

| Shortcut | Action | Style |
|----------|--------|-------|
| **A** | Open Create menu (shows all content types) | Context Menu |
| **Shift+A** | Create new folder (direct shortcut) | Obsidian |

### Editing

| Shortcut | Action | Style |
|----------|--------|-------|
| **R** | Rename selected item | Vim |

**Why not F2?** Vivaldi and some browsers intercept F2 for their own features.

### Deletion

| Shortcut | Action | Style |
|----------|--------|-------|
| **D** | Delete selected item(s) | Vim |

**Why not Delete key?** Navigates back in Vivaldi and other browsers. Backspace also navigates back.

### Multi-Selection

| Shortcut | Action |
|----------|--------|
| **Cmd+Click** (Mac) | Toggle item in multi-selection |
| **Ctrl+Click** (Windows) | Toggle item in multi-selection |
| **Shift+Click** | Range selection (future) |

---

## Context Menu Shortcuts

Right-click on any file or folder (or press **A**) to see the context menu with these shortcuts displayed:

- **A** - Opens Create sub-menu (Note, Folder, File Upload, Code Snippet, HTML)
- **Shift+A** - New Folder (direct shortcut, bypasses menu)
- **R** - Rename
- **D** - Delete

**Future Shortcuts (When Implemented):**
- Copy, Cut, Paste (Cmd+C/X/V work in text fields, need custom implementation for files)
- Duplicate (need to find safe shortcut)

---

## Shortcuts We Avoid (Browser Conflicts)

These shortcuts are **intentionally not used** to prevent conflicts across different browsers:

| Shortcut | Browser Action | Browsers Affected |
|----------|----------------|-------------------|
| **Cmd+N** | New window | All browsers |
| **Cmd+T** | New tab | All browsers |
| **Cmd+W** | Close tab | All browsers |
| **Cmd+R** | Reload page | All browsers |
| **Cmd+D** | Add bookmark | Vivaldi, Chrome, Firefox |
| **F2** | Browser features | Vivaldi intercepts this |
| **Delete** | Navigate back | Vivaldi |
| **Backspace** | Navigate back | Chrome, Firefox, Safari (when not in input) |
| **Function keys** | Browser/OS features | Varies by browser and OS |

---

## Design Principles

1. **Browser-Safe First**: Never conflict with ANY browser shortcuts (tested on Vivaldi, Chrome, Firefox, Safari, Arc)
2. **Single-Key When Focused**: Use simple letter keys (A, R, D) that only work when tree is focused
3. **Vim/Obsidian-Inspired**: Familiar patterns from popular editors (R for rename, D for delete, A for add)
4. **Context-Aware**: Shortcuts only active when tree is focused, preventing accidental triggers
5. **Progressive Disclosure**: Show shortcuts in context menu for discoverability
6. **No Function Keys**: Avoid F1-F12 as browsers/OS may intercept them

---

## Future Enhancements (Optional)

- **G** + **G** - Go to top (Vim-style)
- **Shift+G** - Go to bottom (Vim-style)
- **/** - Quick search/filter
- **Esc** - Clear selection
- **Cmd+A** - Select all (if we implement select-all)
- **Cmd+D** - Duplicate (when clipboard actions are implemented)

---

## Testing Shortcuts

To verify shortcuts work without browser conflicts (test in Vivaldi, Chrome, or Firefox):

1. **Click on file tree** to focus it
2. **Press A** - Should open context menu with Create sub-menu at selected node
3. **Press Shift+A** - Should trigger "Create new folder" alert (direct)
4. **Select a file and press R** - Should start rename (edit mode)
5. **Press Escape** - Should cancel rename
6. **Select a file and press D** - Should trigger delete confirm dialog
7. **Click outside tree, then press D** - Should do nothing (tree not focused)
8. **Verify browser shortcuts still work:**
   - Cmd+N should still open new browser window
   - Cmd+R should still reload page
   - Cmd+D should still add bookmark (Vivaldi/Chrome)
   - Delete/Backspace should navigate back (when tree not focused)

**Expected Result:** Tree shortcuts work ONLY when tree is focused. All browser shortcuts work normally when tree is not focused or when clicked outside.
