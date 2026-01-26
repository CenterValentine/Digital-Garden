# M5 Editor Integration - Test Plan

**Version:** 1.0
**Date:** January 14, 2026
**Status:** Testing Phase

## Overview

This document provides a comprehensive test plan to verify the TipTap editor functionality and identify areas for improvement.

---

## Test Environment Setup

1. Navigate to `/content` in your browser
2. Open browser DevTools (F12)
3. Select a note from the file tree (e.g., "newmdfile.md")
4. The editor should load in the main panel

---

## Test Suite

### ✅ Test 1: Basic Text Editing

**Steps:**
1. Click into the editor
2. Type some text: "This is a test paragraph"
3. Wait 2 seconds
4. Check save indicator (should turn green)

**Expected:**
- Text appears as you type
- Save indicator shows "Saving..." (yellow dot)
- After 2 seconds, shows "Saved" (green dot)

**Actual Result:** ________________

---

### ✅ Test 2: Paragraph Formatting

**Steps:**
1. Type a paragraph
2. Press Enter to create a new paragraph
3. Type --- to create a horizontal rule
4. Type another paragraph

**Expected:**
- Each Enter creates a new paragraph
- Blank lines are preserved
- Paragraphs have proper spacing

**Actual Result:** "---" should produce a blank line instead of , it may do this but it is either transparent or hidden from view for some reason

---

### ✅ Test 3: Bold & Italic (Keyboard Shortcuts)

**Steps:**
1. Type "bold text" and select it
2. Press `Ctrl+B` (or `Cmd+B` on Mac)
3. Type " and italic" and select "italic"
4. Press `Ctrl+I` (or `Cmd+I` on Mac)

**Expected:**
- Text becomes **bold** when you press Ctrl+B
- Text becomes *italic* when you press Ctrl+I
- Formatting persists after save

**Actual Result:** ________________

---

### ✅ Test 4: Headings

**Steps:**
1. On a new line, type: `# Heading 1` and press Space
2. On a new line, type: `## Heading 2` and press Space
3. On a new line, type: `### Heading 3` and press Space

**Expected:**
- `# ` converts to a large Heading 1
- `## ` converts to Heading 2
- `### ` converts to Heading 3
- Markdown syntax is auto-converted

**Actual Result:** Heading spaces are not working as expected.  No heading styling is applied after #.
Typing # and pressing space makes the hash disappear and no effect takes place.

**Alternative Method:**
1. Type some text
2. Select it
3. Press `Ctrl+Alt+1` for H1, `Ctrl+Alt+2` for H2, etc.

**Actual Result:** Mac does not support the Ctrl+Alt+Number shortcut for headings.  No heading styling is applied.

---

### ✅ Test 5: Lists - Unordered

**Steps:**
1. On a new line, type: `- First item` and press Enter
2. Type: `Second item` and press Enter
3. Type: `Third item` and press Enter
4. Press Enter again to exit list

**Expected:**
- First line converts to bullet list
- Each Enter creates a new bullet item
- Double Enter exits the list

**Actual Result:** Similarly, Wwhen typing 1., the "1." disappears and no inditation or numbered list occurs.

When typing "- " nothing happens and the "-" remains in its original form.

---

### ✅ Test 6: Lists - Ordered

**Steps:**
1. On a new line, type: `1. First item` and press Enter
2. Type: `Second item` and press Enter
3. Type: `Third item` and press Enter
4. Press Enter again to exit list

**Expected:**
- First line converts to numbered list (1, 2, 3)
- Numbers auto-increment
- Double Enter exits the list

**Actual Result:** Similarly, Wwhen typing 1., the "1." disappears and no inditation or numbered list occurs.

When typing "- " nothing happens and the "-" remains in its original form.

No auto incrementing of numbers occurs after pressing Enter.

---

### ✅ Test 7: Code Blocks (Inline)

**Steps:**
1. Type: This is `inline code` in a sentence
2. Select "inline code"
3. Press `` ` `` (backtick) or `Ctrl+E`

**Expected:**
- Text gets monospace font
- Background highlight appears
- Distinguishable from normal text

**Actual Result:** 
1. inline code example works (poor contrast but works). font is applied with gray background.
2. 
3. A code block forms

---

### ✅ Test 8: Code Blocks (Multi-line)

**Steps:**
1. On a new line, type: ``` and press Enter
2. Type some code:
   ```
   function hello() {
     console.log("Hello World");
   }
   ```
3. Type ``` and press Enter

**Expected:**
- Creates a code block with dark background
- Code is monospace font
- No syntax highlighting yet (plaintext)

**Actual Result:** Expected results with block containing code.
 better contrast on background than inline code but still a bit light.  Code is monospace. NO syntax highlighting. 

---

### ✅ Test 9: Code Blocks with Language

**Steps:**
1. Type: ```javascript and press Enter
2. Type:
   ```javascript
   const x = 42;
   console.log(x);
   ```
3. Type ``` and press Enter

**Expected:**
- Syntax highlighting appears
- Keywords colored differently (const, console)
- Numbers highlighted

**Actual Result:** No syntax highlighting occurs.  Appears as standard ``` code block without any color differentiation.

---

### ✅ Test 10: Blockquotes

**Steps:**
1. On a new line, type: `> This is a quote` and press Enter
2. Type more text on the next line
3. Press Enter twice to exit blockquote

**Expected:**
- Text indents with left border
- Quote styling applied
- Multiple paragraphs supported in quote

**Actual Result:** No indentation or blockquote styling occurs.  The ">" remains in the text. Appears as an 'inline code' highlighted segment when using `. '> '. does not work either.

---

### ✅ Test 11: Hard Breaks

**Steps:**
1. Type a sentence
2. Press `Shift+Enter`
3. Type another sentence

**Expected:**
- New line without creating new paragraph
- Lines closer together than paragraph spacing

**Actual Result:** Doesn't appear to create a hard break.  Pressing Shift+Enter creates the same effect as Enter, creating a new paragraph with spacing.

---

### ✅ Test 12: Undo/Redo

**Steps:**
1. Type some text
2. Press `Ctrl+Z` to undo
3. Press `Ctrl+Shift+Z` (or `Ctrl+Y`) to redo

**Expected:**
- Undo removes the text
- Redo brings it back
- Multiple undo levels work

**Actual Result:** Works as expected with multiple levels of undo/redo functioning correctly.

---

### ✅ Test 13: Auto-Save Behavior

**Steps:**
1. Make a change to the document
2. Immediately click another note in the file tree
3. Return to the first note

**Expected:**
- Changes are saved before switching
- When returning, all changes are present
- No data loss

**Actual Result:** No datalosss occurs.  All changes auto-save and are present upon return.

---

### ✅ Test 14: Long Document Scrolling

**Steps:**
1. Create a very long document (50+ paragraphs)
2. Scroll up and down
3. Edit at different scroll positions

**Expected:**
- Smooth scrolling
- No lag or stuttering
- Cursor position maintained

**Actual Result:** Smooth scrolling with no lag.  Cursor position is maintained correctly when editing at different scroll positions.  When pressing Enter at the bottom of the document, I have to press Enter twice to get a new line to appear.

---

### ✅ Test 15: Empty Document Handling

**Steps:**
1. Delete all content in the document
2. Click away and back
3. Verify empty document loads

**Expected:**
- Empty document shown as blank editor
- No errors in console
- Can start typing immediately

**Actual Result:** Works as expected.  Empty document loads with no errors and is ready for typing.

---

## Known Limitations (Expected)

These features are NOT implemented yet (coming in future milestones):

- ❌ Markdown view toggle
- ❌ Image upload/display
- ❌ File attachments
- ❌ Links (clickable)
- ❌ Tables
- ❌ Task lists (checkboxes)
- ❌ Collaborative editing
- ❌ Comments
- ❌ Version history

---

## Issues Found

### Issue Template

**Test #:** Auto-save
**Issue:** THe auto-save indicator overlaps with the scrollbar on the right side of the editor, making it harder to see and sloppy. This is regardless of document content length, scroll or content factors.
**Expected:** ___
**Actual:** See image
**Severity:** Critical / High / Medium / Low
**Screenshots/Logs:** ___

See individual test results above for details.

---

## Test Results Summary

| Test | Pass | Fail | Notes |
|------|------|------|-------|
| 1. Basic Text Editing | x | ☐ | |
| 2. Paragraph Formatting | x | ☐ | |
| 3. Bold & Italic | x | ☐ | |
| 4. Headings | ☐ | ☐ | |
| 5. Lists - Unordered | ☐ | ☐ | |
| 6. Lists - Ordered | ☐ | ☐ | |
| 7. Code Blocks (Inline) | ☐ | ☐ | |
| 8. Code Blocks (Multi-line) | ☐ | ☐ | |
| 9. Code with Syntax | ☐ | ☐ | |
| 10. Blockquotes | ☐ | ☐ | |
| 11. Hard Breaks | ☐ | ☐ | |
| 12. Undo/Redo | x | ☐ | |
| 13. Auto-Save | x | ☐ | |
| 14. Long Documents | x | ☐ | |
| 15. Empty Documents | x | ☐ | |

**Overall Status:** 7 / 15 tests passed

---

## Next Steps

After completing the tests:

1. **Document all failures** in the "Issues Found" section
2. **Categorize issues** by severity
3. **Create fix plan** with priorities:
   - Critical: Blocks basic usage
   - High: Major feature broken
   - Medium: Feature works but has issues
   - Low: Nice-to-have improvements

4. **Implement fixes** in order of priority
5. **Retest** to verify fixes

---

## Additional Observations

### TipTap Keyboard Shortcuts Reference

**List Navigation:**
- **Enter** - Create new list item
- **Enter + Enter** (double) - Exit list
- **Backspace** (at start of empty item) - Exit list or un-indent
- **Tab** - NOT SUPPORTED by default in TipTap (would need custom extension)
- **Shift+Tab** - NOT SUPPORTED by default in TipTap

**Note:** TipTap v3 does not support Tab/Shift+Tab for list indentation out of the box. This is a known limitation and would require a custom keyboard extension to implement.

**Blockquote Navigation:**
- **Enter** - New line within blockquote
- **Enter + Enter** (double) - Exit blockquote
- **Backspace** (at start) - Exit blockquote
- **Shift+Enter** - Hard break within blockquote (stays in quote)

**Line Breaks:**
- **Enter** - New paragraph (adds spacing)
- **Shift+Enter** - Hard break (line break without paragraph spacing)

**Horizontal Rule:**
- Type `---` and press Space or Enter
- Rule styled with gold accent color for visibility

### Known Limitations

Use this section to note anything else you observe:

- ❌ Tab/Shift+Tab for list indentation (not supported in TipTap v3 without custom extension)
- ✅ Backspace to exit lists/quotes works at start of empty items
- ✅ Double Enter to exit lists/quotes
- Performance issues
- Visual/styling problems
- UX improvements needed
- Feature requests

---

## Sign-off

**Tester:** David Valentine
**Date:** January 14, 2026
**M5 Status:** ☐ Ready for Production | x Needs Fixes | ☐ Major Rework Required
