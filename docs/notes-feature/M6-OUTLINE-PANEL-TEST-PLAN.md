# M6 Outline Panel - Test Plan

## Implementation Summary

**Status:** ✅ COMPLETE (Fixed initial load issue - January 19, 2026)

The Outline Panel has been fully implemented with the following components:

### Files Created/Modified

1. **`lib/content/outline-extractor.ts`** (Created)
   - Extracts headings from TipTap JSON documents
   - Generates unique anchor IDs for navigation
   - Returns array of `OutlineHeading` with id, level, text, position

2. **`components/content/OutlinePanel.tsx`** (Created)
   - Displays hierarchical outline with indentation
   - Click-to-scroll functionality (pending scroll implementation)
   - Active heading highlighting
   - Empty states for no note/no headings

3. **`stores/outline-store.ts`** (Created)
   - Zustand store for outline state
   - Shared between MainPanelContent (writer) and RightSidebarContent (reader)

4. **`components/content/editor/MarkdownEditor.tsx`** (Modified)
   - Added `onOutlineChange` callback prop
   - Extracts outline on every editor update
   - Real-time outline updates as user types

5. **`components/content/content/MainPanelContent.tsx`** (Modified)
   - Wires `onOutlineChange` handler to editor
   - Updates outline store when content changes
   - Clears outline when no note selected

6. **`components/content/content/RightSidebarContent.tsx`** (Modified)
   - Added tab navigation (Backlinks | Outline)
   - Conditionally renders BacklinksPanel or OutlinePanel
   - Reads outline from outline store

## Test Plan

### 1. Basic Outline Extraction

**Test:** Open a note with headings
- [ ] Navigate to http://localhost:3001/notes
- [ ] Select a note that has multiple headings (H1, H2, H3)
- [ ] Click "Outline" tab in right sidebar
- [ ] Verify headings appear in the outline panel
- [ ] Verify heading hierarchy is correct (indentation)

**Expected:**
- H1 headings have 0px indentation
- H2 headings have 12px indentation
- H3 headings have 24px indentation
- Heading text matches editor content

### 2. Real-Time Updates

**Test:** Add/edit headings in the editor
- [ ] Open a note
- [ ] Click "Outline" tab
- [ ] Add a new heading (e.g., `# New Section`)
- [ ] Verify outline updates immediately (within 2 seconds)
- [ ] Edit existing heading text
- [ ] Verify outline reflects the change

**Expected:**
- Outline updates in real-time as user types
- No page refresh required

### 3. Empty States

**Test:** No note selected
- [ ] Clear note selection (click on empty space or deselect)
- [ ] Click "Outline" tab
- [ ] Verify empty state appears: "No note selected"

**Test:** Note with no headings
- [ ] Open a note with no headings (just paragraphs)
- [ ] Click "Outline" tab
- [ ] Verify empty state appears: "No headings yet"

### 4. Tab Navigation

**Test:** Switch between Backlinks and Outline
- [ ] Open a note
- [ ] Click "Backlinks" tab - verify BacklinksPanel shows
- [ ] Click "Outline" tab - verify OutlinePanel shows
- [ ] Verify active tab has gold underline and text color
- [ ] Verify inactive tab has gray text

### 5. Click to Scroll (Pending Implementation)

**Test:** Click heading in outline
- [ ] Open a note with multiple headings
- [ ] Click "Outline" tab
- [ ] Click a heading in the outline
- [ ] **Currently:** Console logs "Scroll to heading: [heading text]"
- [ ] **Future:** Should scroll editor to that heading

**Note:** Scroll-to-heading functionality requires additional TipTap editor commands to be implemented.

### 6. Anchor ID Generation

**Test:** Duplicate heading text
- [ ] Create a note with duplicate headings (e.g., two "## Introduction" headings)
- [ ] Click "Outline" tab
- [ ] Verify both headings appear in outline
- [ ] Verify they have unique IDs (e.g., "introduction" and "introduction-1")

**Expected:**
- No duplicate anchor IDs
- Second occurrence gets `-1` suffix, third gets `-2`, etc.

### 7. Special Characters in Headings

**Test:** Headings with special characters
- [ ] Create headings with special chars: `## What's Next?`, `## API & SDK`, `## (Optional) Setup`
- [ ] Click "Outline" tab
- [ ] Verify headings appear correctly
- [ ] Verify anchor IDs are URL-safe (spaces → hyphens, special chars removed)

**Expected:**
- "What's Next?" → "whats-next"
- "API & SDK" → "api-sdk"
- "(Optional) Setup" → "optional-setup"

### 8. Performance Test

**Test:** Large document with many headings
- [ ] Create a note with 50+ headings
- [ ] Click "Outline" tab
- [ ] Verify outline renders without lag
- [ ] Type in editor, verify outline updates smoothly

**Expected:**
- No noticeable performance degradation
- Smooth scrolling in outline panel

## Known Limitations

1. **Scroll-to-heading not implemented**
   - Currently logs to console
   - Requires TipTap editor command to scroll to node position

2. **Active heading highlighting**
   - OutlinePanel tracks active heading via state
   - But doesn't detect which heading is currently in viewport
   - Future: Add intersection observer to highlight current section

## Success Criteria

✅ All 7 functional tests pass (excluding scroll-to-heading)
✅ No TypeScript errors
✅ No console errors (warnings are OK)
✅ Real-time updates work smoothly
✅ Tab navigation works correctly
✅ Empty states display properly

## Future Enhancements (Not in Scope for M6)

- Implement scroll-to-heading functionality
- Add intersection observer for active heading detection
- Add keyboard navigation (arrow keys to navigate outline)
- Add collapse/expand for nested sections
- Add "Copy heading link" context menu option
