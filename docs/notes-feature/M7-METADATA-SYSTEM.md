# M7: JSON Metadata System Implementation

**Date:** January 24, 2026
**Status:** ✅ Complete & Tested
**Version:** 1.0

## Overview

Implemented a comprehensive JSON metadata system for the `FilePayload.storageMetadata` field. This system provides structured, type-safe storage for file-related metadata without requiring database migrations.

## Motivation

Instead of adding individual columns like `googleDriveFileId`, we created a flexible metadata system that:
- Supports multiple external integrations (Google Drive, OnlyOffice, Office 365)
- Enables future features (OCR, AI analysis, document metadata)
- Maintains type safety through TypeScript and Zod validation
- Avoids database migrations for new features

## Architecture

### 1. Type Definitions (`lib/content/metadata-schemas.ts`)

Comprehensive TypeScript interfaces for all metadata shapes:

```typescript
interface FileMetadata {
  externalProviders?: {
    googleDrive?: { fileId: string; lastSynced: string; ... }
    onlyOffice?: { sessionId: string; locked: boolean; ... }
    office365?: { fileId: string; lastSynced: string; ... }
  }
  processing?: {
    ocr?: { status: string; confidence: number; ... }
    ai?: { summary: string; entities: [...]; ... }
  }
  document?: {
    pdf?: { pageCount: number; version: string; ... }
    office?: { wordCount: number; author: string; ... }
  }
  media?: {
    image?: { exif: {...}; colorProfile: string; ... }
    video?: { fps: number; codec: string; ... }
    audio?: { bitrate: number; sampleRate: number; ... }
  }
  custom?: Record<string, unknown>
}
```

### 2. Runtime Validation (`lib/content/metadata-validators.ts`)

Zod schemas for runtime type checking:

```typescript
import { validateMetadata, GoogleDriveMetadataSchema } from '@/lib/content/metadata-validators';

// Validate entire metadata
const result = validateMetadata(filePayload.storageMetadata);
if (result.success) {
  console.log(result.data); // Typed FileMetadata
}

// Validate specific schema
const driveData = GoogleDriveMetadataSchema.parse({
  fileId: 'abc123',
  lastSynced: new Date().toISOString(),
});
```

### 3. Helper Functions

Type-safe utility functions:

```typescript
import { getMetadata, setMetadata, hasGoogleDriveIntegration } from '@/lib/content/metadata-schemas';

// Get typed metadata
const metadata = getMetadata(filePayload.storageMetadata);

// Deep merge updates
const updated = setMetadata(existing, {
  externalProviders: {
    googleDrive: { fileId: '...', lastSynced: '...' }
  }
});

// Type guards
if (hasGoogleDriveIntegration(metadata)) {
  console.log(metadata.externalProviders.googleDrive.fileId);
}
```

### 4. Documentation (`docs/notes-feature/METADATA-SCHEMAS.md`)

Comprehensive guide with:
- Schema definitions
- Usage examples
- Querying patterns (Prisma JSON operators)
- Versioning strategy
- Governance process

## Google Drive Integration Fix

### Problem
- Documents were re-uploaded to Google Drive every time the file was opened
- Edits didn't persist because each upload created a new Google Drive file
- No tracking of Google Drive file IDs in the database

### Solution

**1. Upload API saves file ID to metadata:**
```typescript
// app/api/google-drive/upload/route.ts
const updatedMetadata = setGoogleDriveMetadata(filePayload.storageMetadata, {
  fileId: uploadResult.id,
  lastSynced: new Date().toISOString(),
  editUrl: uploadResult.webViewLink,
  googleMimeType: uploadResult.mimeType,
});

await prisma.filePayload.update({
  where: { contentId },
  data: { storageMetadata: updatedMetadata },
});
```

**2. GoogleDocsEditor checks metadata before uploading:**
```typescript
// Check for existing Google Drive file
const existingFileId = storageMetadata?.externalProviders?.googleDrive?.fileId;

if (existingFileId) {
  console.log("Reusing existing Google Drive file:", existingFileId);
  setGoogleFileId(existingFileId);
  return;
}

// Only upload if no existing file
const response = await fetch("/api/google-drive/upload", { ... });
```

### Result
- ✅ No more duplicate uploads
- ✅ Edits persist across sessions
- ✅ Single Google Drive file per content node
- ✅ Metadata tracks sync status

## Schema Standards

### Field Naming
- Use camelCase for field names
- Use descriptive names (not abbreviations)
- Boolean fields start with `is`, `has`, or `should`

### Date Fields
- Always use ISO 8601 format strings
- Field names end with `At` or `Date`
- Store as strings, not Date objects (JSON compatibility)

### Enums
- Use string literals for enum values
- Keep values lowercase with hyphens
- Example: `status: 'pending' | 'processing' | 'completed' | 'failed'`

### Nesting
- Maximum 3 levels deep
- Group related fields under common parent
- Use optional fields liberally

## Querying Metadata

### Prisma JSON Operators

**Check if Google Drive integration exists:**
```typescript
const filesWithDrive = await prisma.filePayload.findMany({
  where: {
    storageMetadata: {
      path: ['externalProviders', 'googleDrive', 'fileId'],
      not: null,
    }
  }
});
```

**Find specific Google Drive file:**
```typescript
const file = await prisma.filePayload.findFirst({
  where: {
    storageMetadata: {
      path: ['externalProviders', 'googleDrive', 'fileId'],
      equals: driveFileId,
    }
  }
});
```

**Find files needing OCR:**
```typescript
const needsOCR = await prisma.filePayload.findMany({
  where: {
    storageMetadata: {
      path: ['processing', 'ocr', 'status'],
      equals: 'pending',
    }
  }
});
```

## Future Features Enabled

This metadata system enables:

### External Integrations
- ✅ Google Drive (implemented)
- 🔜 OnlyOffice (self-hosted collaborative editing)
- 🔜 Office 365 (Microsoft cloud editing)
- 🔜 Backblaze B2 (secondary backup)

### Processing Features
- 🔜 OCR (text extraction from PDFs and images)
- 🔜 AI analysis (summarization, entity extraction)
- 🔜 Thumbnail generation
- 🔜 Video transcoding

### Document Metadata
- 🔜 Page/word/slide count extraction
- 🔜 Author and creation date
- 🔜 Version tracking
- 🔜 Comment and macro detection

### Media Metadata
- 🔜 EXIF data extraction (camera, GPS, etc.)
- 🔜 Face detection
- 🔜 Color profile analysis
- 🔜 Music metadata (artist, album, etc.)

## Versioning Strategy

### Current Version: 1.0
- External providers (Google Drive, OnlyOffice, Office 365)
- Processing metadata (OCR, AI)
- Document metadata (PDF, Office)
- Media metadata (Image, Video, Audio)

### Adding New Fields
1. Make all new fields optional (existing records won't have them)
2. Update TypeScript types in `metadata-schemas.ts`
3. Update Zod validators in `metadata-validators.ts`
4. Add usage examples to `METADATA-SCHEMAS.md`
5. Never remove fields (only deprecate with `@deprecated`)

### Breaking Changes
If you need breaking changes:
1. Add `version` field to metadata root: `{ version: 2, ... }`
2. Write migration function to convert v1 → v2
3. Update `getMetadata()` to handle multiple versions
4. Run background migration to update existing records

## Testing

### Manual Testing
1. ✅ Upload .docx file to Notes IDE
2. ✅ Open in Google Docs viewer
3. ✅ First load: uploads to Google Drive
4. ✅ Database: check `storageMetadata.externalProviders.googleDrive.fileId`
5. ✅ Make edit in Google Docs (add text, format, etc.)
6. ✅ Navigate away and return
7. ✅ Second load: reuses existing Google Drive file (check console logs)
8. ✅ Edits persist in Google Docs

### Future: Automated Tests
- Unit tests for metadata helpers (`getMetadata`, `setMetadata`, type guards)
- Validation tests for Zod schemas
- Integration tests for Google Drive upload flow
- E2E tests for edit persistence

## Files Changed

### Created
- `lib/content/metadata-schemas.ts` - TypeScript types and helpers
- `lib/content/metadata-validators.ts` - Zod runtime validation
- `docs/notes-feature/METADATA-SCHEMAS.md` - Comprehensive documentation
- `docs/notes-feature/M7-METADATA-SYSTEM.md` - This file

### Modified
- `app/api/google-drive/upload/route.ts` - Save file ID to metadata after upload
- `components/content/viewer/GoogleDocsEditor.tsx` - Check metadata before upload, reuse existing files
- `lib/content/api-types.ts` - Add `storageMetadata` to API response type
- `app/api/content/content/[id]/route.ts` - Include `storageMetadata` in GET response

### No Changes Required
- `prisma/schema.prisma` - Existing `storageMetadata Json @default("{}")` field reused (no migration needed)

## Related Documentation

- [METADATA-SCHEMAS.md](./METADATA-SCHEMAS.md) - Full metadata reference
- [M7-STORAGE-ARCHITECTURE-V2.md](./M7-STORAGE-ARCHITECTURE-V2.md) - Storage provider system
- [M7-OFFICE-DOCUMENTS-IMPLEMENTATION.md](./M7-OFFICE-DOCUMENTS-IMPLEMENTATION.md) - Google Docs integration

## Success Metrics

- ✅ Zero database migrations required for Google Drive integration
- ✅ Type-safe metadata access with TypeScript
- ✅ Runtime validation with Zod
- ✅ Extensible for future features (OCR, AI, etc.)
- ✅ Comprehensive documentation and governance process
- ✅ Google Drive edit persistence working
- ✅ No duplicate uploads on reload
