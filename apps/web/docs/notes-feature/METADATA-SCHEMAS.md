# File Payload Metadata Schemas

**Version:** 1.0
**Last Updated:** January 23, 2026
**Status:** Active Standard

## Overview

The `FilePayload.storageMetadata` JSON field stores structured metadata about uploaded files. This document defines the standard schemas, provides usage examples, and establishes governance processes for managing metadata shapes.

## Why JSON Metadata?

**Flexibility:** Add new features without database migrations
**Extensibility:** Different file types can store type-specific data
**Future-proof:** External integrations (Google Drive, OnlyOffice, AI) can be added seamlessly

## Schema Location

**TypeScript Types:** `apps/web/lib/content/metadata-schemas.ts`
**Documentation:** This file

## Core Metadata Structure

```typescript
interface FileMetadata {
  // External editing services (Google Drive, OnlyOffice, Office 365)
  externalProviders?: ExternalProviders;

  // Processing (OCR, AI analysis, text extraction)
  processing?: ProcessingMetadata;

  // Document-specific (PDF, Office docs)
  document?: {
    pdf?: PDFMetadata;
    office?: OfficeDocumentMetadata;
  };

  // Media-specific (images, video, audio)
  media?: {
    image?: ImageMetadata;
    video?: VideoMetadata;
    audio?: AudioMetadata;
  };

  // Custom application-specific metadata
  custom?: Record<string, unknown>;
}
```

## Usage Examples

### Example 1: Google Drive Integration

```typescript
import { setGoogleDriveMetadata, getGoogleDriveFileId } from '@/lib/content/metadata-schemas';

// After uploading to Google Drive
const updatedMetadata = setGoogleDriveMetadata(filePayload.storageMetadata, {
  fileId: 'abc123',
  lastSynced: new Date().toISOString(),
  editUrl: 'https://docs.google.com/document/d/abc123/edit',
  googleMimeType: 'application/vnd.google-apps.document',
});

await prisma.filePayload.update({
  where: { contentId },
  data: { storageMetadata: updatedMetadata },
});

// Check if file already has Google Drive integration
const driveFileId = getGoogleDriveFileId(filePayload.storageMetadata);
if (driveFileId) {
  // Reuse existing Drive file instead of uploading new one
  console.log('Using existing Drive file:', driveFileId);
}
```

### Example 2: OCR Processing

```typescript
import { setMetadata } from '@/lib/content/metadata-schemas';

// Mark PDF for OCR processing
const metadata = setMetadata(filePayload.storageMetadata, {
  processing: {
    ocr: {
      status: 'pending',
      provider: 'tesseract',
    }
  }
});

// After OCR completes, update with results
const updatedMetadata = setMetadata(filePayload.storageMetadata, {
  processing: {
    ocr: {
      status: 'completed',
      confidence: 0.95,
      language: 'en',
      completedAt: new Date().toISOString(),
    }
  }
});

// Update searchText field with extracted text
await prisma.filePayload.update({
  where: { contentId },
  data: {
    storageMetadata: updatedMetadata,
    searchText: extractedText,
    isProcessed: true,
  },
});
```

### Example 3: Document Metadata Extraction

```typescript
import { setMetadata } from '@/lib/content/metadata-schemas';

// After processing Word document
const metadata = setMetadata(filePayload.storageMetadata, {
  document: {
    office: {
      pageCount: 12,
      wordCount: 3500,
      author: 'John Doe',
      createdDate: '2025-01-15T10:30:00Z',
      language: 'en',
      hasComments: false,
      hasMacros: false,
    }
  }
});
```

### Example 4: Image EXIF Data

```typescript
import { setMetadata } from '@/lib/content/metadata-schemas';

// After processing uploaded image
const metadata = setMetadata(filePayload.storageMetadata, {
  media: {
    image: {
      exif: {
        camera: 'Canon EOS R5',
        dateTaken: '2026-01-20T14:23:00Z',
        gps: {
          latitude: 37.7749,
          longitude: -122.4194,
        }
      },
      colorProfile: 'sRGB',
      hasAlpha: false,
    }
  }
});
```

### Example 5: Multiple Integrations

```typescript
import { setMetadata } from '@/lib/content/metadata-schemas';

// Complex metadata with multiple integrations
const metadata = setMetadata(filePayload.storageMetadata, {
  externalProviders: {
    googleDrive: {
      fileId: 'abc123',
      lastSynced: '2026-01-23T12:00:00Z',
    },
    onlyOffice: {
      sessionId: 'xyz789',
      locked: true,
      lockedBy: 'user-123',
      lockExpiry: '2026-01-23T13:00:00Z',
    }
  },
  processing: {
    ocr: {
      status: 'completed',
      confidence: 0.92,
      language: 'en',
    },
    ai: {
      summary: 'This document discusses...',
      topics: ['business', 'strategy', 'planning'],
      sentiment: 'positive',
    }
  },
  document: {
    pdf: {
      pageCount: 25,
      version: '1.7',
      isSearchable: true,
    }
  }
});
```

## Schema Versioning

### Current Version: 1.0

**Date:** January 23, 2026
**Initial schemas:**
- ExternalProviders (Google Drive, OnlyOffice, Office 365)
- ProcessingMetadata (OCR, AI)
- Document metadata (PDF, Office)
- Media metadata (Image, Video, Audio)

### Migration Strategy

When adding new fields to existing schemas:

1. **Always make fields optional** - existing records won't have new fields
2. **Provide defaults** - use `getMetadata()` helper which handles missing data
3. **Never remove fields** - only deprecate (mark as `@deprecated` in TypeScript)
4. **Document changes** - update this file with version history

### Breaking Changes

If you need to make breaking changes to metadata structure:

1. Add a `version` field to metadata root: `{ version: 2, ... }`
2. Write migration function to convert v1 → v2
3. Update `getMetadata()` to handle multiple versions
4. Run background migration to update existing records

## Type Safety

### Accessing Metadata (Type-Safe)

```typescript
import { getMetadata, hasGoogleDriveIntegration } from '@/lib/content/metadata-schemas';

const metadata = getMetadata(filePayload.storageMetadata);

// TypeScript knows the shape
if (metadata.externalProviders?.googleDrive) {
  const fileId = metadata.externalProviders.googleDrive.fileId; // string
  const lastSynced = metadata.externalProviders.googleDrive.lastSynced; // string
}

// Type guard for specific integrations
if (hasGoogleDriveIntegration(metadata)) {
  // TypeScript knows googleDrive exists and has fileId
  console.log(metadata.externalProviders.googleDrive.fileId);
}
```

### Updating Metadata (Type-Safe)

```typescript
import { setMetadata } from '@/lib/content/metadata-schemas';

// TypeScript enforces schema shape
const updated = setMetadata(filePayload.storageMetadata, {
  externalProviders: {
    googleDrive: {
      fileId: 'abc',
      lastSynced: new Date().toISOString(),
      // TypeScript error if you use wrong types:
      // fileId: 123,  // ❌ Type 'number' is not assignable to type 'string'
    }
  }
});
```

## Querying Metadata in Prisma

Since `storageMetadata` is a JSON field, you can query it using Prisma's JSON operators:

### Check if Google Drive integration exists

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

### Find files needing OCR processing

```typescript
const needsOCR = await prisma.filePayload.findMany({
  where: {
    OR: [
      {
        storageMetadata: {
          path: ['processing', 'ocr', 'status'],
          equals: 'pending',
        }
      },
      {
        storageMetadata: {
          path: ['processing', 'ocr'],
          equals: null,
        },
        mimeType: {
          contains: 'pdf',
        }
      }
    ]
  }
});
```

### Find specific Google Drive file

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

## Governance Process

### Adding New Metadata Fields

**When to add new fields:**
- External integrations (new editing services, storage providers)
- Processing features (OCR, AI, thumbnails, transcoding)
- Document analysis (metadata extraction, text analysis)

**Process:**

1. **Update TypeScript types** in `lib/content/metadata-schemas.ts`
   - Add interface definition
   - Update `FileMetadata` interface
   - Add helper functions if needed (like `hasGoogleDriveIntegration`)

2. **Update this documentation** with:
   - Schema definition
   - Usage examples
   - Query examples (if applicable)
   - Version number bump

3. **Write tests** (future: `lib/content/metadata-schemas.test.ts`)
   - Test helper functions
   - Test type safety
   - Test deep merge behavior

4. **Update API types** if needed (`lib/content/api-types.ts`)

### Schema Standards

**Field naming:**
- Use camelCase for field names
- Use descriptive names (not abbreviations)
- Boolean fields start with `is`, `has`, or `should`

**Date fields:**
- Always use ISO 8601 format strings
- Field names end with `At` or `Date`
- Store as strings, not Date objects (JSON compatibility)

**Enums:**
- Use string literals for enum values
- Keep values lowercase with hyphens
- Example: `status: 'pending' | 'processing' | 'completed' | 'failed'`

**Nesting:**
- Maximum 3 levels deep
- Group related fields under common parent
- Use optional fields liberally

## Future Enhancements

### Planned Additions (v1.1)

- **Backblaze B2 integration** - Secondary backup provider
- **Version tracking** - Track file version history
- **Collaboration metadata** - Real-time editing sessions
- **Access analytics** - View counts, last viewed, etc.

### Under Consideration

- **Metadata validation** - Runtime schema validation with Zod
- **Metadata compression** - Large metadata (EXIF) could be compressed
- **Metadata search** - Full-text search across metadata fields
- **Metadata API** - Dedicated endpoints for querying metadata

## Related Documentation

- [Database Design](./03-database-design.md) - FilePayload model schema
- [Storage Architecture](./M7-STORAGE-ARCHITECTURE-V2.md) - Storage provider system
- [API Specification](./04-api-specification.md) - API endpoints for file management

## Change Log

### Version 1.0 - January 23, 2026
- Initial metadata schema system
- Google Drive integration support
- OCR and AI processing metadata
- Document and media metadata structures
- Helper functions for type-safe access
