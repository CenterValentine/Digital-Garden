---
epoch: 2
name: "Content Experience"
theme: "Editor, Navigation, User Interactions"
duration: Dec 2025 - Jan 2026 (8 weeks)
status: completed
---

# Epoch 2: Content Experience

## Vision
Transform the static UI into an interactive content workspace with rich text editing, drag-and-drop file organization, and powerful search capabilities.

## Strategic Goals
1. **Interactive File Tree**: Drag-and-drop organization with react-arborist
2. **Rich Text Editing**: TipTap-powered markdown editor with custom extensions
3. **Content Discovery**: Full-text search, tags, and backlink navigation
4. **User Experience**: Keyboard shortcuts, command palette foundations

## Success Metrics
✅ react-arborist file tree with virtualization
✅ TipTap editor with 5+ custom extensions
✅ Full-text search across all content
✅ Tag system with colors and counts
✅ Backlink tracking and navigation

## Sprints

### Sprint 7-8: File Tree with Drag-and-Drop (M4)
**Duration**: Dec 2-15, 2025
**Goal**: Interactive file tree with server/client architecture
**Deliverables**:
- react-arborist integration with virtualization
- Drag-and-drop reordering with `displayOrder`
- Context menu (13 actions)
- Server component patterns with Suspense

**Key Components**:
- `components/content/left-sidebar/FileTree.tsx` - Client component
- `components/content/left-sidebar/FileTreeWrapper.tsx` - Server wrapper
- `state/tree-state-store.ts` - Expanded/collapsed persistence
- `state/context-menu-store.ts` - Right-click menu state

**Technical Patterns**:
- Server skeleton → Client progressive enhancement
- Inline SVG icons (not lucide-react) for server components
- Portal rendering for context menus
- Tree state persistence across reloads

**Outcomes**:
- 1000+ node virtualization
- <100ms drag-and-drop response
- 13 context menu actions (create, rename, delete, copy, cut, paste, etc.)
- Persistent tree expansion state

### Sprint 9-10: TipTap Editor Integration (M5)
**Duration**: Dec 16-29, 2025
**Goal**: Rich text editor with markdown shortcuts
**Deliverables**:
- TipTap 3.15.3 integration
- Auto-save with 2-second debounce
- Markdown input rules
- Character count and reading time

**Editor Extensions**:
- StarterKit (headings, lists, blockquotes, etc.)
- CodeBlockLowlight (50+ languages)
- Link (external links in new tab)
- Table (create, edit, add/delete rows/columns)
- Image (inline image support)
- TaskList + TaskItem (checkboxes)
- CharacterCount (words, characters, reading time)

**Markdown Shortcuts**:
- `#` → H1, `##` → H2, `###` → H3
- `-` → bullet list
- `1.` → ordered list
- `> ` → blockquote
- ` ``` ` → code block

**Auto-Save Flow**:
1. User types → 2-second debounce
2. Save indicator turns yellow
3. API call to PATCH endpoint
4. Save indicator turns green
5. Toast notification on error

**Outcomes**:
- Real-time character count in status bar
- Visual save indicator (yellow → green)
- 50+ language syntax highlighting
- Markdown compatibility for export

### Sprint 11-13: Search, Tags, Backlinks (M6)
**Duration**: Dec 30, 2025 - Jan 19, 2026
**Goal**: Content discovery and navigation
**Deliverables**:
- Full-text search with filters
- Tag system with colors
- Backlink tracking
- Outline panel
- Custom TipTap extensions (wiki-links, callouts)

**Search System**:
- `GET /api/content/search` - Full-text search endpoint
- `searchText` field in ContentNode (auto-generated)
- Filter by: content type, tags, date range, folder
- Recent searches tracking in store

**Tag System**:
- `Tag` model with name, color, slug
- `ContentTag` junction table (many-to-many)
- Tag creation via API or inline in editor
- Tag count and usage statistics
- Color picker with presets

**Backlink System**:
- Wiki-link syntax: `[[Note Title]]` or `[[slug|Display]]`
- Backlink extraction from TipTap JSON
- `GET /api/content/backlinks?contentId={id}` endpoint
- Backlink panel in right sidebar

**Custom TipTap Extensions**:
1. **WikiLink** (`extensions/wiki-link.ts`)
   - `[[Note Title]]` syntax
   - Autocomplete suggestions
   - Click navigation to linked notes
   - Renders as blue underlined link

2. **Callout** (`extensions/callout.ts`)
   - Obsidian-style `> [!note]`, `> [!warning]`, etc.
   - 6 types: note, tip, warning, danger, info, success
   - Colored borders and icons
   - Collapsible with `> [!note]-` syntax

3. **SlashCommands** (`commands/slash-commands.tsx`)
   - `/` menu for quick insertion
   - Headings, code blocks, tables, callouts, task lists
   - Keyboard navigation (↑↓ to select, Enter to insert)

4. **TaskListInputRule** (`extensions/task-list.ts`)
   - Auto-format `- [ ]` → task list
   - `- [x]` → checked task

5. **BulletListBackspace** (`extensions/bullet-list.ts`)
   - Backspace in empty bullet → plain text "-"
   - Obsidian-style behavior

**Outline Panel**:
- Extract heading hierarchy from TipTap JSON
- Active heading tracking
- Click to scroll to heading
- Nested indentation for H1→H2→H3

**Outcomes**:
- Sub-200ms search response time
- 100+ tags with colors and counts
- Bi-directional wiki-link navigation
- 5 custom TipTap extensions
- Real-time outline generation

## Technical Achievements
- **File Tree**: react-arborist with server/client split and virtualization
- **Editor**: TipTap with 13+ extensions (8 built-in + 5 custom)
- **Search**: Full-text search with `searchText` field optimization
- **Tags**: Many-to-many with colors and usage tracking
- **Extensions**: Custom wiki-links, callouts, slash commands

## Risks Encountered & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| react-arborist TypeScript types | Medium | Custom type definitions |
| TipTap schema evolution | High | Version locking + evolution guide |
| Search performance on large datasets | Medium | `searchText` field indexing |
| Wiki-link circular references | Low | Cycle detection in traversal |

## Lessons Learned
1. **Server/Client Boundaries**: Use Suspense for progressive enhancement
2. **TipTap Extensions**: Follow v3 API patterns strictly
3. **Search Optimization**: Pre-computed `searchText` field beats runtime parsing
4. **State Persistence**: localStorage + zustand for resilient UI state
5. **Context Menus**: Portal rendering prevents overflow clipping

## Metrics
- **Duration**: 8 weeks (7 sprints)
- **Files Created**: ~40 new files
- **Lines of Code**: ~4,000
- **Custom Extensions**: 5 TipTap extensions
- **API Endpoints**: +6 (search, tags, backlinks)

## Related Documentation
- [File Tree Implementation](../../archive/milestones/M4/M4-FILE-TREE-IMPLEMENTATION.md)
- [TipTap Extensions](../../features/editor/tiptap-extensions.md)
- [Search Architecture](../../features/search-tags/search-system.md)
- [Tag System](../../features/search-tags/tag-system.md)

## What's Next
→ **Epoch 3: Media & Storage** - File management, multi-cloud, viewers

---

**Completed**: January 2026
**Mapped from**: M4 (File Tree), M5 (Editor), M6 (Search, Tags, Extensions)
