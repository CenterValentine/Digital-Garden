# Database Design: Content Node + Typed Payloads

**Version:** 2.0  
**Last Updated:** January 12, 2026  
**Schema Approach:** Option A (Content node + typed payload tables)

## Overview

The notes feature uses a **Content tree with typed payload tables** architecture. Each content item has:

1. A **ContentNode** (tree identity, hierarchy, permissions, publication)
2. Exactly one **typed payload** (NotePayload, FilePayload, or HtmlPayload)

This design enforces type safety through table structure rather than JSON discriminators, eliminating integrity risks from dual sources of truth.

## Design Philosophy Evolution

### Original Philosophy (v1.0 - Deprecated)

The original design used `StructuredDocument` as a universal container with optional `FileMetadata`:

**Problems:**

- ❌ Dual sources of truth (docType string vs FileMetadata presence)
- ❌ contentData JSONB stored both editor JSON and relational pointers
- ❌ docType↔metadata drift possible (node says "PDF" but no FileMetadata)
- ❌ Database↔object storage drift (metadata exists but file deleted)
- ❌ Weak search indexing on nested TipTap JSON
- ❌ No upload state machine (can't distinguish uploading vs ready)
- ❌ HTML/templates not first-class citizens

### New Philosophy (v2.0 - Current)

**Content Node + Typed Payload** architecture:

```
ContentNode (tree node / identity)
    ↓ 1:1
NotePayload OR FilePayload OR HtmlPayload
```

**Benefits:**

- ✅ **Single source of truth for type**: Node is a file iff FilePayload exists
- ✅ **No relational pointers in JSONB**: TipTap JSON stores only editor content
- ✅ **Materialized search text**: Reliable full-text search without nested JSON
- ✅ **Upload state machine**: Files have uploadStatus (uploading|ready|failed)
- ✅ **HTML templates first-class**: HtmlPayload.isTemplate + templateSchema
- ✅ **Impossible invalid states**: Can't have Note with FilePayload
- ✅ **Type-safe queries**: JOIN to specific payload table by use case

## Core Schema

### ContentNode (Universal Tree Node)

**Purpose:** Identity, hierarchy, permissions, publication state, soft delete, visual preferences

```sql
CREATE TABLE "ContentNode" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ownerId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "title" VARCHAR(255) NOT NULL,
  "slug" VARCHAR(255) NOT NULL UNIQUE,

  -- Hierarchy (tree structure)
  "parentId" UUID REFERENCES "ContentNode"("id") ON DELETE NO ACTION,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,

  -- Categorization
  "categoryId" UUID REFERENCES "Category"("id") ON DELETE SET NULL,

  -- Publication & timestamps
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Soft delete
  "deletedAt" TIMESTAMPTZ,
  "deletedBy" UUID REFERENCES "User"("id"),

  -- Visual customization
  "customIcon" VARCHAR(100), -- Lucide icon name or emoji
  "iconColor" VARCHAR(20),   -- Hex color or CSS color

  -- Indexes
  CONSTRAINT "ContentNode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContentNode_slug_key" UNIQUE ("slug")
);

-- Tree queries
CREATE INDEX "ContentNode_parentId_displayOrder_idx"
  ON "ContentNode"("parentId", "displayOrder")
  WHERE "deletedAt" IS NULL;

-- Owner queries
CREATE INDEX "ContentNode_ownerId_idx"
  ON "ContentNode"("ownerId")
  WHERE "deletedAt" IS NULL;

-- Soft delete queries
CREATE INDEX "ContentNode_deletedAt_idx"
  ON "ContentNode"("deletedAt")
  WHERE "deletedAt" IS NOT NULL;

-- Category queries
CREATE INDEX "ContentNode_categoryId_displayOrder_idx"
  ON "ContentNode"("categoryId", "displayOrder");
```

**Key Design Decisions:**

- **No contentType field**: Type is determined by which payload exists (query JOIN pattern)
- **Slug uniqueness**: Enforced at database level for routing
- **NO ACTION on parent delete**: Prevents accidental cascade; app must handle orphans
- **Soft delete**: deletedAt + deletedBy for trash functionality
- **Icon customization**: Per-node visual preferences (folders, projects, etc.)

### NotePayload (Markdown/TipTap Content)

**Purpose:** Rich text notes with full-text search

```sql
CREATE TABLE "NotePayload" (
  "contentId" UUID PRIMARY KEY REFERENCES "ContentNode"("id") ON DELETE CASCADE,

  -- Editor content
  "tiptapJson" JSONB NOT NULL, -- TipTap/Novel editor JSON

  -- Materialized search text (extracted from tiptapJson)
  "searchText" TEXT NOT NULL DEFAULT '',

  -- Content metadata
  "metadata" JSONB DEFAULT '{}', -- { wordCount, characterCount, readingTime, etc. }

  -- Timestamps
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Full-text search (Postgres full-text search)
CREATE INDEX "NotePayload_searchText_gin_idx"
  ON "NotePayload" USING gin(to_tsvector('english', "searchText"));

-- Combined search with title
CREATE INDEX "NotePayload_combined_search_idx"
  ON "NotePayload" USING gin(
    to_tsvector('english', "searchText") ||
    to_tsvector('english', (SELECT "title" FROM "ContentNode" WHERE "id" = "contentId"))
  );
```

**Key Design Decisions:**

- **Materialized searchText**: Extracted from TipTap JSON on every update, enables reliable search
- **No relational pointers in tiptapJson**: JSONB contains only editor state
- **metadata JSONB**: Computed stats (word count, etc.) stored separately from editor content
- **Full-text indexing**: GIN index on searchText for fast full-text search

**searchText Extraction:**

```typescript
// Extract plain text from TipTap JSON for search
function extractSearchText(tiptapJson: any): string {
  function extractText(node: any): string {
    if (node.type === "text") return node.text || "";
    if (node.content) return node.content.map(extractText).join(" ");
    return "";
  }
  return extractText(tiptapJson).replace(/\s+/g, " ").trim();
}
```

### FilePayload (Binary Files)

**Purpose:** PDFs, images, videos, audio, archives, office documents

```sql
CREATE TYPE "UploadStatus" AS ENUM ('uploading', 'ready', 'failed');
CREATE TYPE "StorageProvider" AS ENUM ('r2', 's3', 'vercel');

CREATE TABLE "FilePayload" (
  "contentId" UUID PRIMARY KEY REFERENCES "ContentNode"("id") ON DELETE CASCADE,

  -- File identification
  "fileName" VARCHAR(255) NOT NULL,
  "fileExtension" VARCHAR(10),
  "mimeType" VARCHAR(127) NOT NULL,
  "fileSize" BIGINT NOT NULL, -- bytes
  "checksum" VARCHAR(64) NOT NULL, -- SHA-256 for duplicate detection

  -- Storage location
  "storageProvider" "StorageProvider" NOT NULL DEFAULT 'r2',
  "storageKey" VARCHAR(512) NOT NULL, -- path in storage bucket
  "storageUrl" TEXT, -- optional CDN URL
  "storageMetadata" JSONB DEFAULT '{}', -- provider-specific metadata

  -- Upload state machine
  "uploadStatus" "UploadStatus" NOT NULL DEFAULT 'uploading',
  "uploadedAt" TIMESTAMPTZ,
  "uploadError" TEXT, -- error message if status=failed

  -- Processing (thumbnails, transcoding, etc.)
  "processingStatus" VARCHAR(20) DEFAULT 'pending', -- pending|processing|complete|failed
  "isProcessed" BOOLEAN NOT NULL DEFAULT false,

  -- Media metadata (images/videos/audio)
  "thumbnailUrl" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "duration" INTEGER, -- seconds, for audio/video

  -- Access tracking
  "lastAccessedAt" TIMESTAMPTZ,

  -- Timestamps
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Upload status queries (UI filtering)
CREATE INDEX "FilePayload_uploadStatus_idx" ON "FilePayload"("uploadStatus");

-- Storage provider queries
CREATE INDEX "FilePayload_storageProvider_uploadedAt_idx"
  ON "FilePayload"("storageProvider", "uploadedAt" DESC);

-- Duplicate detection
CREATE INDEX "FilePayload_checksum_fileSize_idx"
  ON "FilePayload"("checksum", "fileSize");

-- MIME type filtering
CREATE INDEX "FilePayload_mimeType_idx" ON "FilePayload"("mimeType");

-- Processing queue
CREATE INDEX "FilePayload_processingStatus_idx"
  ON "FilePayload"("processingStatus")
  WHERE "isProcessed" = false;
```

**Key Design Decisions:**

- **Upload state machine**: uploadStatus ENUM enforces workflow (uploading → ready | failed)
- **UI contract**: Frontend must check uploadStatus=ready before showing download/preview
- **Checksum + fileSize**: Efficient duplicate detection
- **Processing flags**: Separate from upload for async thumbnail/transcode jobs
- **storageUrl optional**: Can generate presigned URLs on-demand from storageKey
- **uploadError**: Capture failure reason for debugging

**Upload State Machine:**

```
uploading → ready     (successful upload + finalize)
uploading → failed    (upload error, network failure, validation failure)
failed → uploading    (retry)
```

### HtmlPayload (Static HTML Pages & Templates)

**Purpose:** Static HTML pages and reusable HTML templates

```sql
CREATE TABLE "HtmlPayload" (
  "contentId" UUID PRIMARY KEY REFERENCES "ContentNode"("id") ON DELETE CASCADE,

  -- HTML content
  "html" TEXT NOT NULL, -- Raw HTML or template HTML

  -- Materialized search text (extracted from HTML)
  "searchText" TEXT NOT NULL DEFAULT '',

  -- Template support
  "isTemplate" BOOLEAN NOT NULL DEFAULT false,
  "templateSchema" JSONB, -- Parameter definitions: { params: [{ name, type, required, default }] }
  "templateMetadata" JSONB DEFAULT '{}', -- { description, useCases, tags, version, author }

  -- Optional: templating engine
  "renderMode" VARCHAR(20) DEFAULT 'static', -- static|template
  "templateEngine" VARCHAR(20), -- raw|nunjucks|handlebars|liquid (if renderMode=template)

  -- Timestamps
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Full-text search on HTML content
CREATE INDEX "HtmlPayload_searchText_gin_idx"
  ON "HtmlPayload" USING gin(to_tsvector('english', "searchText"));

-- Template filtering
CREATE INDEX "HtmlPayload_isTemplate_idx"
  ON "HtmlPayload"("isTemplate");
```

**Key Design Decisions:**

- **Materialized searchText**: Extracted from HTML (strip tags, decode entities)
- **isTemplate flag**: Distinguishes reusable templates from concrete pages
- **templateSchema JSONB**: Defines parameters for template instantiation
  ```json
  {
    "params": [
      { "name": "title", "type": "string", "required": true },
      { "name": "author", "type": "string", "default": "Anonymous" },
      { "name": "sections", "type": "array", "items": "string" }
    ]
  }
  ```
- **templateMetadata**: Searchable template catalog metadata
- **templateEngine**: Support for Nunjucks, Handlebars, Liquid (future)

**searchText Extraction from HTML:**

```typescript
import { load } from "cheerio";

function extractSearchTextFromHtml(html: string): string {
  const $ = load(html);
  // Remove script and style tags
  $("script, style").remove();
  // Extract text content
  const text = $("body").text() || $.text();
  return text.replace(/\s+/g, " ").trim();
}
```

### CodePayload (Optional - Language-Specific Code Files)

**Purpose:** Source code files with syntax highlighting metadata (optional separate payload)

**Alternative:** Can store code as NotePayload with language metadata in tiptapJson.

```sql
CREATE TABLE "CodePayload" (
  "contentId" UUID PRIMARY KEY REFERENCES "ContentNode"("id") ON DELETE CASCADE,

  -- Code content
  "code" TEXT NOT NULL,
  "language" VARCHAR(50) NOT NULL, -- typescript|python|rust|go|etc

  -- Materialized search text (code is searchable)
  "searchText" TEXT NOT NULL DEFAULT '', -- Same as code, but indexed

  -- Code metadata
  "metadata" JSONB DEFAULT '{}', -- { lines, complexity, imports, exports }

  -- Timestamps
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Full-text search
CREATE INDEX "CodePayload_searchText_gin_idx"
  ON "CodePayload" USING gin(to_tsvector('english', "searchText"));

-- Language filtering
CREATE INDEX "CodePayload_language_idx" ON "CodePayload"("language");
```

**Decision:** Use CodePayload if:

- Code files need distinct treatment from markdown notes
- Language-specific analysis/tooling required
- Separate search index for code vs prose

**Alternative:** Store code in NotePayload with TipTap CodeBlock extension.

## Type Model: ContentNode vs Payload

### Canonical Type Truth

**A ContentNode's type is determined by which payload exists, not by a string field.**

```typescript
// Type determination (exhaustive pattern)
type ContentType = "note" | "file" | "html" | "code";

function getContentType(node: ContentNode): ContentType | null {
  if (node.notePayload) return "note";
  if (node.filePayload) return "file";
  if (node.htmlPayload) return "html";
  if (node.codePayload) return "code";
  return null; // Orphaned node (invalid state)
}
```

### Invariants (Enforced)

1. **One tree node**: Every content item is a ContentNode
2. **Exactly one payload**: Node has 0 or 1 payloads (never multiple)
3. **Type ↔ Payload consistency**:
   - Node with NotePayload is a note
   - Node with FilePayload is a file
   - Node with HtmlPayload is HTML page/template
4. **No relational pointers in JSONB**:
   - ❌ `contentData: { fileMetadataId: "uuid" }`
   - ✅ `tiptapJson: { type: "doc", content: [...] }`
5. **Upload state machine**: FilePayload.uploadStatus gates UI actions
6. **Materialized search**: searchText extracted and indexed, not nested JSON

### Invalid States (Prevented)

```sql
-- ❌ IMPOSSIBLE: Node with multiple payloads
-- Prevented by: Each payload table has contentId as PRIMARY KEY

-- ❌ IMPOSSIBLE: Note with file metadata
-- Prevented by: Separate payload tables, no overlap

-- ❌ IMPOSSIBLE: File without upload status
-- Prevented by: uploadStatus NOT NULL DEFAULT 'uploading'

-- ❌ IMPOSSIBLE: FilePayload without ContentNode
-- Prevented by: ON DELETE CASCADE from FilePayload to ContentNode
```

## Write-Path Workflows

### 1. Create Note

```typescript
async function createNote(input: CreateNoteInput) {
  return await prisma.$transaction(async (tx) => {
    // 1. Create ContentNode
    const node = await tx.contentNode.create({
      data: {
        ownerId: input.userId,
        title: input.title,
        slug: input.slug,
        parentId: input.parentId,
        categoryId: input.categoryId,
      },
    });

    // 2. Create NotePayload
    const searchText = extractSearchText(input.tiptapJson);
    const metadata = {
      wordCount: countWords(searchText),
      characterCount: searchText.length,
      readingTime: Math.ceil(countWords(searchText) / 200), // minutes
    };

    const payload = await tx.notePayload.create({
      data: {
        contentId: node.id,
        tiptapJson: input.tiptapJson,
        searchText,
        metadata,
      },
    });

    return { node, payload };
  });
}
```

### 2. Create File (Presigned Upload + Finalize)

**Step 1: Initiate upload (get presigned URL)**

```typescript
async function initiateFileUpload(input: InitiateUploadInput) {
  return await prisma.$transaction(async (tx) => {
    // 1. Create ContentNode
    const node = await tx.contentNode.create({
      data: {
        ownerId: input.userId,
        title: input.fileName,
        slug: generateSlug(input.fileName),
        parentId: input.parentId,
      },
    });

    // 2. Create FilePayload with uploadStatus=uploading
    const storageKey = `files/${node.ownerId}/${node.id}/${input.fileName}`;
    const payload = await tx.filePayload.create({
      data: {
        contentId: node.id,
        fileName: input.fileName,
        fileExtension: path.extname(input.fileName),
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        checksum: input.checksum, // Client-computed SHA-256
        storageProvider: input.storageProvider || "r2",
        storageKey,
        uploadStatus: "uploading", // Critical: UI knows not to show download yet
      },
    });

    // 3. Generate presigned URL
    const presignedUrl = await generatePresignedUrl({
      provider: payload.storageProvider,
      key: storageKey,
      mimeType: input.mimeType,
      expiresIn: 3600, // 1 hour
    });

    return {
      node,
      payload,
      presignedUrl,
      uploadInstructions: {
        method: "PUT",
        headers: { "Content-Type": input.mimeType },
      },
    };
  });
}
```

**Step 2: Client uploads to presigned URL**

```typescript
// Client-side
const response = await fetch(presignedUrl, {
  method: "PUT",
  body: file,
  headers: { "Content-Type": mimeType },
});

if (!response.ok) {
  // Call finalize with error
  await finalizeFileUpload(nodeId, { success: false, error: "Upload failed" });
}
```

**Step 3: Finalize upload (mark ready or failed)**

```typescript
async function finalizeFileUpload(
  contentId: string,
  result: { success: boolean; error?: string }
) {
  return await prisma.filePayload.update({
    where: { contentId },
    data: result.success
      ? {
          uploadStatus: "ready", // Now safe for UI to show download/preview
          uploadedAt: new Date(),
        }
      : {
          uploadStatus: "failed",
          uploadError: result.error,
        },
  });
}
```

**Critical:** UI must check `uploadStatus === 'ready'` before showing download/preview buttons.

### 3. Create HTML Page

```typescript
async function createHtmlPage(input: CreateHtmlInput) {
  return await prisma.$transaction(async (tx) => {
    // 1. Create ContentNode
    const node = await tx.contentNode.create({
      data: {
        ownerId: input.userId,
        title: input.title,
        slug: input.slug,
        parentId: input.parentId,
      },
    });

    // 2. Create HtmlPayload
    const searchText = extractSearchTextFromHtml(input.html);
    const payload = await tx.htmlPayload.create({
      data: {
        contentId: node.id,
        html: input.html,
        searchText,
        isTemplate: false,
        renderMode: "static",
      },
    });

    return { node, payload };
  });
}
```

### 4. Create HTML Template + Instantiate

**Create template:**

```typescript
async function createHtmlTemplate(input: CreateTemplateInput) {
  return await prisma.$transaction(async (tx) => {
    const node = await tx.contentNode.create({
      data: {
        ownerId: input.userId,
        title: input.templateName,
        slug: `template-${input.slug}`,
        parentId: input.parentId,
      },
    });

    const payload = await tx.htmlPayload.create({
      data: {
        contentId: node.id,
        html: input.templateHtml, // Contains {{ variables }}
        searchText: extractSearchTextFromHtml(input.templateHtml),
        isTemplate: true,
        templateSchema: input.schema, // { params: [...] }
        templateMetadata: {
          description: input.description,
          useCases: input.useCases,
          tags: input.tags,
          version: "1.0",
        },
        renderMode: "template",
        templateEngine: input.engine || "raw",
      },
    });

    return { node, payload };
  });
}
```

**Instantiate template (create page from template):**

```typescript
async function instantiateTemplate(input: InstantiateTemplateInput) {
  // 1. Fetch template
  const template = await prisma.htmlPayload.findUnique({
    where: { contentId: input.templateId },
  });

  if (!template.isTemplate) throw new Error("Not a template");

  // 2. Render template with parameters
  const renderedHtml = renderTemplate(
    template.html,
    input.params,
    template.templateEngine
  );

  // 3. Create new page
  return await prisma.$transaction(async (tx) => {
    const node = await tx.contentNode.create({
      data: {
        ownerId: input.userId,
        title: input.title,
        slug: input.slug,
        parentId: input.parentId,
      },
    });

    const payload = await tx.htmlPayload.create({
      data: {
        contentId: node.id,
        html: renderedHtml,
        searchText: extractSearchTextFromHtml(renderedHtml),
        isTemplate: false,
        renderMode: "static",
        templateMetadata: {
          instantiatedFrom: input.templateId,
          instantiatedAt: new Date(),
          params: input.params,
        },
      },
    });

    return { node, payload };
  });
}
```

### 5. Update Note

```typescript
async function updateNote(contentId: string, input: UpdateNoteInput) {
  const searchText = extractSearchText(input.tiptapJson);
  const metadata = {
    wordCount: countWords(searchText),
    characterCount: searchText.length,
    readingTime: Math.ceil(countWords(searchText) / 200),
  };

  return await prisma.$transaction(async (tx) => {
    // 1. Update ContentNode
    await tx.contentNode.update({
      where: { id: contentId },
      data: {
        title: input.title,
        updatedAt: new Date(),
      },
    });

    // 2. Update NotePayload
    const payload = await tx.notePayload.update({
      where: { contentId },
      data: {
        tiptapJson: input.tiptapJson,
        searchText, // Re-materialize
        metadata,
        updatedAt: new Date(),
      },
    });

    // 3. Create history entry (optional)
    await tx.contentHistory.create({
      data: {
        contentId,
        version: await getNextVersion(contentId),
        snapshot: input.tiptapJson,
        changedBy: input.userId,
      },
    });

    return payload;
  });
}
```

### 6. Delete (Soft Delete)

```typescript
async function softDeleteContent(contentId: string, userId: string) {
  return await prisma.$transaction(async (tx) => {
    // 1. Fetch full content for snapshot
    const node = await tx.contentNode.findUnique({
      where: { id: contentId },
      include: {
        notePayload: true,
        filePayload: true,
        htmlPayload: true,
      },
    });

    // 2. Move to trash
    const scheduledDeletion = new Date();
    scheduledDeletion.setDate(scheduledDeletion.getDate() + 30);

    await tx.trashBin.create({
      data: {
        contentId,
        originalPath: await getContentPath(contentId),
        deletedBy: userId,
        scheduledDeletion,
        contentSnapshot: node, // Full snapshot
      },
    });

    // 3. Mark node as deleted
    await tx.contentNode.update({
      where: { id: contentId },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    // Payload remains (soft delete at node level)
    // Physical deletion happens after 30 days via cron
  });
}
```

### 7. Restore from Trash

```typescript
async function restoreFromTrash(contentId: string) {
  return await prisma.$transaction(async (tx) => {
    // 1. Remove deleted markers
    await tx.contentNode.update({
      where: { id: contentId },
      data: {
        deletedAt: null,
        deletedBy: null,
      },
    });

    // 2. Remove from trash
    await tx.trashBin.delete({
      where: { contentId },
    });
  });
}
```

## Data Integrity & Constraints

### Database-Level Constraints

```sql
-- 1. Payload tables enforce 1:1 with ContentNode
ALTER TABLE "NotePayload"
  ADD CONSTRAINT "NotePayload_contentId_fkey"
  FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id")
  ON DELETE CASCADE;

-- 2. Upload status must be valid
ALTER TABLE "FilePayload"
  ADD CONSTRAINT "FilePayload_uploadStatus_check"
  CHECK ("uploadStatus" IN ('uploading', 'ready', 'failed'));

-- 3. Template schema required if isTemplate=true
ALTER TABLE "HtmlPayload"
  ADD CONSTRAINT "HtmlPayload_template_schema_check"
  CHECK (
    ("isTemplate" = false) OR
    ("isTemplate" = true AND "templateSchema" IS NOT NULL)
  );

-- 4. File upload finalization invariant
ALTER TABLE "FilePayload"
  ADD CONSTRAINT "FilePayload_upload_invariant_check"
  CHECK (
    ("uploadStatus" = 'uploading' AND "uploadedAt" IS NULL) OR
    ("uploadStatus" = 'ready' AND "uploadedAt" IS NOT NULL) OR
    ("uploadStatus" = 'failed' AND "uploadError" IS NOT NULL)
  );
```

### Application-Level Enforcement

**Transaction boundaries:**

```typescript
// ✅ CORRECT: Create node + payload atomically
await prisma.$transaction(async (tx) => {
  const node = await tx.contentNode.create({ ... });
  const payload = await tx.notePayload.create({ contentId: node.id, ... });
  return { node, payload };
});

// ❌ WRONG: Non-transactional (can leave orphan)
const node = await prisma.contentNode.create({ ... });
const payload = await prisma.notePayload.create({ contentId: node.id, ... });
```

**Materialized search text updates:**

```typescript
// ✅ CORRECT: Update searchText on every note update
await prisma.notePayload.update({
  where: { contentId },
  data: {
    tiptapJson: newJson,
    searchText: extractSearchText(newJson), // Re-materialize
  },
});

// ❌ WRONG: Forget to re-materialize (search stale)
await prisma.notePayload.update({
  where: { contentId },
  data: { tiptapJson: newJson }, // searchText now stale
});
```

### Background Jobs

**Orphan cleanup (weekly):**

```typescript
async function cleanupOrphans() {
  // Find ContentNodes without any payload
  const orphans = await prisma.$queryRaw`
    SELECT cn.id
    FROM "ContentNode" cn
    LEFT JOIN "NotePayload" np ON cn.id = np."contentId"
    LEFT JOIN "FilePayload" fp ON cn.id = fp."contentId"
    LEFT JOIN "HtmlPayload" hp ON cn.id = hp."contentId"
    WHERE np."contentId" IS NULL
      AND fp."contentId" IS NULL
      AND hp."contentId" IS NULL
      AND cn."deletedAt" IS NULL
  `;

  // Log and optionally delete
  for (const { id } of orphans) {
    console.warn(`Orphaned ContentNode: ${id}`);
    // await prisma.contentNode.delete({ where: { id } });
  }
}
```

**Trash auto-delete (daily):**

```typescript
async function cleanupExpiredTrash() {
  const expired = await prisma.trashBin.findMany({
    where: {
      scheduledDeletion: { lte: new Date() },
    },
  });

  for (const item of expired) {
    await permanentlyDeleteContent(item.contentId);
  }
}

async function permanentlyDeleteContent(contentId: string) {
  return await prisma.$transaction(async (tx) => {
    // 1. Delete from storage (if FilePayload)
    const filePayload = await tx.filePayload.findUnique({
      where: { contentId },
    });
    if (filePayload) {
      await deleteFromStorage(
        filePayload.storageKey,
        filePayload.storageProvider
      );
    }

    // 2. Delete ContentNode (cascades to payload)
    await tx.contentNode.delete({ where: { id: contentId } });

    // 3. Remove from trash
    await tx.trashBin.delete({ where: { contentId } });
  });
}
```

**File processing queue (async thumbnails):**

```typescript
async function processFileQueue() {
  const pending = await prisma.filePayload.findMany({
    where: {
      uploadStatus: "ready",
      isProcessed: false,
      mimeType: { startsWith: "image/" },
    },
    take: 10,
  });

  for (const file of pending) {
    try {
      // Download from storage
      const buffer = await downloadFromStorage(
        file.storageKey,
        file.storageProvider
      );

      // Generate thumbnail
      const thumbnail = await generateThumbnail(buffer);
      const thumbnailUrl = await uploadThumbnail(thumbnail, file.contentId);

      // Update payload
      await prisma.filePayload.update({
        where: { contentId: file.contentId },
        data: {
          thumbnailUrl,
          isProcessed: true,
          processingStatus: "complete",
        },
      });
    } catch (error) {
      await prisma.filePayload.update({
        where: { contentId: file.contentId },
        data: {
          processingStatus: "failed",
        },
      });
    }
  }
}
```

## Complete Prisma Schema

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================
// CORE CONTENT MODEL
// ============================================================

model ContentNode {
  id            String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ownerId       String         @db.Uuid
  title         String         @db.VarChar(255)
  slug          String         @unique @db.VarChar(255)

  // Hierarchy
  parentId      String?        @db.Uuid
  displayOrder  Int            @default(0)

  // Categorization
  categoryId    String?        @db.Uuid

  // Publication
  isPublished   Boolean        @default(false)
  createdAt     DateTime       @default(now()) @db.Timestamptz()
  updatedAt     DateTime       @updatedAt @db.Timestamptz()

  // Soft delete
  deletedAt     DateTime?      @db.Timestamptz()
  deletedBy     String?        @db.Uuid

  // Visual customization
  customIcon    String?        @db.VarChar(100)
  iconColor     String?        @db.VarChar(20)

  // Relationships
  owner         User           @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  parent        ContentNode?   @relation("Hierarchy", fields: [parentId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  children      ContentNode[]  @relation("Hierarchy")
  category      Category?      @relation(fields: [categoryId], references: [id], onDelete: SetNull)

  // Typed payloads (exactly one should exist)
  notePayload   NotePayload?
  filePayload   FilePayload?
  htmlPayload   HtmlPayload?
  codePayload   CodePayload?

  // Related entities
  history       ContentHistory[]
  contentPath   ContentPath?
  sourceLinks   ContentLink[]    @relation("SourceContent")
  targetLinks   ContentLink[]    @relation("TargetContent")
  contentTags   ContentTag[]
  viewGrants    ViewGrant[]
  trashBinEntry TrashBin?

  @@index([ownerId, deletedAt])
  @@index([parentId, displayOrder])
  @@index([categoryId, displayOrder])
  @@index([deletedAt])
}

model NotePayload {
  contentId   String   @id @db.Uuid
  tiptapJson  Json     @db.JsonB
  searchText  String   @default("") @db.Text
  metadata    Json     @default("{}") @db.JsonB
  createdAt   DateTime @default(now()) @db.Timestamptz()
  updatedAt   DateTime @updatedAt @db.Timestamptz()

  content     ContentNode @relation(fields: [contentId], references: [id], onDelete: Cascade)

  @@index([searchText(ops: raw("gin_trgm_ops"))], type: Gin)
}

enum UploadStatus {
  uploading
  ready
  failed
}

enum StorageProvider {
  r2
  s3
  vercel
}

model FilePayload {
  contentId         String          @id @db.Uuid
  fileName          String          @db.VarChar(255)
  fileExtension     String?         @db.VarChar(10)
  mimeType          String          @db.VarChar(127)
  fileSize          BigInt
  checksum          String          @db.VarChar(64)

  storageProvider   StorageProvider @default(r2)
  storageKey        String          @db.VarChar(512)
  storageUrl        String?         @db.Text
  storageMetadata   Json            @default("{}") @db.JsonB

  uploadStatus      UploadStatus    @default(uploading)
  uploadedAt        DateTime?       @db.Timestamptz()
  uploadError       String?         @db.Text

  processingStatus  String          @default("pending") @db.VarChar(20)
  isProcessed       Boolean         @default(false)

  thumbnailUrl      String?         @db.Text
  width             Int?
  height            Int?
  duration          Int?

  lastAccessedAt    DateTime?       @db.Timestamptz()
  createdAt         DateTime        @default(now()) @db.Timestamptz()
  updatedAt         DateTime        @updatedAt @db.Timestamptz()

  content           ContentNode     @relation(fields: [contentId], references: [id], onDelete: Cascade)

  @@index([uploadStatus])
  @@index([storageProvider, uploadedAt(sort: Desc)])
  @@index([checksum, fileSize])
  @@index([mimeType])
  @@index([processingStatus, isProcessed])
}

model HtmlPayload {
  contentId        String   @id @db.Uuid
  html             String   @db.Text
  searchText       String   @default("") @db.Text
  isTemplate       Boolean  @default(false)
  templateSchema   Json?    @db.JsonB
  templateMetadata Json     @default("{}") @db.JsonB
  renderMode       String   @default("static") @db.VarChar(20)
  templateEngine   String?  @db.VarChar(20)
  createdAt        DateTime @default(now()) @db.Timestamptz()
  updatedAt        DateTime @updatedAt @db.Timestamptz()

  content          ContentNode @relation(fields: [contentId], references: [id], onDelete: Cascade)

  @@index([searchText(ops: raw("gin_trgm_ops"))], type: Gin)
  @@index([isTemplate])
}

model CodePayload {
  contentId   String   @id @db.Uuid
  code        String   @db.Text
  language    String   @db.VarChar(50)
  searchText  String   @default("") @db.Text
  metadata    Json     @default("{}") @db.JsonB
  createdAt   DateTime @default(now()) @db.Timestamptz()
  updatedAt   DateTime @updatedAt @db.Timestamptz()

  content     ContentNode @relation(fields: [contentId], references: [id], onDelete: Cascade)

  @@index([searchText(ops: raw("gin_trgm_ops"))], type: Gin)
  @@index([language])
}

// ============================================================
// RELATED ENTITIES (renamed from Document* to Content*)
// ============================================================

model ContentHistory {
  id          String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  contentId   String      @db.Uuid
  version     Int
  snapshot    Json        @db.JsonB
  changedBy   String      @db.Uuid
  changedAt   DateTime    @default(now()) @db.Timestamptz()

  content     ContentNode @relation(fields: [contentId], references: [id], onDelete: Cascade)
  user        User        @relation(fields: [changedBy], references: [id])

  @@unique([contentId, version])
  @@index([contentId, version(sort: Desc)])
}

model ContentPath {
  contentId         String      @id @db.Uuid
  path              String      @db.VarChar(2048)
  pathSegments      String[]
  depth             Int
  lastUpdated       DateTime    @updatedAt @db.Timestamptz()

  content           ContentNode @relation(fields: [contentId], references: [id], onDelete: Cascade)

  @@index([path])
  @@index([depth])
}

model ContentLink {
  id              String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  sourceId        String      @db.Uuid
  targetId        String      @db.Uuid
  linkType        String      @db.VarChar(20)
  targetFragment  String?     @db.VarChar(255)
  context         String?     @db.Text
  createdAt       DateTime    @default(now()) @db.Timestamptz()

  source          ContentNode @relation("SourceContent", fields: [sourceId], references: [id], onDelete: Cascade)
  target          ContentNode @relation("TargetContent", fields: [targetId], references: [id], onDelete: Cascade)

  @@unique([sourceId, targetId, linkType])
  @@index([targetId])
}

model ContentTag {
  id          String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  contentId   String      @db.Uuid
  tagId       String      @db.Uuid
  createdAt   DateTime    @default(now()) @db.Timestamptz()

  content     ContentNode @relation(fields: [contentId], references: [id], onDelete: Cascade)
  tag         Tag         @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([contentId, tagId])
  @@index([tagId])
}

// ============================================================
// TRASH & STORAGE CONFIG
// ============================================================

model TrashBin {
  id                  String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  contentId           String      @unique @db.Uuid
  originalPath        String?     @db.Text
  deletedBy           String      @db.Uuid
  deletedAt           DateTime    @default(now()) @db.Timestamptz()
  scheduledDeletion   DateTime    @db.Timestamptz
  deletionReason      String?     @db.VarChar(255)
  contentSnapshot     Json        @db.JsonB

  content             ContentNode @relation(fields: [contentId], references: [id], onDelete: Cascade)
  deletedByUser       User        @relation(fields: [deletedBy], references: [id])

  @@index([deletedBy])
  @@index([scheduledDeletion])
  @@index([deletedAt(sort: Desc)])
}

model StorageProviderConfig {
  id            String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId        String          @db.Uuid
  provider      StorageProvider
  isDefault     Boolean         @default(false)
  displayName   String?         @db.VarChar(100)
  config        Json            @db.JsonB
  isActive      Boolean         @default(true)
  createdAt     DateTime        @default(now()) @db.Timestamptz()
  updatedAt     DateTime        @updatedAt @db.Timestamptz()

  user          User            @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, provider])
  @@index([userId, isDefault])
}

// ============================================================
// EXISTING MODELS (User, Category, Tag, ViewGrant, Session)
// ============================================================

model User {
  id                  String                    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  username            String                    @unique @db.VarChar(50)
  passwordHash        String?                   @db.Char(60)
  email               String                    @unique @db.VarChar(255)
  role                UserRole                  @default(guest)
  createdAt           DateTime                  @default(now()) @db.Timestamptz()
  updatedAt           DateTime                  @updatedAt @db.Timestamptz()

  // Relationships
  contentNodes        ContentNode[]
  contentHistory      ContentHistory[]
  storageConfigs      StorageProviderConfig[]
  sessions            Session[]
  accounts            Account[]
  categories          Category[]
  viewGrants          ViewGrant[]
  trashedContent      TrashBin[]

  @@index([email])
}

enum UserRole {
  owner
  admin
  member
  guest
}

model Category {
  id            String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name          String        @db.VarChar(100)
  slug          String        @unique @db.VarChar(100)
  description   String?       @db.Text
  ownerId       String        @db.Uuid
  displayOrder  Int           @default(0)
  isPublished   Boolean       @default(false)
  createdAt     DateTime      @default(now()) @db.Timestamptz()
  updatedAt     DateTime      @updatedAt @db.Timestamptz()

  owner         User          @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  contentNodes  ContentNode[]

  @@index([ownerId, displayOrder])
}

model Tag {
  id            String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name          String       @unique @db.VarChar(50)
  slug          String       @unique @db.VarChar(50)
  createdAt     DateTime     @default(now()) @db.Timestamptz()

  contentTags   ContentTag[]

  @@index([name])
}

model ViewGrant {
  id          String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  contentId   String      @db.Uuid
  userId      String      @db.Uuid
  accessLevel String      @db.VarChar(20)
  grantedAt   DateTime    @default(now()) @db.Timestamptz()
  expiresAt   DateTime?   @db.Timestamptz()

  content     ContentNode @relation(fields: [contentId], references: [id], onDelete: Cascade)
  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([contentId, userId])
  @@index([userId])
}

model Session {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId      String    @db.Uuid
  token       String    @unique @db.VarChar(255)
  expiresAt   DateTime  @db.Timestamptz()
  createdAt   DateTime  @default(now()) @db.Timestamptz()

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}

model Account {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId        String   @db.Uuid
  provider      String   @db.VarChar(50)
  providerAccId String   @db.VarChar(255)
  refreshToken  String?  @db.Text
  accessToken   String?  @db.Text
  expiresAt     DateTime? @db.Timestamptz()
  createdAt     DateTime @default(now()) @db.Timestamptz()

  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccId])
  @@index([userId])
}
```

## Migration Strategy: Wipe & Reset

### Background

**The database has never been used in production.** We can wipe/reset with no data loss concerns.

### Recommended Approach

```bash
# 1. Drop schema and reset
npx prisma migrate reset --force

# 2. Generate Prisma client
npx prisma generate

# 3. Seed database (default configs, templates, starter content)
npx prisma db seed
```

### Seed Script

```typescript
// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. Create default user
  const user = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      username: "admin",
      email: "admin@example.com",
      passwordHash: await hashPassword("changeme"),
      role: "owner",
    },
  });

  // 2. Create default storage config (Cloudflare R2)
  await prisma.storageProviderConfig.upsert({
    where: {
      userId_provider: {
        userId: user.id,
        provider: "r2",
      },
    },
    update: {},
    create: {
      userId: user.id,
      provider: "r2",
      isDefault: true,
      displayName: "Cloudflare R2",
      config: {
        accountId: process.env.R2_ACCOUNT_ID,
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        bucket: process.env.R2_BUCKET,
      },
    },
  });

  // 3. Create system templates
  const emailTemplate = await prisma.contentNode.create({
    data: {
      ownerId: user.id,
      title: "Email Newsletter Template",
      slug: "template-email-newsletter",
      htmlPayload: {
        create: {
          html: EMAIL_TEMPLATE_HTML,
          searchText: "email newsletter template",
          isTemplate: true,
          templateSchema: {
            params: [
              { name: "subject", type: "string", required: true },
              { name: "preheader", type: "string", required: false },
              { name: "sections", type: "array", items: "html" },
            ],
          },
          templateMetadata: {
            description: "Responsive email newsletter template",
            useCases: ["marketing", "announcements"],
            tags: ["email", "newsletter"],
            version: "1.0",
          },
          renderMode: "template",
          templateEngine: "nunjucks",
        },
      },
    },
  });

  // 4. Create starter content
  const welcomeNote = await prisma.contentNode.create({
    data: {
      ownerId: user.id,
      title: "Welcome to Digital Garden",
      slug: "welcome",
      isPublished: true,
      notePayload: {
        create: {
          tiptapJson: WELCOME_TIPTAP_JSON,
          searchText: extractSearchText(WELCOME_TIPTAP_JSON),
          metadata: {
            wordCount: 150,
            readingTime: 1,
          },
        },
      },
    },
  });

  console.log("✅ Seed complete");
  console.log(`- User: ${user.email}`);
  console.log(`- Templates: 1`);
  console.log(`- Notes: 1`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

### Breaking Changes Summary

| Old                     | New                       | Breaking?                           |
| ----------------------- | ------------------------- | ----------------------------------- |
| `StructuredDocument`    | `ContentNode`             | ✅ Yes (model renamed)              |
| `DocumentPath`          | `ContentPath`             | ✅ Yes (model renamed)              |
| `DocumentLink`          | `ContentLink`             | ✅ Yes (model renamed)              |
| `DocumentHistory`       | `ContentHistory`          | ✅ Yes (model renamed)              |
| `DocumentTag`           | `ContentTag`              | ✅ Yes (model renamed)              |
| `docType` string        | Payload table presence    | ✅ Yes (type determination changed) |
| `FileMetadata` (1:0..1) | `FilePayload` (1:1)       | ✅ Yes (model replaced)             |
| `contentData` JSONB     | Typed payloads            | ✅ Yes (storage changed)            |
| No upload state         | `uploadStatus` enum       | ✅ Yes (new invariant)              |
| Nested JSON search      | Materialized `searchText` | ✅ Yes (search strategy changed)    |

**Mitigation:** Since database unused, wipe/reset is safe.

## Query Examples

### 1. File Tree Query (Efficient)

```typescript
// Fetch tree with type information
const tree = await prisma.contentNode.findMany({
  where: {
    ownerId: userId,
    deletedAt: null, // Exclude trash
  },
  include: {
    notePayload: {
      select: {
        metadata: true, // Just metadata, not full content
      },
    },
    filePayload: {
      select: {
        mimeType: true,
        fileSize: true,
        thumbnailUrl: true,
        uploadStatus: true, // Critical for UI
      },
    },
    htmlPayload: {
      select: {
        isTemplate: true,
      },
    },
    children: {
      select: { id: true }, // Just to check if has children
      take: 1,
    },
  },
  orderBy: [
    // Folders first (detected by children presence), then title
    { displayOrder: "asc" },
    { title: "asc" },
  ],
});

// Type detection helper
function getContentType(
  node: (typeof tree)[0]
): "note" | "file" | "html" | "folder" {
  if (node.children.length > 0) return "folder";
  if (node.filePayload) return "file";
  if (node.htmlPayload) return "html";
  if (node.notePayload) return "note";
  throw new Error(`Orphaned node: ${node.id}`);
}
```

### 2. Search Query (All Content Types)

```typescript
async function searchContent(query: string, userId: string) {
  const searchTerm = query.toLowerCase();

  // Search across all payload types
  const results = await prisma.$queryRaw`
    SELECT 
      cn.id,
      cn.title,
      cn."updatedAt",
      CASE 
        WHEN np."contentId" IS NOT NULL THEN 'note'
        WHEN fp."contentId" IS NOT NULL THEN 'file'
        WHEN hp."contentId" IS NOT NULL THEN 'html'
      END as "contentType",
      CASE 
        WHEN np."contentId" IS NOT NULL THEN ts_rank(to_tsvector('english', np."searchText"), plainto_tsquery('english', ${searchTerm}))
        WHEN hp."contentId" IS NOT NULL THEN ts_rank(to_tsvector('english', hp."searchText"), plainto_tsquery('english', ${searchTerm}))
        ELSE 0
      END as relevance,
      CASE 
        WHEN np."contentId" IS NOT NULL THEN substring(np."searchText" from 1 for 200)
        WHEN hp."contentId" IS NOT NULL THEN substring(hp."searchText" from 1 for 200)
        WHEN fp."contentId" IS NOT NULL THEN fp."fileName"
      END as snippet
    FROM "ContentNode" cn
    LEFT JOIN "NotePayload" np ON cn.id = np."contentId"
    LEFT JOIN "FilePayload" fp ON cn.id = fp."contentId"
    LEFT JOIN "HtmlPayload" hp ON cn.id = hp."contentId"
    WHERE cn."ownerId" = ${userId}::uuid
      AND cn."deletedAt" IS NULL
      AND (
        cn.title ILIKE ${`%${searchTerm}%`}
        OR (np."searchText" IS NOT NULL AND to_tsvector('english', np."searchText") @@ plainto_tsquery('english', ${searchTerm}))
        OR (hp."searchText" IS NOT NULL AND to_tsvector('english', hp."searchText") @@ plainto_tsquery('english', ${searchTerm}))
        OR (fp."fileName" IS NOT NULL AND fp."fileName" ILIKE ${`%${searchTerm}%`})
      )
    ORDER BY relevance DESC, cn."updatedAt" DESC
    LIMIT 20
  `;

  return results;
}
```

### 3. Storage Usage by Provider

```typescript
const storageStats = await prisma.filePayload.groupBy({
  by: ["storageProvider"],
  where: {
    content: {
      ownerId: userId,
      deletedAt: null,
    },
    uploadStatus: "ready", // Only count successfully uploaded files
  },
  _sum: {
    fileSize: true,
  },
  _count: {
    contentId: true,
  },
});

// Result:
// [
//   { storageProvider: 'r2', _sum: { fileSize: 5368709120 }, _count: { contentId: 150 } },
//   { storageProvider: 's3', _sum: { fileSize: 2147483648 }, _count: { contentId: 50 } },
// ]
```

### 4. Fetch Note with History

```typescript
const note = await prisma.contentNode.findUnique({
  where: { id: contentId },
  include: {
    notePayload: true,
    history: {
      orderBy: { version: "desc" },
      take: 10,
    },
    sourceLinks: {
      include: {
        target: {
          select: { id: true, title: true, slug: true },
        },
      },
    },
    targetLinks: {
      include: {
        source: {
          select: { id: true, title: true, slug: true },
        },
      },
    },
    contentTags: {
      include: {
        tag: true,
      },
    },
  },
});
```

### 5. Pending File Uploads (Admin Dashboard)

```typescript
const pendingUploads = await prisma.filePayload.findMany({
  where: {
    uploadStatus: "uploading",
    createdAt: {
      lt: new Date(Date.now() - 60 * 60 * 1000), // Older than 1 hour
    },
  },
  include: {
    content: {
      select: {
        id: true,
        title: true,
        ownerId: true,
      },
    },
  },
});

// These uploads likely failed but weren't finalized
// Consider marking as 'failed' or retrying
```

## Next Steps

1. **Wipe/reset database**: `npx prisma migrate reset --force`
2. **Update API routes**: See [04-api-specification.md](./04-api-specification.md) for endpoint updates
3. **Update storage integration**: See [07-file-storage.md](./07-file-storage.md) for finalize workflow
4. **Update UI components**: Type detection from payload presence
5. **Implement background jobs**: Orphan cleanup, trash auto-delete, file processing
6. **Update search UI**: Use materialized searchText, not nested JSON
7. **Test upload workflow**: initiate → client upload → finalize → check uploadStatus
8. **Seed templates**: Create system HTML templates for common use cases

---

**Version Notes:**

- v2.0: Complete refactor to Content + typed payloads (Option A)
- Breaking changes acceptable (database unused)
- All dependent docs must be updated
