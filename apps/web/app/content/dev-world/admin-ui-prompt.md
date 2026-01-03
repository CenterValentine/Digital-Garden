# Admin UI Implementation Prompt

## Context

I'm building an admin interface for my Digital Garden website that enables owners/admins to manage the dynamic navigation system we've implemented. The system includes:

- **Categories**: Navigation branches with displayOrder, branchPreset, isPublished
- **Documents**: Content items assigned to categories with displayOrder
- **ViewGrants**: Filtered views (e.g., `?view=portfolio`) for curated navigation

## Design System Foundation

**Color Palette (Digital Garden)**:

- Shale (Depth/Connection): dark #465E73, mid #5A7288, light #6E869D
- Gold (Knowledge/Foundation): primary #C9A86C, dark #B8965A, light #D9B87E
- Leaf (Growth/Success): primary #49A657, light #6BC578, bright #8FE39A
- Intent colors: primary (leaf), secondary (gold), accent (shale), danger, neutral
- All colors available as CSS variables in `app/globals.css`

**Design System Location**:

- Colors: `/lib/design-system/colors.ts`
- CSS Variables: `app/globals.css`
- Tailwind Config: `tailwind.config.js` (uses CSS variables)

**Visual Aesthetic**:

- Organic growth meets technology (circuit board roots + tree branches)
- Neon glows and circuit patterns
- Intent-Role-State pattern for component variants

## Available Components

**1. Custom Components (with intent system)**:

- Button: `/components/ui/button/Button.tsx` - includes Digital Garden variants (leaf, gold, shale, gradients, nav-item)
- Card: `/components/ui/card/Card.tsx` - with intent system
- TreeNode: `/components/ui/tree-node/TreeNode.tsx` - for hierarchical displays

**2. shadcn/ui Components**:

- Located in `/components/ui/` (root level)
- All standard shadcn components: table, dialog, drawer, form, input, select, switch, tabs, command, badge, alert, etc.
- Use Digital Garden CSS variables automatically

**3. Third-Party Component Libraries**:

- Located in `/components/third-party/`
- Aceternity UI: 35+ components (backgrounds, cards, buttons, navigation, forms, modals, data display)
- Dice UI, Glass UI, and others (documented in READMEs)
- All adapted to use Digital Garden design tokens

## Database Schema (Prisma)

```prisma
model Category {
  id              String   @id
  name            String   @unique
  slug            String   @unique
  description     String?
  displayOrder    Int      @default(0)
  branchPreset    String?  // "binary", "trident", "fan", etc.
  isPublished     Boolean  @default(true)
  ownerId         String
  documents       StructuredDocument[]
  viewGrants      ViewGrant[]
}

model StructuredDocument {
  id             String   @id
  title          String
  slug           String   @unique
  docType        String   // "Note", "Project", "Resume", etc.
  contentData    Json     // MDX content
  isPublished    Boolean  @default(false)
  categoryId     String?  // Link to Category
  displayOrder   Int      @default(0)
  parentId       String?  // Hierarchical documents
  // ... other fields
}

model ViewGrant {
  id              String   @id
  viewKey         String   // "portfolio", "family", "tech"
  userId          String?  // Specific user grant
  role            UserRole? // Role-based grant
  categoryId      String?  // Grant entire category
  documentId      String?  // Grant specific document
}
```

## API Endpoints Available

- `GET /api/admin/categories` - List categories (to be created)
- `POST /api/admin/categories` - Create category (to be created)
- `PATCH /api/admin/categories/:id` - Update category (to be created)
- `DELETE /api/admin/categories/:id` - Delete category (to be created)
- `PATCH /api/categories/reorder` - Reorder categories (exists)
- Similar endpoints for documents and viewGrants

**Navigation Queries**:

- `getNavigationTree()` - Full navigation tree
- `getFilteredNavigationTree()` - Filtered by ViewGrant
- Located in `/lib/db/navigation.ts`

## Task: Build Static Admin UI Pages

Create static UI pages (Phase 1) that demonstrate the admin interface design. These will be **read-only** initially, using placeholder/mock data.

### Pages to Create

1. **Admin Dashboard** (`/app/admin/page.tsx`)
   - Stats cards: Total Categories, Total Documents, Published/Unpublished
   - Quick actions: Create Category, Create Document, Create View
   - Recent activity feed (mock data)
   - Use Card components, Button components with intent variants

2. **Category Management** (`/app/admin/categories/page.tsx`)
   - Table/list showing categories with columns:
     - Name, Slug, Display Order, Branch Preset, Published, Document Count
   - Filter by published/unpublished
   - Sort by displayOrder or name
   - "Create Category" button (links to form page)
   - Use Table (shadcn), Badge for status, Button for actions

3. **Category Form** (`/app/admin/categories/new/page.tsx`)
   - Form fields: Name, Slug (auto-generated), Description, Display Order, Branch Preset (select), Published (switch)
   - Use Card for form container, Form components (shadcn), Select for branch preset
   - Button with intent="leaf" for submit, intent="ghost" for cancel

4. **Document Management** (`/app/admin/documents/page.tsx`)
   - Table with columns: Title, Type, Category, Display Order, Published, Updated
   - Filter by category, docType, published status
   - Search by title
   - "Create Document" button
   - Use Table, Command for search, Select for filters

5. **ViewGrant Management** (`/app/admin/views/page.tsx`)
   - Cards showing each viewKey
   - Display: View Key, Description, Grant Count
   - "Create View" button
   - Use Card grid, Badge for counts

### Design Requirements

**Color Usage**:

- Leaf (primary) for create/save actions
- Gold (secondary) for edit/knowledge actions
- Shale (accent) for navigation/connection
- Danger for delete actions

**Layout Pattern**:

```
<AdminLayout>
  <AdminSidebar /> {/* Simple sidebar with nav links */}
  <main className="p-6">
    <PageHeader /> {/* Title, breadcrumbs, primary action */}
    <PageContent /> {/* Main content */}
  </main>
</AdminLayout>
```

**Component Usage**:

- Use `Button` with `intent` prop (leaf, gold, accent, danger, ghost)
- Use `Card` for containers and stat cards
- Use shadcn `Table` for lists
- Use shadcn `Dialog` or `Drawer` for modals (future)
- Use `Badge` for status indicators
- Use design system colors via CSS variables

**Mock Data**:
Create TypeScript interfaces matching the Prisma schema and use mock data arrays for now.

## File Structure to Create

```
apps/web/
├── app/
│   └── admin/
│       ├── layout.tsx              # Admin layout with sidebar
│       ├── page.tsx                # Dashboard
│       ├── categories/
│       │   ├── page.tsx            # Category list
│       │   └── new/
│       │       └── page.tsx        # Category form
│       ├── documents/
│       │   └── page.tsx            # Document list
│       └── views/
│           └── page.tsx            # ViewGrant list
└── components/
    └── admin/
        ├── AdminLayout.tsx         # Layout wrapper
        ├── AdminSidebar.tsx        # Navigation sidebar
        └── StatCard.tsx            # Reusable stat card
```

## Key Files to Reference

- Design system: `/components/ui/README.md`
- Colors: `/lib/design-system/colors.ts`
- Existing navigation: `/components/client/app-nav/IntegratedCircuitNav.tsx`
- Utils: `/lib/utils.tsx` (cn function)

## Success Criteria

✅ All pages use Digital Garden design system colors and components
✅ Layout is consistent across all admin pages
✅ Components use intent variants appropriately
✅ Mock data matches database schema structure
✅ Pages are responsive and accessible
✅ Visual hierarchy is clear and intuitive

## Notes

- Start with static/mock data - no API calls yet
- Focus on visual design and component usage
- Ensure all components use design system tokens
- Make it look polished and professional
- Consider the organic + technology aesthetic in styling choices


