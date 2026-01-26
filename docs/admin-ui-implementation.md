# Admin UI Implementation Plan

## Database-Driven Navigation Management Interface

This document outlines the implementation plan for building the admin/owner UI that enables CRUD operations for the dynamic navigation system we've built.

---

## Context: What We've Built

### Database Schema

- **Category Table**: Navigation categories with `displayOrder`, `branchPreset`, `isPublished`
- **ViewGrant Table**: Filtered views via query string (e.g., `?view=portfolio`)
- **StructuredDocument**: Extended with `categoryId` and `displayOrder`
- **Navigation Queries**: `getNavigationTree()`, `getFilteredNavigationTree()` in `lib/db/navigation.ts`
- **API Endpoints**: `/api/categories/reorder`, `/api/documents/reorder`

### Design System Foundation

- **Color Palette**: Shale (depth), Gold (knowledge), Leaf (growth)
- **Intent-Role-State Pattern**: Semantic component variants
- **Components**: Custom (Button, Card, Prose), shadcn/ui (full suite), Third-party (Aceternity, Dice UI, etc.)
- **Visual Aesthetic**: Organic growth meets technology (circuit board + tree branches)

---

## UI Requirements

### 1. Category Management Page (`/admin/categories`)

**Purpose**: Create, edit, delete, and reorder navigation categories

**Features**:

- **List View**: Table/card grid showing all categories
  - Columns: Name, Slug, Display Order, Branch Preset, Published Status, Document Count
  - Sortable by displayOrder, name, document count
  - Filter by published/unpublished
- **Create/Edit Form**: Modal or side panel
  - Fields: Name, Slug (auto-generated), Description, Display Order, Branch Preset (dropdown), Published toggle
  - Validation: Unique name/slug, displayOrder 0-100
- **Reorder Interface**: Drag-and-drop or up/down arrows
  - Visual preview of navigation tree
  - Real-time updates via API
- **Delete**: Confirmation dialog with cascade warning (documents will be orphaned)

**Components to Use**:

- `Table` (shadcn) for list view
- `Dialog` or `Drawer` (shadcn) for create/edit
- `Select` (shadcn) for branch preset dropdown
- `Switch` (shadcn) for published toggle
- `Button` (custom) with intent variants
- `Card` (custom) for category cards if using grid view
- Drag-and-drop: Consider `@dnd-kit/core` or similar

**Design Notes**:

- Use Leaf intent for create/save actions (growth)
- Use Gold intent for edit actions (knowledge)
- Use Danger intent for delete
- Show branch preset preview (small visual indicator)
- Display order conflicts should show warning badge

---

### 2. Document Management Page (`/admin/documents`)

**Purpose**: Create, edit, delete, and organize documents within categories

**Features**:

- **List View**: Table with filtering
  - Columns: Title, Type, Category, Display Order, Published, Updated
  - Filter by category, docType, published status
  - Search by title/slug
- **Create/Edit Form**: Full-page or large modal
  - Fields: Title, Slug, Doc Type (dropdown), Category (select), Parent Document (optional), Display Order, Content (MDX editor), Published toggle
  - Rich text editor for content (MDX support)
  - Preview pane for content
- **Category Assignment**: Drag documents between categories or select dropdown
- **Hierarchical View**: Tree view showing parent-child relationships
- **Bulk Actions**: Publish/unpublish multiple, assign to category

**Components to Use**:

- `Table` (shadcn) with expandable rows for hierarchy
- `Command` (shadcn) for search/filter
- `Tabs` (shadcn) for edit/preview split view
- `Textarea` or MDX editor component
- `Tree` component (custom TreeNode) for hierarchical view
- `Checkbox` (shadcn) for bulk selection

**Design Notes**:

- Use Shale colors for document cards (depth/connection)
- Show category badge with color coding
- Display order within category context
- Preview should match public rendering

---

### 3. ViewGrant Management Page (`/admin/views`)

**Purpose**: Create and manage filtered views (e.g., `?view=portfolio`)

**Features**:

- **View List**: Cards showing each viewKey
  - Display: View Key, Description, Grant Count, Preview Link
- **Create View**: Form to create new viewKey
  - Fields: View Key (slug), Description
- **Grant Manager**: Per-view interface
  - **Category Grants**: Checkbox list of categories to include
  - **Document Grants**: Searchable list to cherry-pick documents
  - **Role Grants**: Checkboxes for roles (guest, member, admin)
  - **User Grants**: Search/select specific users
  - Visual preview of what will be shown
- **Test View**: Button to open `?view=viewKey` in new tab

**Components to Use**:

- `Card` (custom) for view cards
- `Tabs` (shadcn) for category/document/role/user grant sections
- `Checkbox` (shadcn) for multi-select
- `Command` (shadcn) for searchable document/user lists
- `Badge` (shadcn) for grant counts
- `Button` with link variant for preview

**Design Notes**:

- Use Accent (Shale) colors for view management (connection)
- Show grant summary with counts
- Visual tree preview of filtered navigation
- Clear distinction between category grants (all docs) vs document grants (specific)

---

### 4. Navigation Preview Page (`/admin/navigation-preview`)

**Purpose**: Visual preview of navigation tree with real-time updates

**Features**:

- **Live Preview**: Rendered `IntegratedCircuitNav` component
- **View Selector**: Dropdown to preview different viewKeys
- **Edit Mode**: Click categories/documents to edit
- **Order Visualization**: Show displayOrder values on branches
- **Branch Preset Preview**: Visual indicators for each preset type

**Components to Use**:

- `IntegratedCircuitNav` (existing component)
- `Select` (shadcn) for view selector
- `Card` (custom) for info panel
- `Badge` (shadcn) for preset labels

**Design Notes**:

- Full-screen or large container
- Side panel for editing selected item
- Real-time updates as changes are made
- Color-code by category or preset

---

### 5. Dashboard/Overview (`/admin`)

**Purpose**: Central hub with stats and quick actions

**Features**:

- **Stats Cards**:
  - Total Categories, Total Documents, Published/Unpublished counts
  - ViewGrant count, Recent activity
- **Quick Actions**:
  - Create Category, Create Document, Create View
  - Recent items (last edited)
- **Activity Feed**: Recent changes to categories/documents
- **Navigation Health**: Warnings for conflicts, orphaned documents, etc.

**Components to Use**:

- `Card` (custom) for stat cards
- `Button` (custom) for quick actions
- `Table` (shadcn) for activity feed
- `Alert` (shadcn) for warnings
- Charts (if available) for stats visualization

**Design Notes**:

- Use Gold colors for dashboard (foundation/knowledge)
- Clear visual hierarchy
- Actionable items prominent
- Status indicators with appropriate colors

---

## Design System Integration

### Color Usage Guidelines

**Intent Mapping**:

- **Leaf (Primary)**: Create, Save, Success actions
- **Gold (Secondary)**: Edit, Update, Knowledge-related
- **Shale (Accent)**: Navigation, Connection, Depth
- **Danger**: Delete, Destructive actions
- **Neutral**: Secondary info, disabled states

**Component Variants**:

- Use `intent="leaf"` for growth actions (create, publish)
- Use `intent="gold"` for knowledge actions (edit, view)
- Use `intent="accent"` for navigation/connection actions
- Use `intent="danger"` for delete actions
- Use `intent="ghost"` for cancel/secondary actions

### Layout Patterns

**Page Structure**:

```
<AdminLayout>
  <AdminSidebar /> {/* Navigation */}
  <main>
    <PageHeader /> {/* Title, breadcrumbs, actions */}
    <PageContent /> {/* Main content */}
  </main>
</AdminLayout>
```

**Form Patterns**:

- Use `Card` with `CardHeader`, `CardContent`, `CardFooter`
- Form fields in `CardContent`
- Actions in `CardFooter`
- Validation errors inline with fields

**List Patterns**:

- `Table` for tabular data
- `Card` grid for visual items
- `Command` for search/filter
- Pagination for large lists

---

## Technical Implementation Notes

### API Integration

**Endpoints to Create**:

- `GET /api/admin/categories` - List all categories
- `POST /api/admin/categories` - Create category
- `PATCH /api/admin/categories/:id` - Update category
- `DELETE /api/admin/categories/:id` - Delete category
- `PATCH /api/admin/categories/reorder` - Bulk reorder (already exists)
- Similar for documents and viewGrants

**Authentication**:

- All admin routes require `requireRole('admin')` or `requireRole('owner')`
- Use `getCurrentUser()` to check permissions
- Show 403/redirect if insufficient permissions

### State Management

**Options**:

- React Server Components for data fetching (preferred)
- React Query for client-side caching if needed
- Optimistic updates for reordering
- Form state with React Hook Form

### Real-time Updates

**Considerations**:

- WebSocket for live preview updates (optional)
- Polling for activity feed
- Optimistic UI updates for better UX

---

## File Structure

```

├── app/
│   └── admin/
│       ├── page.tsx                    # Dashboard
│       ├── categories/
│       │   ├── page.tsx                # List view
│       │   ├── [id]/
│       │   │   └── page.tsx            # Edit view
│       │   └── new/
│       │       └── page.tsx            # Create view
│       ├── documents/
│       │   ├── page.tsx                # List view
│       │   ├── [id]/
│       │   │   └── page.tsx            # Edit view
│       │   └── new/
│       │       └── page.tsx            # Create view
│       ├── views/
│       │   ├── page.tsx                # View list
│       │   └── [viewKey]/
│       │       └── page.tsx            # Grant manager
│       └── navigation-preview/
│           └── page.tsx                # Live preview
├── components/
│   └── admin/
│       ├── AdminLayout.tsx             # Layout wrapper
│       ├── AdminSidebar.tsx            # Navigation sidebar
│       ├── CategoryForm.tsx            # Category create/edit form
│       ├── DocumentForm.tsx             # Document create/edit form
│       ├── ViewGrantManager.tsx        # ViewGrant interface
│       └── NavigationPreview.tsx       # Preview component
└── app/api/admin/
    ├── categories/
    │   ├── route.ts                    # GET, POST
    │   └── [id]/
    │       └── route.ts                # PATCH, DELETE
    ├── documents/
    │   └── [similar structure]
    └── views/
        └── [similar structure]
```

---

## Implementation Phases

### Phase 1: Foundation (Static UI)

1. Create admin layout and sidebar
2. Build dashboard with placeholder data
3. Create category list page (read-only)
4. Create document list page (read-only)
5. Style with design system

### Phase 2: Category Management

1. Category create/edit forms
2. Category API endpoints
3. Reorder interface
4. Delete with confirmation
5. Real-time preview integration

### Phase 3: Document Management

1. Document create/edit forms
2. Document API endpoints
3. Category assignment
4. Hierarchical view
5. MDX editor integration

### Phase 4: ViewGrant Management

1. View list and creation
2. Grant manager interface
3. ViewGrant API endpoints
4. Preview functionality
5. Role/user grant management

### Phase 5: Polish & Optimization

1. Real-time updates
2. Optimistic UI
3. Error handling
4. Loading states
5. Accessibility audit

---

## Design Mockups Considerations

**Visual Hierarchy**:

- Clear page headers with actions
- Consistent spacing using design tokens
- Status indicators (published badges, conflict warnings)
- Loading skeletons for async data

**Interactions**:

- Smooth transitions for reordering
- Confirmation dialogs for destructive actions
- Toast notifications for success/errors
- Inline validation feedback

**Responsive Design**:

- Mobile-friendly tables (card view on small screens)
- Collapsible sidebar
- Stack forms on mobile
- Touch-friendly drag-and-drop

---

## Success Criteria

✅ Owner/admin can create and manage categories
✅ Owner/admin can create and manage documents
✅ Owner/admin can assign documents to categories
✅ Owner/admin can reorder categories and documents
✅ Owner/admin can create and manage ViewGrants
✅ Navigation preview updates in real-time
✅ All operations use design system components
✅ UI matches Digital Garden aesthetic
✅ Forms validate properly
✅ Error states are handled gracefully

---

## Next Steps

1. **Review this plan** and adjust requirements
2. **Create static UI mockups** for each page (Phase 1)
3. **Implement API endpoints** for CRUD operations
4. **Build forms and validation**
5. **Integrate with existing navigation system**
6. **Test with real data**
7. **Polish and optimize**

---

## Questions to Resolve

- [ ] Should we use a form library (React Hook Form) or native forms?
- [ ] Do we need a rich text editor for documents, or is MDX sufficient?
- [ ] Should reordering be drag-and-drop or arrow buttons?
- [ ] Do we need real-time collaboration features?
- [ ] Should there be a "draft" state beyond published/unpublished?
- [ ] How should we handle document versioning/history in the UI?
