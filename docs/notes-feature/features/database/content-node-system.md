# ContentNode System

**Polymorphic content architecture** with hybrid type-safe patterns.

## Overview

The ContentNode system is the foundation of the Digital Garden Content IDE. It implements a **hybrid polymorphic pattern** where a single `ContentNode` table acts as a universal container for all content types, with type-specific data stored in separate payload tables.

**Key Concept**: Every piece of content (note, file, folder, code, HTML, external link) is a ContentNode with exactly one typed payload relation.

## Core Pattern

```
ContentNode (universal container)
├─ id, title, slug, contentType
├─ parentId (hierarchical structure)
├─ displayOrder (sibling ordering)
└─ One of:
   ├─ NotePayload (rich text)
   ├─ FilePayload (binary files)
   ├─ CodePayload (code snippets)
   ├─ HtmlPayload (rendered HTML)
   ├─ ExternalPayload (bookmarks)
   └─ FolderPayload (coming soon)
```

## Schema Design

### ContentNode Model

```prisma
model ContentNode {
  id          String       @id @default(cuid())
  title       String
  slug        String
  contentType ContentType
  parentId    String?
  parent      ContentNode? @relation("ContentHierarchy", fields: [parentId], references: [id])
  children    ContentNode[] @relation("ContentHierarchy")

  displayOrder Int         @default(0)
  customIcon   String?
  iconColor    String?

  // Soft delete
  deletedAt    DateTime?
  deletedBy    String?

  // Search
  searchText   String?     // Auto-generated from content

  // Relations (exactly one will be non-null)
  notePayload     NotePayload?
  filePayload     FilePayload?
  codePayload     CodePayload?
  htmlPayload     HtmlPayload?
  externalPayload ExternalPayload?
  folderPayload   FolderPayload?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([parentId, displayOrder])
  @@index([contentType])
}

enum ContentType {
  FOLDER
  NOTE
  FILE
  CODE
  HTML
  EXTERNAL
}
```

## Type Safety

### Discriminated Union Pattern

```typescript
type ContentNode =
  | { type: ContentType.NOTE; payload: NotePayload }
  | { type: ContentType.FILE; payload: FilePayload }
  | { type: ContentType.CODE; payload: CodePayload }
  | { type: ContentType.HTML; payload: HtmlPayload }
  | { type: ContentType.EXTERNAL; payload: ExternalPayload }
  | { type: ContentType.FOLDER; payload: null };
```

**Benefits**:
- TypeScript narrows payload type based on `contentType`
- Compile-time prevention of impossible states
- Exhaustive type checking in switch statements

### Type Derivation Rules

1. **Folders**: No payload (children determine structure)
2. **Notes**: Always have `NotePayload` with TipTap JSON
3. **Files**: Always have `FilePayload` with storage metadata
4. **Code**: Always have `CodePayload` with language and code text
5. **HTML**: Always have `HtmlPayload` with raw HTML string
6. **External**: Always have `ExternalPayload` with URL and Open Graph data

## Hierarchical Structure

### Parent-Child Relations

```
Root (parentId: null)
├─ Documents (FOLDER)
│  ├─ Meeting Notes (NOTE)
│  └─ Presentations (FOLDER)
│     └─ Q1-2026.pptx (FILE)
├─ Projects (FOLDER)
│  ├─ Digital Garden (NOTE)
│  └─ Code Snippets (FOLDER)
│     └─ API Example (CODE)
└─ Bookmarks (FOLDER)
   └─ Documentation (EXTERNAL)
```

### Display Order

Siblings are ordered using `displayOrder` field:

```typescript
// Drag Item B above Item A
await updateDisplayOrder({
  nodeId: 'B',
  newDisplayOrder: A.displayOrder - 1
});

// Reorder affected siblings
await resequenceDisplayOrder(parentId);
```

**Algorithm**: `displayOrder` starts at 0 and increments. When an item is moved, it gets a new order value, and siblings are resequenced to maintain integrity.

## Search System

### Search Text Generation

The `searchText` field is auto-generated from content:

```typescript
function generateSearchText(node: ContentNode): string {
  let text = `${node.title} ${node.slug}`;

  if (node.notePayload) {
    text += ` ${extractTextFromTipTap(node.notePayload.content)}`;
  } else if (node.filePayload) {
    text += ` ${node.filePayload.filename} ${node.filePayload.mimeType}`;
  } else if (node.codePayload) {
    text += ` ${node.codePayload.code} ${node.codePayload.language}`;
  }
  // ... other types

  return text.toLowerCase();
}
```

**Index**: `searchText` field has a database index for fast full-text search.

## Soft Delete

Nodes are never permanently deleted immediately:

```typescript
// Soft delete
await prisma.contentNode.update({
  where: { id },
  data: {
    deletedAt: new Date(),
    deletedBy: userId,
  },
});

// Permanent delete (scheduled job)
await prisma.contentNode.deleteMany({
  where: {
    deletedAt: { lt: thirtyDaysAgo },
  },
});
```

**Recovery**: Soft-deleted items can be restored within 30 days.

## Custom Icons & Colors

Each node can have a custom icon and color:

```typescript
interface CustomIcon {
  customIcon?: string; // lucide-react icon name or emoji
  iconColor?: string;  // hex color code
}

// Example:
{
  customIcon: 'FileText',
  iconColor: '#FF5733'
}
```

**Rendering**: File tree uses these values to override default icons.

## Migration & Versioning

### Adding New Content Types

1. Add enum value to `ContentType`
2. Create new payload model
3. Add relation to `ContentNode`
4. Create database migration
5. Update TypeScript types
6. Implement viewer/editor components

**See**: [Adding New Content Types](../../reference/ADDING-NEW-CONTENT-TYPES.md)

## Performance Considerations

**Indexes**:
- `parentId, displayOrder` (hierarchical queries)
- `contentType` (type filtering)
- `searchText` (full-text search)
- `deletedAt` (exclude soft-deleted)

**Query Optimization**:
- Use `include` to fetch payload in single query
- Limit depth for recursive tree queries
- Paginate large result sets

## Related Documentation

- [Typed Payloads](typed-payloads.md) - Individual payload schemas
- [Database Design](../../core/03-database-design.md) - Complete schema
- [API Specification](../../core/04-api-specification.md) - CRUD endpoints

---

**Implemented**: Epoch 1 (M1 - Foundation)
**Last Updated**: Feb 18, 2026
