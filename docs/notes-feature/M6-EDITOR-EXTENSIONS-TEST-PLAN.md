# M6 Editor Extensions - Feature Testing Plan

**Last Updated:** January 15, 2026
**Status:** Ready for Testing
**Related:** M6-FINAL-SCOPE.md

---

## Overview

This document provides a comprehensive testing checklist for all M6 editor extension features implemented in the Notes IDE. Use this to verify functionality before marking M6 as complete.

---

## Test Environment Setup

### Prerequisites
- [x] Development server running (`pnpm dev` in `apps/web`)
- [x] PostgreSQL database seeded with test data (`pnpm db:seed`)
- [x] User authenticated and logged in
- [x] Navigate to `/content` route
- [x] Select any note from the file tree (left sidebar)

### Browser Requirements
- [x] Test in Chrome/Edge (primary)
- [ ] Test in Firefox (secondary)
- [ ] Test in Safari (macOS only)

---

## Feature Test Cases

### 1. Placeholder Extension

**Feature:** Empty nodes show contextual placeholder text

#### Test Case 1.1: Heading Placeholders
- [x ] **Action:** Create a new heading using slash command `/h1`
- [ x] **Expected:** See "H1 Header" placeholder in gray text
- [x ] **Action:** Create headings `/h2`, `/h3`, `/h4`, `/h5`, `/h6`
- [x ] **Expected:** Each shows "H2 Header", "H3 Header", etc.
- [ x] **Action:** Type any text in the heading
- [ x] **Expected:** Placeholder disappears immediately

#### Test Case 1.2: Paragraph Placeholders (Known Issue)
- [ x] **Action:** Create a new empty paragraph
- [ ] **Expected (Currently Broken):** Should show "Start writing..." placeholder
- [x ] **Status:** Documented in M6-FINAL-SCOPE.md under "Known Issues"
- [x ] **Note:** Heading placeholders work, paragraph placeholder is low priority

**Related Files:**
- `lib/editor/extensions.ts` (lines 70-83)
- `app/globals.css` (placeholder CSS)

---

### 2. Task Lists (Checkboxes)

**Feature:** Interactive checkboxes for task items

#### Test Case 2.1: Creating Task Lists via Markdown
- [ ] **Action:** Type `- [ ]` followed by space
- [ ] **Expected:** Converts to an empty checkbox
- [ ] **Action:** Type `- [x]` followed by space
- [ ] **Expected:** Converts to a checked checkbox
- [ ] **Action:** Type text after the checkbox
- [ ] **Expected:** Text appears next to checkbox

! Failed test case 2.1; checkbox not rendering from markdown input, bullet point appears and could be interfering with checkbox rendering.

#### Test Case 2.2: Toggling Tasks via Click
- [ x] **Action:** Click an empty checkbox
- [x ] **Expected:** Checkbox becomes checked, text gets strikethrough
- [x ] **Action:** Click a checked checkbox
- [ x] **Expected:** Checkbox becomes unchecked, strikethrough removed

#### Test Case 2.3: Nested Task Lists
- [ x] **Action:** Create a task item, press Enter, then Tab
- [x ] **Expected:** Creates nested/indented task item
- [x ] **Action:** Create 3 levels of nesting
- [ x] **Expected:** All levels render correctly with proper indentation

! There is some unusual behavior with nested task lists where Checking the parent box does not check the child boxes automatically, but it does strike through the children; however, this may be acceptable for now as it is not a critical issue.

#### Test Case 2.4: Mixed Lists
- [x ] **Action:** Create a task list, then add a bullet list item below
- [x ] **Expected:** Both list types coexist without conflicts
- [ ] **Action:** Convert task to bullet and vice versa
- [ ] **Expected:** Conversion works smoothly
Instructions are not specific on how to convert between task and bullet lists; needs clarification.

**Related Files:**
- `lib/editor/extensions.ts` (lines 85-90)
- `lib/editor/task-list-input-rule.ts`

---

### 3. Link Dialog (Cmd+K)

**Feature:** Keyboard shortcut to insert/edit external links

#### Test Case 3.1: Opening Link Dialog
- [ x] **Action:** Select some text, press Cmd+K (Mac) or Ctrl+K (Windows)
- [x ] **Expected:** Link dialog opens with selected text in the "Text" field
- [ x] **Action:** Press Cmd+K without selecting text
- [ x] **Expected:** Link dialog opens with empty "Text" field

#### Test Case 3.2: Inserting New Link
- [x ] **Action:** Select text "OpenAI", press Cmd+K
- [ ] **Expected:** Dialog opens with "OpenAI" in text field
- [- ] **Action:** Enter URL "https://openai.com", click "Insert Link"
- [x ] **Expected:** Text becomes a clickable link with blue color
- [x ] **Action:** Hover over the link
- [ ] **Expected:** Underline appears on hover

Text field does not show in the dialog when text is selected. Insert text does not say "Insert Link" but it does say "Insert". Text field does show if no text is selected.  This is acceptable. This interface will be replaced with a more minimalist design in the future.
Minor issue.No hover appears on hover, but the link is underlined. A hover effect would be preferable.

#### Test Case 3.3: Editing Existing Link
- [ ] **Action:** Click inside an existing link, press Cmd+K
- [ ] **Expected:** Dialog opens pre-filled with current text and URL
- [ ] **Action:** Change URL to different address, click "Update Link"
- [ ] **Expected:** Link updates to new URL

Major issue: I am unable to click inside an existing link to edit it.  I must move my cursor sideways into the link. Once there, command K opens as if there is selected text (ie the text field is missing like it is in test case .2) and the url form is prepopulated with the correct url.  Entering a url inserts the url as text that is wrapped in the text where the cursor what place. This is a significant issue that needs to be addressed before completing M6. 

Important note here.  If I select the entire link text and then press command K, the dialog opens with the URL prepopulated and editing the URL value works as expected.  So the issue is only when placing the cursor inside the link without selecting the entire text.

#### Test Case 3.4: Removing Link
- [ x] **Action:** Click inside a link, press Cmd+K
- [x ] **Expected:** Dialog opens with "Remove Link" button
- [x] **Action:** Click "Remove Link"
- [ x] **Expected:** Link formatting removed, text remains
This works as expected even when just placing the cursor inside the link without selecting text.  Consider this pattern when fixing test case 3.3.


#### Test Case 3.5: Link Attributes
- [x ] **Action:** Insert a link "https://example.com"
- [x ] **Expected:** Link has `target="_blank"` attribute
- [ ] **Action:** Right-click link → "Open link in new tab"
- [ ] **Expected:** Opens in new browser tab
- [ x] **Action:** Inspect link element in DevTools
- [x ] **Expected:** Has `rel="noopener noreferrer"` for security

Right clicking does not show "Open link in new tab" option. This issue must be resolved before M6 can be completed. It is worth noting that holding command and clicking the link does open it in a new tab as expected.

**Related Files:**
- `components/content/editor/LinkDialog.tsx`
- `components/content/editor/MarkdownEditor.tsx` (lines 111-153)
- `lib/editor/extensions.ts` (lines 92-100)

---

### 4. Character Count & Word Count

**Feature:** Real-time document statistics in status bar

#### Test Case 4.1: Initial Word Count
- [ x] **Action:** Open a note with existing content
- [x ] **Expected:** Status bar shows accurate word count
- [x ] **Action:** Manually count words, compare to status bar
- [x ] **Expected:** Counts match (±1 word acceptable)

#### Test Case 4.2: Real-Time Updates
- [x ] **Action:** Type "Hello world testing"
- [x ] **Expected:** Word count increases by 3
- [x ] **Action:** Delete 2 words
- [x ] **Expected:** Word count decreases by 2
- [x ] **Action:** Type continuously without stopping
- [x ] **Expected:** Count updates smoothly without lag

#### Test Case 4.3: Character Count
- [ x] **Action:** Type "Test" (4 characters)
- [x ] **Expected:** Character count increases by 4
- [x ] **Action:** Type "Test " (with space, 5 characters)
- [x ] **Expected:** Character count includes the space

#### Test Case 4.4: Edge Cases
- [ x] **Action:** Type only spaces "     "
- [x ] **Expected:** Word count = 0, character count > 0
- [ x] **Action:** Type numbers "123 456"
- [x ] **Expected:** Word count = 2
- [ x] **Action:** Type punctuation "Hello, world!"
- [x ] **Expected:** Word count = 2 (comma doesn't split words)

#### Test Case 4.5: Large Documents
- [x ] **Action:** Paste 1000+ words of text
- [ x] **Expected:** Count updates within 1 second
- [x ] **Action:** Type in the document
- [x ] **Expected:** No typing lag, count updates smoothly

**Related Files:**
- `lib/editor/extensions.ts` (line 114)
- `components/content/editor/MarkdownEditor.tsx` (lines 66-74, 100-109)
- `components/content/StatusBar.tsx` (lines 59-62)
- `stores/editor-stats-store.ts`

---

### 5. Tables Extension

**Feature:** Create and edit tables with visual controls

#### Test Case 5.1: Creating Tables via Slash Command
- [x ] **Action:** Type `/table` and press Enter
- [ ] **Expected:** 3x3 table inserted with cursor in first cell
- [x ] **Action:** Verify table has 3 rows and 3 columns
- [x ] **Expected:** All cells are `<td>` elements (no `<th>` headers)

A 4 x 4 table is being created instead of 3 x 3. And the cursor starts on the second column. The first column cannot be tabbed or clicked into. Typing text when the tab is in the second column populates the first column and makes the first column selectable and editable and the last column unusuable (no tabbing or clicking).  The last column cannot be populated. This needs to be fixed before M6 can be completed.

#### Test Case 5.2: Table Navigation
- [x ] **Action:** Press Tab from first cell
- [x ] **Expected:** Cursor moves to next cell (right)
- [x ] **Action:** Press Shift+Tab
- [x ] **Expected:** Cursor moves to previous cell (left)
- [x ] **Action:** Press Tab in last cell of row
- [x ] **Expected:** Cursor moves to first cell of next row
- [x ] **Action:** Use arrow keys (←→↑↓)
- [x ] **Expected:** Navigate between cells smoothly

On 4 x 4, pressing tab works on the 2-4 columns but the first column is skipped. 

#### Test Case 5.3: Adding Content to Cells
- [x ] **Action:** Type text in a cell
- [x ] **Expected:** Text appears, cell auto-expands if needed
- [x ] **Action:** Apply bold/italic formatting in cell
- [x ] **Expected:** Formatting works inside table cells
- [x ] **Action:** Add bullet list in a cell
- [ ] **Expected:** List renders correctly within cell

#### Test Case 5.4: Table Resizing
- [ ] **Action:** Hover over column border
- [x  ] **Expected:** Resize cursor appears
- [x ] **Action:** Drag column border left/right
- [ ] **Expected:** Column width changes smoothly
- [ ] **Action:** Make column very narrow
- [ ] **Expected:** Content wraps appropriately

No resizing is availabe for the tables at this time but they do auto expand.  We may want to fix this issue to mark M6 as complete.

#### Test Case 5.5: Copy/Paste Tables
- [ ] **Action:** Select entire table, copy (Cmd+C)
- [ ] **Expected:** Table copied to clipboard
- [ ] **Action:** Paste into Obsidian or Notion
- [ ] **Expected (Known Behavior):** First row becomes header in markdown
- [ ] **Note:** Documented in M6-FINAL-SCOPE.md as standard markdown behavior

**Related Files:**
- `lib/editor/extensions.ts` (lines 102-111)
- `lib/editor/slash-commands.tsx` (table creation)

---

### 6. Table Bubble Menu

**Feature:** Floating toolbar for table manipulation

#### Test Case 6.1: Menu Activation
- [x ] **Action:** Create a table using `/table`
- [x ] **Expected:** Table created successfully
- [ x] **Action:** Click inside any table cell
- [ x] **Expected:** Table bubble menu appears above the table
- [x ] **Action:** Click outside the table
- [x] **Expected:** Table bubble menu disappears

#### Test Case 6.2: Adding Rows
- [ ] **Action:** Click "Add Row Above" button (↑ + icon)
- [ ] **Expected:** New row inserted above current row
- [ ] **Action:** Click "Add Row Below" button (↓ + icon)
- [ ] **Expected:** New row inserted below current row
- [ ] **Action:** Add 5 rows in succession
- [ ] **Expected:** All rows added without errors

this test should be done after fixing the table creation issue noted in Test Case 5.1

#### Test Case 6.3: Deleting Rows
- [ ] **Action:** Click in middle row, click "Delete Row" button (- ↑ icon)
- [ ] **Expected:** Current row deleted
- [ ] **Action:** Delete rows until only 1 remains
- [ ] **Expected:** Last row cannot be deleted (table requires minimum 1 row)

See note in Test Case 6.2 regarding table creation issue.

#### Test Case 6.4: Adding Columns
- [ ] **Action:** Click "Add Column Left" button (← + icon)
- [ ] **Expected:** New column inserted to the left
- [ ] **Action:** Click "Add Column Right" button (→ + icon)
- [ ] **Expected:** New column inserted to the right
- [ ] **Action:** Add 5 columns in succession
- [ ] **Expected:** All columns added, table remains functional

See note in Test Case 6.2 regarding table creation issue.

#### Test Case 6.5: Deleting Columns
- [ ] **Action:** Click in middle column, click "Delete Column" button (- ← icon)
- [ ] **Expected:** Current column deleted
- [ ] **Action:** Delete columns until only 1 remains
- [ ] **Expected:** Last column cannot be deleted (table requires minimum 1 column)

See note in Test Case 6.2 regarding table creation issue.

#### Test Case 6.6: Deleting Entire Table
- [x ] **Action:** Click in any cell, click "Delete Table" button (trash icon)
- [ x] **Expected:** Entire table removed from document
- [x ] **Action:** Undo (Cmd+Z)
- [ x] **Expected:** Table restored


#### Test Case 6.7: Menu Positioning
- [x ] **Action:** Create table at top of document, click inside
- [x ] **Expected:** Menu appears above table
- [x ] **Action:** Scroll so table is at bottom of viewport, click inside
- [x ] **Expected:** Menu repositions to stay visible
- [x ] **Action:** Make table very wide (10+ columns)
- [ x] **Expected:** Menu stays centered above table

#### Test Case 6.8: Visual Design
- [xs] **Action:** Inspect table bubble menu appearance
- [ ] **Expected:** Matches liquid glass design system
- [ ] **Expected:** Background: `bg-black/80` with backdrop blur
- [ ] **Expected:** Border: `border-white/10`
- [ ] **Action:** Hover over each button
- [ ] **Expected:** Hover state shows `bg-white/10`
- [ ] **Action:** Hover over "Delete Table" button
- [ ] **Expected:** Red hover state `hover:bg-red-500/20`

Liquid glass styles do no appear to be applied anywhere. Generic styles are applied instead. 

**Related Files:**
- `components/content/editor/TableBubbleMenu.tsx`
- `components/content/editor/MarkdownEditor.tsx` (lines 176-177)

---

### 7. Slash Commands

**Feature:** Quick content insertion via `/` command menu

#### Test Case 7.1: Opening Slash Menu
- [x ] **Action:** Type `/` on an empty line
- [x ] **Expected:** Slash command menu appears
- [x] **Action:** Type `/` in middle of existing text
- [ x] **Expected:** Menu does NOT appear (only works at start of line)

#### Test Case 7.2: Filtering Commands
- [ x] **Action:** Type `/h`
- [ x] **Expected:** Menu shows only heading commands (h1-h6)
- [x ] **Action:** Type `/ta`
- [x ] **Expected:** Menu shows "Table" and "Task List"
- [x ] **Action:** Type `/xyz` (nonsense)
- [x ] **Expected:** Menu shows "No results" or closes

#### Test Case 7.3: Keyboard Navigation
- [x ] **Action:** Type `/`, use ↓ arrow key
- [x ] **Expected:** Selection moves down to next command
- [x ] **Action:** Press ↑ arrow key
- [x ] **Expected:** Selection moves up to previous command
- [x ] **Action:** Press Enter on selected command
- [x ] **Expected:** Command executes, menu closes

#### Test Case 7.4: Heading Commands
- [x ] **Action:** Type `/h1` and press Enter
- [x ] **Expected:** Line converts to H1 heading
- [x ] **Action:** Test `/h2`, `/h3`, `/h4`, `/h5`, `/h6`
- [x ] **Expected:** Each creates respective heading level

#### Test Case 7.5: Text Formatting Commands
- [ ] **Action:** Type `/bold` and press Enter
- [ ] **Expected:** Bold text inserted or toggle bold on selected text
- [ ] **Action:** Test `/italic`, `/code`, `/strike`
- [ ] **Expected:** Each applies respective formatting

#### Test Case 7.6: Block Commands
- [x] **Action:** Type `/code` and press Enter
- [x ] **Expected:** Code block inserted with syntax highlighting
- [ x] **Action:** Type `/quote` and press Enter
- [ x] **Expected:** Blockquote inserted
- [ x] **Action:** Type `/hr` and press Enter
- [ x] **Expected:** Horizontal rule inserted
- [x] **Action:** Type `/bullet` and press Enter
- [ x] **Expected:** Bullet list started
- [ x] **Action:** Type `/number` and press Enter
- [ x] **Expected:** Numbered list started

#### Test Case 7.7: Special Commands
- [x] **Action:** Type `/task` and press Enter
- [x] **Expected:** Task list with checkbox created
- [x] **Action:** Type `/table` and press Enter
- [] **Expected:** 3x3 table inserted
A table is inserted but it is not 3 x 3

#### Test Case 7.8: Menu Appearance
- [x ] **Action:** Open slash menu, inspect visual design
- [ ] **Expected:** Matches liquid glass design system
- [ x] **Expected:** Dropdown positioned below cursor
- [x ] **Action:** Open menu near bottom of viewport
- [x ] **Expected:** Menu flips above cursor if no space below

**Related Files:**
- `lib/editor/slash-commands.tsx`
- `lib/editor/extensions.ts` (line 117)

---

### 8. Text Formatting Bubble Menu

**Feature:** Floating toolbar for text formatting on selection

#### Test Case 8.1: Menu Activation
- [x ] **Action:** Select text "Hello World" outside a table
- [ x] **Expected:** Text formatting bubble menu appears above selection
- [ x] **Action:** Click elsewhere to deselect
- [xs ] **Expected:** Menu disappears immediately

#### Test Case 8.2: Menu Exclusion in Tables
- [x ] **Action:** Create a table, select text inside a cell
- [x ] **Expected:** Text formatting menu does NOT appear
- [x ] **Expected:** Only table bubble menu appears
- [x ] **Note:** This prevents menu conflicts

#### Test Case 8.3: Bold Button
- [x ] **Action:** Select text, click Bold button (B icon)
- [x ] **Expected:** Text becomes bold
- [x ] **Expected:** Bold button shows active state (`bg-white/20`)
- [x ] **Action:** Click Bold button again
- [x ] **Expected:** Bold removed, button returns to inactive state

#### Test Case 8.4: Italic Button
- [x ] **Action:** Select text, click Italic button (I icon)
- [x ] **Expected:** Text becomes italic
- [x ] **Action:** Select already-italic text
- [x ] **Expected:** Italic button shows active state

#### Test Case 8.5: Strikethrough Button
- [x ] **Action:** Select text, click Strikethrough button
- [x ] **Expected:** Text gets strikethrough line
- [x ] **Action:** Toggle off
- [x ] **Expected:** Strikethrough removed

#### Test Case 8.6: Inline Code Button
- [x ] **Action:** Select text, click Code button
- [x ] **Expected:** Text becomes inline code with monospace font
- [x ] **Expected:** Background color applied (gray)

#### Test Case 8.7: Link Button
- [x ] **Action:** Select text, click Link button (chain icon)
- [x ] **Expected:** Link dialog opens (same as Cmd+K)
- [x ] **Action:** Insert link "https://example.com"
- [x ] **Expected:** Text becomes clickable link
- [ ] **Action:** Click inside link, click Link button again
- [x ] **Expected:** Link removed (unlink action)

unable to click ins

#### Test Case 8.8: Heading Buttons
- [x ] **Action:** Select text, click H1 button
- [x ] **Expected:** Line converts to H1 heading
- [x ] **Action:** With heading selected, click H2 button
- [x ] **Expected:** Heading changes from H1 to H2
- [x ] **Action:** With heading selected, click same heading button
- [x ] **Expected:** Heading converts back to paragraph

#### Test Case 8.9: Combined Formatting
- [x ] **Action:** Select text, make it bold AND italic
- [ x ] **Expected:** Both buttons show active state
- [x ] **Expected:** Text renders with both formats
- [x ] **Action:** Add strikethrough to bold+italic text
- [ x] **Expected:** All three formats active simultaneously

Deselecting and reselecting this same text does not show active state!  Explore solutions befoore advancing.

#### Test Case 8.10: Menu Positioning
- [x ] **Action:** Select text at top of document
- [ x] **Expected:** Menu appears above selection
- [x ] **Action:** Select text at bottom of viewport
- [x ] **Expected:** Menu repositions to stay visible
- [x ] **Action:** Select very long text (multiple lines)
- [x ] **Expected:** Menu positions near start of selection

#### Test Case 8.11: Visual Design
- [ ] **Action:** Inspect bubble menu appearance
- [ ] **Expected:** Matches liquid glass design system
- [ ] **Expected:** Background: `bg-black/80` with backdrop blur
- [ ] **Expected:** Border: `border-white/10`
- [ ] **Action:** Hover over each button
- [ ] **Expected:** Hover state shows `bg-white/10`
- [ ] **Action:** Active button (e.g., bold when text is bold)
- [ ] **Expected:** Shows `bg-white/20 text-white`



#### Test Case 8.12: Keyboard Shortcuts
- [x ] **Action:** Select text, press Cmd+B (Mac) or Ctrl+B (Windows)
- [ ] **Expected:** Text becomes bold, menu button reflects state
- [ x] **Action:** Press Cmd+I for italic
- [x ] **Expected:** Text becomes italic, menu button reflects state
- [x ] **Action:** Press Cmd+E for inline code
- [x ] **Expected:** Text becomes inline code, menu button reflects state


**Related Files:**
- `components/content/editor/BubbleMenu.tsx`
- `components/content/editor/MarkdownEditor.tsx` (lines 170-174)

---

### 9. Multiple Bubble Menus (Plugin Conflict Resolution)

**Feature:** Both bubble menus work without conflicts

#### Test Case 9.1: Unique Plugin Keys
- [ x] **Action:** Inspect BubbleMenu component source code
- [ ] **Expected:** Has `pluginKey={textFormattingBubbleMenuKey}`
- [ ] **Action:** Inspect TableBubbleMenu component source code
- [ ] **Expected:** Has `pluginKey={tableBubbleMenuKey}`
- [ ] **Note:** Unique keys prevent ProseMirror plugin conflicts

pluginKey does not show in html search for any of the bubble objects.  Conflicts do not appear to be an issue if this system is broken, it should be removed.

#### Test Case 9.2: Contextual Menu Switching
- [x ] **Action:** Select text outside table
- [x ] **Expected:** Text formatting menu appears
- [x ] **Action:** Click inside table cell
- [x ] **Expected:** Text formatting menu disappears, table menu appears
- [x ] **Action:** Click outside table
- [x ] **Expected:** Table menu disappears



#### Test Case 9.3: No Simultaneous Menus
- [x ] **Action:** Select text in table cell
- [ x] **Expected:** ONLY table menu appears (not both)
- [x ] **Action:** Quickly switch between table and non-table content
- [x ] **Expected:** Menus transition smoothly without flickering

#### Test Case 9.4: Performance Under Rapid Switching
- [x ] **Action:** Rapidly click in/out of table 10 times
- [ x] **Expected:** No console errors
- [ x] **Expected:** Menus appear/disappear without lag
- [x ] **Action:** Monitor browser DevTools performance
- [x ] **Expected:** No memory leaks or excessive re-renders

**Related Files:**
- `components/content/editor/BubbleMenu.tsx` (lines 15, 28, 43)
- `components/content/editor/TableBubbleMenu.tsx` (lines 15, 27, 41)

---

## Integration Tests

### Cross-Feature Compatibility

#### Test Case I.1: Slash Commands + Bubble Menu
- [x ] **Action:** Use `/h1` to create heading, then select heading text
- [x] **Expected:** Bubble menu appears with H1 button active

#### Test Case I.2: Task Lists + Bubble Menu
- [x ] **Action:** Create task list, select task text, apply bold via bubble menu
- [x ] **Expected:** Task text becomes bold, checkbox still functional

#### Test Case I.3: Tables + Slash Commands
- [ x] **Action:** Inside table cell, type `/code`
- [x ] **Expected:** Slash commands work inside table cells

#### Test Case I.4: Link Dialog + Bubble Menu
- [x ] **Action:** Select text, click Link in bubble menu
- [ x] **Expected:** Link dialog opens
- [ x] **Action:** Insert link, bubble menu reappears with link active

See prior exceptions related to links

#### Test Case I.5: Character Count + All Features
- [x ] **Action:** Insert table, add task lists, format text
- [x ] **Expected:** Word count updates correctly for all content types

---

## Performance Tests

### Test Case P.1: Large Document Performance
- [ ] **Action:** Create document with 100+ paragraphs
- [ ] **Action:** Select text and verify bubble menu appears < 100ms
- [ ] **Expected:** No lag in menu appearance

Skipped due to time constraints.

### Test Case P.2: Complex Table Performance
- [x ] **Action:** Create 10x10 table (100 cells)
- [x ] **Action:** Navigate between cells rapidly
- [x ] **Expected:** Table bubble menu appears smoothly



### Test Case P.3: Real-Time Stats Performance
- [x ] **Action:** Paste 2000 words of text
- [x ] **Expected:** Word count updates within 1 second
- [x ] **Action:** Type continuously for 30 seconds
- [x ] **Expected:** No typing lag, stats update smoothly

---

## Browser Compatibility Tests

### Chrome/Edge (Chromium)
- [ ] All features tested and working
- [x ] Bubble menus position correctly
- [x ] No console errors

### Firefox
- [ ] All features tested and working
- [ ] Bubble menus position correctly
- [ ] Keyboard shortcuts work (Cmd+K, etc.)

### Safari (macOS)
- [ ] All features tested and working
- [ ] Backdrop blur renders correctly
- [ ] No webkit-specific issues

---

## Accessibility Tests

### Keyboard Navigation
- [ ] **Action:** Navigate entire document using only keyboard
- [ ] **Expected:** All features accessible via keyboard
- [ ] **Action:** Use Tab to move between table cells
- [ ] **Expected:** Clear focus indicators

### Screen Reader
- [ ] **Action:** Enable VoiceOver (macOS) or NVDA (Windows)
- [ ] **Expected:** Task checkboxes announced as "checkbox, checked/unchecked"
- [ ] **Expected:** Links announced with URL
- [ ] **Expected:** Tables announced with row/column count

Skipped due to time constraints.
---

## Error Handling Tests

### Test Case E.1: Rapid Command Execution
- [ x] **Action:** Type `/h1/h2/h3` rapidly without pausing
- [ x] **Expected:** No crashes, commands execute in sequence or last wins

### Test Case E.2: Conflicting Formats
- [ x] **Action:** Make text a heading, then try to make it a code block
- [ x] **Expected:** Graceful conversion or block-level format takes precedence

### Test Case E.3: Table Edge Cases
- [x ] **Action:** Delete all rows from table
- [x ] **Expected:** Error handling or minimum 1 row enforced
- [ ] **Action:** Merge cells (if supported)
- [ ] **Expected:** Graceful handling or feature disabled

Skipping because merging cells is not supported at this time.


---

## Known Issues Verification

### Issue 1: Paragraph Placeholder Not Showing
- [ ] **Status:** Documented in M6-FINAL-SCOPE.md (lines 81-103)
- [x] **Verified:** Heading placeholders work (H1-H6)
- [x ] **Verified:** Paragraph placeholder does not appear
- [x ] **Priority:** Low (cosmetic issue)

### Issue 2: Table Export to Obsidian
- [ x] **Status:** Documented in M6-FINAL-SCOPE.md (lines 105-119)
- x[ ] **Verified:** First row becomes header in markdown format
- [ ] **Priority:** Low (standard markdown behavior)

---

---

## Sign-Off

### Testing Completed By
- **Name:** _______________________
- **Date:** _______________________
- **Browser(s):** _______________________

### Issues Found
| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| | | | |

### Recommendation
- [ ] ✅ **PASS** - All features working, ready for production
- [ ] ⚠️ **PASS with Known Issues** - Minor issues documented, acceptable
- [ ] ❌ **FAIL** - Critical issues found, requires fixes

---

## Next Steps After Testing

1. **If PASS:** Mark M6 Editor Extensions as complete in IMPLEMENTATION-STATUS.md
2. **If Issues Found:** Document in M6-FINAL-SCOPE.md Known Issues section
3. **Future Work:** Begin M6 remaining features (Search, Backlinks, Outline, Tags, Wiki Links)

---

**Document Version:** 1.0
**Related Documentation:**
- M6-FINAL-SCOPE.md - Overall M6 milestone scope
- IMPLEMENTATION-STATUS.md - Current progress tracking
- HANDOFF.MD - AI handoff guide
