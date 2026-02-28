---
last_updated: 2026-02-27
---

# Sprint Backlog

**Prioritized work items for upcoming sprints**

## Sprint 28: Advanced Folder Views + Payload Stubs
**Duration**: Mar 4-17, 2026 (Planned)
**Estimated**: 20-25 story points

### Backlogged from Sprint 27 (4 items, 12 points)
**Context**: Core folder views (List, Grid, Kanban) shipped in Sprint 27. These advanced features deferred as nice-to-have.

- [ ] **FP-004**: Table view component (3 pts) - Advanced folder view
  - Sortable columns (name, type, size, date)
  - Column resize and reorder
  - Row selection (multi-select)
  - Filter controls

- [ ] **FP-005**: Timeline view component (5 pts) - Advanced folder view
  - Chronological visualization
  - Date grouping (day, week, month)
  - Zoom controls
  - Event markers

- [ ] **FP-006**: View preference persistence (2 pts) - Enhancement
  - User settings integration
  - Per-folder preference storage
  - Fallback to folder default view

- [ ] **FP-007**: View switcher UI (2 pts) - Enhancement
  - View mode toggle buttons
  - Active view indicator
  - Keyboard shortcuts (Cmd+1-5)

### High Priority (Payload Stubs)

- [ ] **EX-001**: ExcalidrawPayload schema and model (2 pts)
  - Database model with Prisma schema
  - JSON storage for drawing data
  - Basic CRUD operations

- [ ] **EX-002**: Excalidraw stub viewer component (3 pts)
  - Placeholder UI with "Coming Soon" message
  - Preview thumbnail (if available)
  - Action buttons (edit, delete, export)

- [ ] **MR-001**: MermaidPayload schema and model (2 pts)
  - Database model for diagram-as-code
  - Text storage for Mermaid syntax
  - Basic CRUD operations

- [ ] **MR-002**: Mermaid stub viewer component (3 pts)
  - Placeholder UI
  - Code preview (read-only)
  - Future: Live rendering with mermaid.js

- [ ] **CV-001**: CanvasPayload schema and model (2 pts)
  - Database model for infinite canvas
  - JSON storage for canvas state
  - Basic CRUD operations

- [ ] **CV-002**: Canvas stub viewer component (3 pts)
  - Placeholder UI
  - Thumbnail preview
  - Future: Integration with tldraw or react-flow

### Medium Priority

- [ ] **WB-001**: WhiteboardPayload schema and model (2 pts)
  - Database model for whiteboard
  - JSON storage for whiteboard data
  - Basic CRUD operations

- [ ] **WB-002**: Whiteboard stub viewer component (3 pts)
  - Placeholder UI
  - Future: Real-time collaboration support

- [ ] **PDF-001**: Dedicated PdfPayload schema (2 pts)
  - Separate from FilePayload
  - Annotation storage support
  - Metadata extraction

- [ ] **PDF-002**: PDF stub viewer with annotations (5 pts)
  - Enhanced viewer beyond basic FilePayload
  - Annotation UI (placeholder)
  - Future: PDF.js with annotation layer

### Context Menu Integration

- [ ] **CM-001**: Add "New → Excalidraw" menu item (1 pt)
- [ ] **CM-002**: Add "New → Mermaid Diagram" menu item (1 pt)
- [ ] **CM-003**: Add "New → Canvas" menu item (1 pt)
- [ ] **CM-004**: Add "New → Whiteboard" menu item (1 pt)

### API Endpoints

- [ ] **API-001**: Create payload endpoints for all new types (3 pts)
  - POST /api/content/content (update to support new types)
  - Validation for each payload type
  - Error handling

## Sprint 29: Tool Surfaces Architecture ✅ COMPLETE
**Duration**: Feb 19-24, 2026 (Completed)
**Branch**: `content/tool-surfaces`
**Plan**: `~/.claude/plans/breezy-doodling-babbage.md`

Declarative tool registry mapping tools to UI surfaces (toolbar, toolbelt, sidebar-tab) with content-type filtering. See `lib/domain/tools/`.

- [x] Pure types (ToolSurface, ToolDefinition, ToolInstance, ToolQuery)
- [x] Static registry + queryTools() filter/sort
- [x] ToolSurfaceProvider context + handler registration
- [x] ContentToolbar component (export, copy link)
- [x] BubbleMenu wired to registry (module-level, no hooks) + focus fix
- [x] RightSidebarHeader wired to registry (dynamic tabs by content type)
- [x] ToolDebugPanel (dev-only, Cmd+Shift+T)

## Sprint 30: Universal Expandable TipTap Editor ✅ COMPLETE
**Duration**: Feb 25, 2026
**Branch**: `content/universal-notes`
**Plan**: `~/.claude/plans/sleepy-jingling-quiche.md` (Sprint 30 section)

Every content type gets a collapsible TipTap editor for annotations/notes. Centralized integration in MainPanelContent (not per-viewer).

- [x] **UE-001**: ExpandableEditor component (5 pts)
  - `components/content/editor/ExpandableEditor.tsx`
  - Reuses MarkdownEditor with compact mode
  - Per-node expansion state in localStorage
  - Word count badge when content exists

- [x] **UE-002**: Integrate into MainPanelContent (5 pts)
  - Centralized: wraps all non-note viewers with ExpandableEditor
  - No per-viewer modifications needed
  - Uses existing noteContent + handleSave from MainPanelContent

- [x] **UE-003**: MarkdownEditor compact mode (3 pts)
  - `compact` prop: smaller prose, compact padding (120px min-height)
  - `placeholder` prop accepted (not yet wired through extension factory)

- [x] **UE-004**: API upsert for notePayload (2 pts)
  - PATCH uses `prisma.notePayload.upsert()` (was conditional update)
  - Any content type can now create/update notes via API

**Known Issues**: None remaining (BubbleMenu regression fixed in Sprint 32)

## Sprint 31: Lossless Export/Import Round-Trip ✅ COMPLETE
**Duration**: Feb 25-26, 2026 (Completed)
**Branch**: `content/universal-notes`

Lossless export/import round-trip. Custom two-pass parser, sidecar consumption, toolbar integration.

- [x] **IM-001**: Markdown→TipTap parser — core syntax (5 pts)
- [x] **IM-002**: Markdown→TipTap parser — semantic extensions (5 pts)
- [x] **IM-003**: Sidecar reader — metadata restoration (3 pts)
- [x] **IM-004**: Import API endpoint (3 pts)
- [x] **IM-005**: Import button in ContentToolbar (2 pts)
- [x] **IM-006**: Round-trip verification utility (2 pts)

**Pending**: Manual testing (macOS Finder file picker not working)

## Sprint 32: Editor Stability & Polish ✅ COMPLETE
**Duration**: Feb 26-27, 2026 (Completed)
**Branch**: `content/sprint-32`
**Plan**: `~/.claude/plans/breezy-doodling-babbage.md`

Post-feature stability sprint. Fixed regressions from Sprints 29-31.

- [x] **BM-001**: BubbleMenu cross-contamination fix (5 pts)
  - Root cause: TipTap React wrapper uses shared `"bubbleMenu"` meta key for all instances
  - TableBubbleMenu's inline `shouldShow` overwrote text BubbleMenu's `shouldShow` on every re-render
  - Fix: Stable module-level `shouldShow` for both menus; removed `.focus()` from commands; removed invalid `tippyOptions`
- [x] **OL-001**: Outline click-to-scroll (3 pts)
  - CustomEvent bridge (`scroll-to-heading`) from RightSidebarContent to MarkdownEditor
  - Text+level matching via `editor.state.doc.descendants()`
  - `activeHeadingId` state in outline store for highlight sync
- [x] **BF-001**: ExpandableEditor tag/wiki-link threading (3 pts)
  - Threaded `fetchTags`, `createTag`, `fetchNotesForWikiLink`, `onWikiLinkClick` from MainPanelContent → ExpandableEditor → MarkdownEditor
- [x] **BF-002**: Keyboard event scoping (1 pt)
  - `onKeyDown` stopPropagation on ExpandableEditor container
- [x] **BF-003**: Tag/heading `# ` input rule conflict (2 pts)
  - Space with empty query propagates to ProseMirror heading input rule
  - Space with non-empty query + items selects tag
- [x] **BF-004**: tag-suggestion runtime error guard (1 pt)
  - Guard `component?.ref` against undefined in `onKeyDown`

## Sprint 33+: TBD
**Estimated**: 18-22 story points

### Potential Work Items

**Performance & Optimization**:
- [ ] Folder view performance tuning for large folders (5 pts)
- [ ] Virtualization for grid and kanban views (3 pts)
- [ ] Lazy loading for timeline view (3 pts)

**UX Refinements**:
- [ ] Folder view keyboard shortcuts (Cmd+1-5) (2 pts)
- [ ] View transition animations (2 pts)
- [ ] Empty state designs for all views (2 pts)

**Advanced Features**:
- [ ] Folder sorting and filtering UI (3 pts)
- [ ] Custom kanban columns (5 pts)
- [ ] Timeline zoom controls (3 pts)

**Documentation**:
- [ ] Feature documentation for folder views (2 pts)
- [ ] User guide for new content types (2 pts)
- [ ] API documentation updates (1 pt)

## Future Backlog (Epoch 6+)

### Collaboration Features
- [ ] Real-time multiplayer editing (Yjs integration)
- [ ] Share links with permissions (view, edit, comment)
- [ ] Collaborative cursors and presence indicators
- [ ] Comment threads on content
- [ ] Activity feed and notifications

### AI Integration
- [ ] AI chat interface within IDE
- [ ] Semantic search with embeddings
- [ ] AI-powered autocomplete and suggestions
- [ ] Content summarization
- [ ] Smart tagging and categorization

### Advanced Editor Features
- [ ] Inline code execution (JavaScript, Python)
- [ ] Embed external content (tweets, GitHub gists, CodePen)
- [ ] Version history with diff view
- [ ] Advanced table features (formulas, charts)
- [ ] Handwriting/drawing support

### Mobile & PWA
- [ ] Mobile-responsive layout
- [ ] Touch gesture support
- [ ] Offline mode with service workers
- [ ] Native mobile apps (React Native)

### Integrations
- [ ] Google Drive sync
- [ ] Dropbox integration
- [ ] GitHub repository sync
- [ ] Notion import/export
- [ ] Slack notifications

## Deferred / Icebox

**Low Priority**:
- Calendar view for folders (nice-to-have)
- Advanced search filters (beyond current implementation)
- Bulk operations (multi-select + batch actions)
- Custom themes (beyond Liquid Glass)
- Plugin system for community extensions

## Estimation Reference

**Story Points**:
- 1 pt: Simple task (<2 hours)
- 2 pts: Small task (2-4 hours)
- 3 pts: Medium task (4-8 hours)
- 5 pts: Large task (1-2 days)
- 8 pts: Very large task (2-3 days)
- 13 pts: Epic (needs breakdown)

**Velocity Target**: 18-22 points/sprint (2-week sprints)

---

**Last Updated**: Feb 24, 2026
**Next Review**: After Sprint 30 completion
