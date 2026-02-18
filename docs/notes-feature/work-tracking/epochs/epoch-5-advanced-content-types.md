---
epoch: 5
name: "Advanced Content Types"
theme: "Folder views, New payload types"
duration: Feb-Mar 2026 (8 weeks)
status: active
current_sprint: 27
---

# Epoch 5: Advanced Content Types

## Vision
Enable rich, interactive content types beyond notes and files. Support multiple viewing paradigms (kanban, timeline, etc.) and diverse content formats (excalidraw, mermaid, canvas).

## Strategic Goals
1. **Folder Intelligence**: Transform folders from containers → workspaces with 5 view modes
2. **Content Diversity**: Support 10+ content payload types
3. **View Flexibility**: Enable user-chosen visualization modes per folder
4. **Performance**: Maintain <100ms view switching latency

## Success Metrics
- [ ] 5 folder view modes implemented (List, Grid, Kanban, Table, Timeline)
- [ ] 8 new payload types with stub viewers (Excalidraw, Mermaid, Canvas, PDF, Whiteboard, etc.)
- [ ] <100ms view switching latency
- [ ] 90%+ user preference persistence reliability
- [ ] Zero data loss during view switches

## Sprints

### Sprint 27: FolderPayload Implementation 🎯 ACTIVE
**Duration**: Feb 18 - Mar 3, 2026
**Goal**: Implement 5 folder view modes with persistent preferences
**Status**: In Progress (10% complete)

**Deliverables**:
- [ ] **List View**: Traditional file list with sort options
- [ ] **Grid View**: Card-based grid layout with thumbnails
- [ ] **Kanban View**: Drag-and-drop board with status columns
- [ ] **Table View**: Spreadsheet-like data table with filters
- [ ] **Timeline View**: Chronological timeline visualization
- [ ] **View Switcher**: UI component for toggling views
- [ ] **Preference Persistence**: Save view choice per folder

**Work Items**:
- [ ] **FP-001**: List view component (3 pts) - 60% complete
- [ ] **FP-002**: Grid view component (3 pts) - 40% complete
- [ ] **FP-003**: Kanban view component (5 pts)
- [ ] **FP-004**: Table view component (3 pts)
- [ ] **FP-005**: Timeline view component (5 pts)
- [ ] **FP-006**: View preference persistence (2 pts)
- [ ] **FP-007**: View switcher UI (2 pts)

**Technical Approach**:
- FolderPayload model with `defaultView` field
- Per-user view preference override (user settings)
- Shared view component wrapper with lazy loading
- State management via zustand store
- Optimistic UI updates for view switching

**Acceptance Criteria**:
- All 5 views render correctly with test data
- View preference persists across page reloads
- View switching is smooth (<100ms)
- No layout shift during view transitions
- Keyboard shortcuts for view switching (Cmd+1-5)

**See**: [Current Sprint Details](../CURRENT-SPRINT.md)

### Sprint 28: Remaining Payloads (Stubs)
**Duration**: Mar 4-17, 2026
**Goal**: Stub implementations for 5+ new payload types
**Status**: Planned

**Deliverables**:
- [ ] ExcalidrawPayload (whiteboard/diagrams)
- [ ] MermaidPayload (diagrams as code)
- [ ] CanvasPayload (infinite canvas workspace)
- [ ] WhiteboardPayload (collaborative whiteboard)
- [ ] PdfPayload (dedicated PDF with annotations)

**Technical Approach**:
- Stub viewer components (placeholder UI)
- Database schema for each payload type
- API endpoints for CRUD operations
- Context menu integration ("New → [Type]")

**Acceptance Criteria**:
- All payloads have database models
- Stub viewers show placeholder content
- Creation flow works end-to-end
- No crashes when opening stub content

### Sprint 29-30: TBD
**Duration**: Mar 18-31, 2026
**Goal**: Polish, optimization, and backlog items
**Status**: Not planned yet

**Potential Work**:
- Performance tuning for large folders
- UX refinement based on feedback
- Additional view mode (e.g., Calendar view)
- Advanced folder features (sorting, filtering, grouping)

## Dependencies

**Blockers**: None

**Prerequisites**:
- ✅ M9 Phase 1 (Type system refactor) - Complete
- ✅ M9 Phase 2 (ExternalPayload + ContentRole) - Complete
- ✅ Database schema supports FolderPayload

**Integrations**:
- Design system (Liquid Glass)
- State management (zustand)
- Database (Prisma)
- API layer (Next.js routes)

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| View complexity → performance issues | Medium | High | Virtualization, lazy loading, memoization |
| User preference conflicts (multi-device) | Low | Medium | Versioned preference schema, last-write-wins |
| Scope creep (too many view features) | High | Medium | Strict MVP definition per view, defer advanced features |
| Kanban drag-and-drop complexity | Medium | Medium | Use battle-tested library (dnd-kit) |
| Timeline rendering performance | Medium | High | Canvas-based rendering, virtualization |

## Technical Architecture

### FolderPayload Schema
```prisma
model FolderPayload {
  id        String   @id @default(cuid())
  contentId String   @unique
  content   ContentNode @relation(fields: [contentId], references: [id], onDelete: Cascade)

  defaultView FolderView @default(LIST)
  viewConfig  Json?      // View-specific configuration

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum FolderView {
  LIST
  GRID
  KANBAN
  TABLE
  TIMELINE
}
```

### View Preference System
```typescript
// User-level override (in UserSettings)
interface FolderViewPreferences {
  [folderId: string]: {
    view: FolderView;
    config?: Record<string, any>; // View-specific config
  };
}

// Component usage
const viewPreference = useViewPreference(folderId);
const activeView = viewPreference || folder.defaultView;
```

### View Component Pattern
```typescript
// Lazy-loaded view components
const ListView = lazy(() => import('./views/ListView'));
const GridView = lazy(() => import('./views/GridView'));
const KanbanView = lazy(() => import('./views/KanbanView'));
// ...

export function FolderViewer({ folder, children }: Props) {
  const activeView = useActiveView(folder.id);

  return (
    <Suspense fallback={<ViewSkeleton />}>
      {activeView === 'LIST' && <ListView items={children} />}
      {activeView === 'GRID' && <GridView items={children} />}
      {activeView === 'KANBAN' && <KanbanView items={children} />}
      {/* ... */}
    </Suspense>
  );
}
```

## Metrics Tracking

### Velocity (Last 3 Sprints)
- Sprint 24: 18 points
- Sprint 25: 22 points
- Sprint 26: 20 points
- **Average**: 20 points/sprint

### Sprint 27 Progress
- **Capacity**: 21 story points
- **Committed**: 23 story points (slightly over)
- **Completed**: 0 points (just started)
- **Projected Completion**: Mar 3, 2026

### Cumulative Progress (Epoch 5)
- **Total Estimated**: 50-60 story points
- **Completed**: 0 points
- **In Progress**: 23 points (Sprint 27)
- **Remaining**: ~30-40 points

## Related Documentation

### Architecture
- [Database Design](../../core/03-database-design.md#folderpayload)
- [Content Types](../../core/08-content-types.md#folder-views)
- [UI Components](../../core/06-ui-components.md#folder-viewers)

### Implementation Guides
- [Adding New Content Types](../../reference/ADDING-NEW-CONTENT-TYPES.md)
- [Folder Architecture](../../features/content-types/folders.md) (to be created)

### Previous Epochs
- [Epoch 4: Export & Extensibility](../history/epoch-4-export-extensibility.md)
- [Epoch 3: Media & Storage](../history/epoch-3-media-storage.md)

## Changelog

**Feb 18, 2026**: Epoch 5 kickoff, Sprint 27 started
- Created FolderPayload schema
- Started List view implementation
- Set up view preference store

---

**Status**: Active (Sprint 27 in progress)
**Next Review**: Mar 3, 2026 (Sprint 27 retrospective)
