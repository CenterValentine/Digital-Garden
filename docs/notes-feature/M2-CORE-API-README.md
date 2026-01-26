# M2: Core API - Implementation Complete

**Milestone 2** of the Notes Feature implementation is complete. This establishes the core API layer for content management, file uploads, and storage configuration.

## What Was Built

### API Routes Created

#### Content Management
- **GET /api/content/content** - List content items with filtering, search, pagination
- **POST /api/content/content** - Create notes, folders, HTML pages, code files
- **GET /api/content/content/[id]** - Get full content with payload data
- **PATCH /api/content/content/[id]** - Update content (title, payload, metadata)
- **DELETE /api/content/content/[id]** - Soft delete (move to trash with 30-day retention)

#### File Tree
- **GET /api/content/content/tree** - Get hierarchical tree structure with metadata

#### Content Operations
- **POST /api/content/content/move** - Move/reorder content (drag-and-drop support)

#### File Upload (Two-Phase)
- **POST /api/content/content/upload/initiate** - Phase 1: Create ContentNode, get presigned URL
- **POST /api/content/content/upload/finalize** - Phase 2: Verify upload, extract metadata

#### Storage Configuration
- **GET /api/content/storage** - List storage provider configurations
- **POST /api/content/storage** - Create storage configuration (R2, S3, Vercel)
- **GET /api/content/storage/[id]** - Get storage configuration details
- **PATCH /api/content/storage/[id]** - Update storage configuration
- **DELETE /api/content/storage/[id]** - Delete storage configuration (with validation)

## File Structure

```
app/api/content/
├── content/
│   ├── route.ts                      # List & Create
│   ├── [id]/
│   │   └── route.ts                  # Get, Update, Delete
│   ├── tree/
│   │   └── route.ts                  # Hierarchical tree
│   ├── move/
│   │   └── route.ts                  # Move/reorder
│   └── upload/
│       ├── initiate/
│       │   └── route.ts              # Phase 1: Initiate upload
│       └── finalize/
│           └── route.ts              # Phase 2: Finalize upload
└── storage/
    ├── route.ts                      # List & Create configs
    └── [id]/
        └── route.ts                  # Get, Update, Delete config
```

## Key Features

### Content CRUD
- **Create**: Supports notes (TipTap JSON or markdown), folders, HTML pages/templates, code files
- **Read**: Full content with payload data, optimized list queries with metadata only
- **Update**: Partial updates with automatic search text re-extraction
- **Delete**: Soft delete with TrashBin entry and 30-day scheduled deletion

### Type Filtering
Content type filtering by payload presence:
```typescript
// Filter by type (server-side)
if (type === "note") {
  whereClause.notePayload = { isNot: null };
} else if (type === "folder") {
  whereClause.notePayload = null;
  whereClause.filePayload = null;
  whereClause.htmlPayload = null;
  whereClause.codePayload = null;
}
```

### Search
Full-text search across:
- Content titles
- Note searchText (materialized from TipTap JSON)
- HTML searchText (materialized from HTML)
- Code searchText (materialized from code + language)

### File Tree
Optimized for virtualized tree rendering:
- Single query fetches all nodes
- Client receives hierarchical structure
- Metadata only (not full content)
- Sorted: folders first, then displayOrder, then alphabetically

### Markdown Upload
Automatic conversion of uploaded `.md` files to notes:
```typescript
const json = markdownToTiptap(markdown);
const searchText = extractSearchTextFromTipTap(json);
```

### Two-Phase Upload
1. **Initiate**: Creates ContentNode + FilePayload (uploadStatus="uploading")
2. **Client uploads** directly to storage using presigned URL
3. **Finalize**: Verifies upload, extracts metadata, transitions to "ready"

**Benefits:**
- No server-side file handling
- Direct client → CDN upload (faster)
- Server validates after upload (security)
- Upload state machine prevents incomplete files

### Storage Provider Management
Multi-cloud support:
- **Cloudflare R2**: S3-compatible, requires accountId, accessKeyId, secretAccessKey, bucket
- **AWS S3**: Requires region, accessKeyId, secretAccessKey, bucket
- **Vercel Blob**: Requires token

**Features:**
- Default provider selection
- Active/inactive toggle
- Cannot delete provider if files are using it
- Cannot delete default provider (must set another as default first)

### Move & Reorder
Drag-and-drop reorganization:
- Validates ownership
- Prevents cycles (cannot move to own descendant)
- Prevents moving to self
- Updates materialized paths for moved content and all children

### Soft Delete
TrashBin system:
- 30-day retention before permanent deletion
- Stores content snapshot (title, slug, parentId, hasChildren)
- Tracks deletedBy user
- scheduledDeletion timestamp for cron cleanup

## Authentication & Authorization

All routes protected with `requireAuth()` middleware:
```typescript
const session = await requireAuth();
```

Ownership checks on all operations:
```typescript
if (content.ownerId !== session.user.id) {
  return NextResponse.json({ error: "Access denied" }, { status: 403 });
}
```

## Error Handling

Standardized error responses:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

Error codes:
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `VALIDATION_ERROR` (400)
- `CONFLICT` (409)
- `UPLOAD_INCOMPLETE` (400)
- `UPLOAD_FAILED` (500)
- `STORAGE_ERROR` (500)
- `SERVER_ERROR` (500)

## Setup Instructions

### 1. Install Dependencies

```bash
cd apps/web
pnpm install
```

This installs the TipTap dependencies added in M1:
- @tiptap/core
- @tiptap/pm
- @tiptap/starter-kit
- tiptap-markdown

### 2. Generate Prisma Client

```bash
npx prisma generate
```

This generates the Prisma client with the new v2.0 schema (ContentNode, typed payloads).

**Important:** The API routes will have TypeScript errors until Prisma client is generated.

### 3. Run Migration & Seed

```bash
npx prisma migrate reset --force
```

This:
- Drops existing database schema
- Applies v2.0 migration
- Runs seed script (admin user, storage config, welcome note)

### 4. Verify API Routes

Start dev server:
```bash
pnpm dev
```

Test endpoints:
```bash
# List content
curl http://localhost:3000/api/content/content \
  -H "Cookie: session=..."

# Get tree
curl http://localhost:3000/api/content/content/tree \
  -H "Cookie: session=..."

# Create note
curl -X POST http://localhost:3000/api/content/content \
  -H "Cookie: session=..." \
  -H "Content-Type: application/json" \
  -d '{"title":"My Note","tiptapJson":{"type":"doc","content":[]}}'
```

## Known Issues

### TypeScript Errors (Pre-Setup)
The following errors are expected before setup:

1. **Cannot find module '@tiptap/core'**
   - Fix: Run `pnpm install`

2. **Property 'contentNode' does not exist on type 'PrismaClient'**
   - Fix: Run `npx prisma generate`

3. **Unexpected any types**
   - These are intentional for flexibility in JSON payloads
   - Can be tightened with specific types in future refinement

### Placeholder Implementations

The following are **placeholder implementations** requiring production integration:

#### Storage Presigned URLs
```typescript
// app/api/content/content/upload/initiate/route.ts
async function generatePresignedUploadUrl() {
  // TODO: Integrate @aws-sdk/client-s3 for R2/S3
  // TODO: Integrate @vercel/blob for Vercel Blob
  return "https://upload.example.com/...";
}
```

**Production Requirements:**
- Install `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
- Implement R2/S3 presigned URL generation
- Install `@vercel/blob` for Vercel Blob support

#### Storage Verification
```typescript
// app/api/content/content/upload/finalize/route.ts
async function verifyFileInStorage() {
  // TODO: Use HeadObject to verify file exists
  return "https://cdn.example.com/...";
}
```

#### Metadata Extraction
```typescript
// app/api/content/content/upload/finalize/route.ts
async function extractFileMetadata() {
  // TODO: Use sharp for image dimensions
  // TODO: Use ffmpeg for video metadata
  return {};
}
```

**Production Requirements:**
- Install `sharp` for image processing
- Install `ffmpeg` or cloud video processing service
- Implement thumbnail generation

## API Documentation

Full API specification: `docs/notes-feature/04-api-specification.md`

### Quick Reference

#### List Content
```http
GET /api/content/content?type=note&search=hello&limit=50
```

#### Create Note
```http
POST /api/content/content
Content-Type: application/json

{
  "title": "My Note",
  "tiptapJson": {...},
  "parentId": "folder-uuid"
}
```

#### Create Folder
```http
POST /api/content/content
Content-Type: application/json

{
  "title": "Projects",
  "isFolder": true
}
```

#### Update Note
```http
PATCH /api/content/content/{id}
Content-Type: application/json

{
  "title": "Updated Title",
  "tiptapJson": {...}
}
```

#### Soft Delete
```http
DELETE /api/content/content/{id}
```

#### Get Tree
```http
GET /api/content/content/tree
```

#### Move Content
```http
POST /api/content/content/move
Content-Type: application/json

{
  "contentId": "uuid",
  "targetParentId": "folder-uuid",
  "newDisplayOrder": 0
}
```

#### Two-Phase Upload
```http
# Phase 1: Initiate
POST /api/content/content/upload/initiate
{
  "fileName": "photo.jpg",
  "fileSize": 1024000,
  "mimeType": "image/jpeg",
  "checksum": "sha256hash..."
}

# Response:
{
  "contentId": "uuid",
  "uploadUrl": "https://...",
  "expiresIn": 3600
}

# Client uploads to uploadUrl

# Phase 2: Finalize
POST /api/content/content/upload/finalize
{
  "contentId": "uuid",
  "uploadSuccess": true
}
```

## Testing

### Manual Testing
1. Start dev server: `pnpm dev`
2. Login as admin@example.com / changeme123
3. Use browser dev tools or Postman to test endpoints

### Automated Testing
Placeholder for M13 (Testing & QA):
- Unit tests for API routes
- Integration tests for workflows
- E2E tests with Playwright

## Statistics

- **API Routes**: 14 endpoints
- **Lines of Code**: ~2,000
- **Files Created**: 10
- **Features**: CRUD, Tree, Move, Two-Phase Upload, Storage Config, Soft Delete

## Next Steps

### M3: UI Foundation
- Panel layout with Allotment
- State management with Zustand
- Responsive design
- Settings persistence

See `docs/notes-feature/11-implementation-guide.md` for M3 details.

### Future Enhancements (Post-MVP)
- WebSocket real-time updates
- Collaborative editing
- Advanced search (filters, facets)
- Batch operations
- Content versioning UI
- Trash restoration UI
- Storage quota tracking

---

**Status:** ✅ M2 Complete  
**Date:** January 12, 2026  
**Next Milestone:** M3 - UI Foundation

