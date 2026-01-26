# M6: Final Implementation Scope

**Last Updated:** January 14, 2026
**Status:** Approved - Ready to Implement

---

## ✅ Core M6 Features (Must-Have)

### Phase 0: Persistence
1. ✅ Selection persistence (URL + localStorage)

### Phase 1-5: Core Features
2. ✅ Search panel (full-text with PostgreSQL)
3. ✅ Backlinks panel (real-time extraction)
4. ✅ Outline panel (real-time, debounced)
5. ✅ Tags table + panel (dedicated table, autocomplete)
6. ✅ Wiki links `[[note-slug]]` (custom extension with autocomplete)
7. ✅ External links `[text](url)` (clickable, new tab)

---

## ✅ Editor Polish (Should-Have)

8. ✅ Placeholder extension ("Start writing...")
9. ✅ Task lists (`[ ]` / `[x]` checkboxes)
10. ✅ Link dialog (Cmd+K)
11. ✅ Character/word count (status bar)
12. ✅ Tables (create, edit, navigate)

---

## ✅ Advanced Features (High Value)

13. ✅ **Slash Commands** (`/h1`, `/code`, `/table`, etc.)
    - Command menu on `/`
    - Quick insertion of blocks
    - Keyboard navigation

14. ✅ **Bubble Menu** (floating selection toolbar)
    - **Note:** Make this toggleable in settings (future M8)
    - Bold, italic, link, highlight
    - Appears on text selection

15. ✅ **Word Count in Status Bar**
    - Words, characters, reading time
    - Updates in real-time

---

## 📦 Packages to Install

```bash
# Core extensions
pnpm add @tiptap/extension-link \
         @tiptap/extension-placeholder \
         @tiptap/extension-task-list \
         @tiptap/extension-task-item \
         @tiptap/extension-table \
         @tiptap/extension-table-row \
         @tiptap/extension-table-cell \
         @tiptap/extension-table-header \
         @tiptap/extension-character-count \
         @tiptap/suggestion \
         @tiptap/extension-bubble-menu
```

---

## 🔮 Future Features (Post-M6)

### M7: File Management
- **Text Align Extension** (left, center, right, justify)
- **Color & Highlight Extension** (text colors, background highlights)
- Image upload/display
- PDF viewer
- File attachments

### Known Issues & Future Improvements

#### Table Initial Rendering Bug (TipTap v3.15)
**Issue:** Tables show phantom cells on initial render, self-correcting when user starts typing.

**Current Behavior:**
- Create table with `/table` → Renders as 4x3 or 4x4 initially
- Click into cells or type → Table corrects to proper 3x3 (1 header + 2 data rows)
- All functionality works (add/delete rows/columns, navigation, bubble menu)
- No data loss or corruption

**Root Cause:**
Rendering bug in `@tiptap/extension-table` v3.15.3. Attempted 6+ different fixes (see M6-FIXES-ACTION-PLAN.md), all failed. This is a library issue, not our implementation.

**Impact:** MEDIUM - Cosmetic issue that self-corrects immediately on interaction

**Workaround:** Start typing in any cell - table immediately corrects

**Status:** DEFERRED TO M7 - Will investigate TipTap downgrade, upgrade, or custom table implementation

**Related Files:**
- `lib/editor/slash-commands.tsx` - Manual table JSON construction (lines 85-129)
- `lib/editor/extensions.ts` - Standard Table extensions (lines 104-107)
- `M6-FIXES-ACTION-PLAN.md` - Full troubleshooting documentation

#### Placeholder Text Visibility
**Issue:** The "Start writing..." placeholder text for empty paragraphs is not displaying consistently, though heading placeholders (e.g., "H1 Header", "H2 Header") work correctly.

**Current Behavior:**
- Heading placeholders work perfectly and show the heading level
- Paragraph placeholder "Start writing..." does not appear when creating empty paragraphs
- TipTap Placeholder extension is configured with `includeChildren: true` and proper CSS rules

**Attempted Solutions:**
1. Added `showOnlyCurrent: false` configuration (then switched to `includeChildren: true`)
2. Added explicit CSS rules for `p.is-empty::before` with `!important` flags
3. Verified `data-placeholder` attribute should be set by TipTap extension

**Potential Root Causes:**
- CSS specificity conflict with TailwindCSS prose classes
- TipTap extension not properly setting `data-placeholder` attribute on paragraph nodes
- Possible issue with `height: 0` preventing visibility in some cases

**Impact:** Low priority - heading placeholders work, this is a nice-to-have polish issue

**Related Files:**
- `lib/editor/extensions.ts` - Placeholder configuration (lines 71-83)
- `app/globals.css` - Placeholder CSS styling (lines 237-276)

#### Table Export to Obsidian
**Issue:** When copying tables from the editor to Obsidian, the first row is converted to a header row with a separator line (`|---|---|---|`). This is due to markdown table syntax, which conventionally treats the first row as a header.

**Current Behavior:**
- Editor HTML: `<tbody>` with only `<td>` elements (no `<thead>` or `<th>`)
- Obsidian conversion: First row becomes header in markdown format

**Potential Solutions (Future Work):**
1. **Accept Convention:** Keep tables as-is, knowing first row becomes header in markdown (standard markdown behavior)
2. **Auto-Empty Row:** Add a blank first row automatically when creating tables, so user's actual first row isn't treated as header
3. **Custom Export Format:** Implement a custom clipboard handler that exports tables in a different format specifically for Obsidian compatibility
4. **User Education:** Document this behavior and let users add their own empty first row if needed

**Impact:** Low priority - this is standard markdown table behavior, not a bug

**Related Files:**
- `lib/editor/extensions.ts` - Table configuration
- `lib/editor/slash-commands.tsx` - Table creation command

#### Table UI Controls
**Status:** ✅ **IMPLEMENTED** - Table bubble menu now available!

**Implementation:**
- Added `TableBubbleMenu` component that appears when cursor is inside a table
- Visual buttons for all table operations:
  - Add row above/below
  - Add column left/right
  - Delete current row
  - Delete current column
  - Delete entire table
- Matches the liquid glass design system
- Similar UX to Notion, Craft, and other modern editors

**How to Use:**
1. Create a table using `/table` slash command
2. Click inside any table cell
3. Floating toolbar automatically appears above the table
4. Click any button to perform table operations

**Benefits:**
- Improved discoverability - users don't need to know slash commands
- Faster workflow for frequent table editing
- Visual feedback for available actions
- Slash commands still available as alternative

**Related Files:**
- `components/notes/editor/TableBubbleMenu.tsx` - Table-specific bubble menu
- `components/notes/editor/MarkdownEditor.tsx` - Integrated table menu
- `lib/editor/extensions.ts` - Table configuration

### M8: Settings & Preferences
- **Bubble Menu Toggle** (enable/disable in settings)
- **Focus Extension** (typewriter mode, highlight current block)
- Theme customization
- Keyboard shortcut configuration

### M9: Advanced UI
- **Floating Menu** (empty line commands)
  - Shows on empty lines
  - Quick access to slash commands
  - Customizable

### M10-M12: Social & Collaboration

#### **@Mentions & Sharing**
- `@user` mentions
- Share notes (view/edit permissions)
- Anonymous link-based sharing (like Google Drive) - ShareLink model
- Public publishing system (blog posts, documentation) - **System TBD**
- SEO-friendly published URLs
- Social media sharing (Open Graph, Twitter Cards)

#### **Real-Time Collaboration**
- Activity status (online/offline)
- See active users in notes
- Cursor presence
- Real-time editing (Y.js/Hocuspocus)

#### **Communication Features**
- Internal chat/DM system
- Comment threads on notes
- Notification system (in-app + browser)
- Notification hooks/webhooks

#### **WebRTC Features**
- P2P voice/video calls
- Call active users
- Screen sharing during collaboration
- Low-latency for real-time editing

### M13: Advanced Content Types

#### **Gallery Folders**
- Special folder type for images/media
- Grid view of files
- Lightbox/slideshow mode
- Image metadata display

#### **Resume Document Type**
- Syncs with resume feature
- Specialized templates
- Export to PDF/DOCX
- ATS-friendly formatting
- Version history for resumes

---

## Implementation Timeline

### Week 1: Phase 0 + Core Extensions
**Days 1-2:**
- Phase 0: Selection persistence
- Install all packages
- Placeholder extension
- Task lists
- Character count

**Days 3-5:**
- Link extension + dialog (Cmd+K)
- Tables extension
- Wiki link custom extension (with autocomplete)

**Estimated:** ~20-25 hours

### Week 2: Search & Backlinks
**Days 6-8:**
- Search API + UI
- Link extraction system
- Backlinks API + panel

**Days 9-10:**
- Outline real-time updates
- Tags table migration
- Tags panel

**Estimated:** ~20-25 hours

### Week 3: Advanced Features
**Days 11-13:**
- Slash commands implementation
- Command menu UI
- Keyboard navigation

**Days 14-15:**
- Bubble menu implementation
- Word count in status bar
- Polish and testing

**Estimated:** ~20-25 hours

**Total M6 Estimated:** 60-75 hours (3-4 weeks)

---

## Success Criteria

### Core Features ✅
- [ ] Selection persists on refresh
- [ ] Search finds notes by content
- [ ] Backlinks show linking notes
- [ ] Outline updates as you type
- [ ] Tags can be added/removed/filtered
- [ ] Wiki links navigate between notes
- [ ] External links open in new tab

### Editor Polish ✅
- [ ] Placeholder shows on empty nodes
- [ ] Task lists toggle with click
- [ ] Cmd+K opens link dialog
- [ ] Word count shows in status bar
- [ ] Tables can be created and edited

### Advanced Features ✅
- [ ] `/` opens command menu
- [ ] Slash commands insert blocks
- [ ] Bubble menu appears on selection
- [ ] Bubble menu can be toggled (note for M8)

### Performance ✅
- [ ] Search < 100ms for 1000+ notes
- [ ] Outline extracts < 50ms
- [ ] No lag with 100+ backlinks
- [ ] Smooth typing in large documents

---

## Files to Create

### API Routes (3)
1. `app/api/notes/search/route.ts`
2. `app/api/notes/backlinks/[id]/route.ts`
3. `app/api/notes/outline/[id]/route.ts`

### Utilities (4)
1. `lib/content/link-extractor.ts`
2. `lib/content/outline-extractor.ts`
3. `lib/content/tag-extractor.ts`
4. `lib/editor/extensions/wiki-link.ts`

### Components (10)
1. `components/notes/search/SearchPanel.tsx`
2. `components/notes/search/SearchResult.tsx`
3. `components/notes/backlinks/BacklinksPanel.tsx`
4. `components/notes/backlinks/BacklinkItem.tsx`
5. `components/notes/outline/OutlinePanel.tsx`
6. `components/notes/outline/OutlineItem.tsx`
7. `components/notes/tags/TagsPanel.tsx`
8. `components/notes/tags/TagInput.tsx`
9. `components/notes/editor/SlashCommandMenu.tsx`
10. `components/notes/editor/LinkDialog.tsx`

### Modified Files (6)
1. `stores/content-store.ts` - Add URL/localStorage persistence
2. `components/notes/RightSidebar.tsx` - Tab navigation
3. `components/notes/StatusBar.tsx` - Word count display
4. `lib/editor/extensions.ts` - Add all new extensions
5. `app/api/notes/content/[id]/route.ts` - Extract links/tags on save
6. `prisma/schema.prisma` - Add Tag table

### Database Migration (1)
1. `prisma/migrations/YYYYMMDD_add_tags_table/migration.sql`

**Total:** 24 files (17 new, 6 modified, 1 migration)

---

## Design Decisions Confirmed

### Link Syntax ✅
- **Internal:** `[[note-slug]]` or `[[slug|Display Text]]`
  - Custom TipTap extension
  - Autocomplete on typing
  - Navigate on click
- **External:** `[text](url)`
  - Standard TipTap Link extension
  - Opens in new tab
  - Cmd+K to edit

### Tags ✅
- **Storage:** Dedicated `Tag` table
- **Schema:**
  ```prisma
  model Tag {
    id        String   @id @default(cuid())
    name      String
    userId    String
    nodes     ContentNode[]
    createdAt DateTime @default(now())

    @@unique([name, userId])
    @@index([userId])
  }
  ```

### Outline ✅
- **Updates:** Real-time with 500ms debounce
- **Extraction:** From TipTap JSON on each update
- **Display:** Indented hierarchy, clickable

### Selection Persistence ✅
- **URL Pattern:** `/notes?content=<uuid>` (content-type agnostic)
- **Primary:** URL query param
- **Fallback:** localStorage (`lastSelectedContentId`)
- **Benefits:** Shareable URLs, browser back/forward, works for all content types
- **Future:** Hybrid UUID/slug support, multi-panel views (`?left=&right=`)
- **See:** `URL-IDENTIFIER-STRATEGY.md` for complete architecture

---

## Technical Notes

### Slash Commands Implementation
Use `@tiptap/suggestion` extension:
```typescript
Suggestion.configure({
  char: '/',
  command: ({ editor, range, props }) => {
    props.command({ editor, range });
  },
  items: ({ query }) => {
    return [
      { title: 'Heading 1', command: 'h1' },
      { title: 'Heading 2', command: 'h2' },
      { title: 'Code Block', command: 'code' },
      { title: 'Table', command: 'table' },
      { title: 'Task List', command: 'task' },
    ].filter(item =>
      item.title.toLowerCase().includes(query.toLowerCase())
    );
  },
});
```

### Bubble Menu Configuration
```typescript
BubbleMenu.configure({
  element: document.querySelector('.bubble-menu'),
  tippyOptions: {
    placement: 'top',
    duration: 100,
  },
})

// Add settings toggle later (M8):
// if (userSettings.bubbleMenuEnabled) { ... }
```

### Character Count Integration
```typescript
CharacterCount.configure({
  mode: 'textSize', // Count text excluding HTML
})

// Display in StatusBar:
const stats = editor.storage.characterCount;
// stats.characters() - total characters
// stats.words() - total words
```

---

## Next Steps

1. ✅ **Review this scope** - Confirm all features
2. 🚀 **Begin Phase 0** - Selection persistence (quick win)
3. 📦 **Install packages** - All TipTap extensions
4. 🔨 **Implement in order** - Week 1 → Week 2 → Week 3

Ready to start when you give the green light! 🎯
