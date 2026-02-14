
# Export & Multi-Format Conversion System - Implementation Summary

**Status:** ✅ Core Implementation Complete
**Date:** 2026-01-26

## What Was Built

A comprehensive export and document conversion system that converts TipTap editor content to multiple formats with metadata preservation.

### ✅ Completed Features

#### 1. Multi-Format Converter System
**Location:** `lib/domain/export/`

**Implemented Converters:**
- ✅ **Markdown** - Full featured with metadata sidecars
  - Obsidian-style wiki-links `[[Note|Display]]`
  - Tag preservation with HTML comments
  - Callout syntax `> [!type]`
  - YAML frontmatter support
  - Metadata sidecar (`.meta.json`) for semantic preservation

- ✅ **HTML** - Standalone documents with embedded CSS
  - Light/dark theme support
  - Syntax highlighting
  - Responsive design
  - Glassmorphism-compatible styling

- ✅ **JSON** - Lossless TipTap export
  - Pretty-printed JSON
  - No data loss
  - Direct re-import capability

- ✅ **Plain Text** - Simple text extraction
  - Preserves paragraph breaks
  - Removes all formatting
  - Good for search indexing

- 🚧 **PDF** - Stub implementation
  - Ready for Puppeteer integration
  - HTML → PDF conversion path defined
  - Commented implementation example included

- 🚧 **DOCX** - Stub implementation
  - Ready for `docx` library integration
  - Node mapping strategy documented
  - Commented implementation example included

#### 2. Metadata Sidecar System
**Location:** `lib/domain/export/metadata.ts`

**Preserved Information:**
- Content ID, title, slug
- Creation/update timestamps
- Tags with colors and usage counts
- Wiki-link relationships with target IDs
- Callout types and titles
- Custom user metadata

**Format:**
```json
{
  "version": "1.0",
  "contentId": "uuid",
  "title": "My Note",
  "tags": [
    { "id": "tag-1", "name": "important", "color": "#ff0000" }
  ],
  "wikiLinks": [
    { "targetTitle": "Related Note", "contentId": "uuid-2" }
  ]
}
```

#### 3. Bulk Export Service
**Location:** `lib/domain/export/bulk-export.ts`

**Features:**
- Export entire vault or filtered subset
- ZIP archive generation
- Folder hierarchy preservation
- Batch processing for performance
- Auto-generated README in exports
- Progress tracking support
- Configurable file naming (slug/title/id)

#### 4. API Endpoints

**Single Document Export:**
```
POST /api/content/export/[id]
{
  "format": "markdown"
}
```

**Bulk Vault Export:**
```
POST /api/content/export/vault
{
  "format": "markdown",
  "filters": {
    "tags": ["important"],
    "includeDeleted": false
  }
}
```

#### 5. Settings Integration

**Updated Files:**
- `lib/features/settings/validation.ts` - Added `exportBackup` schema
- `components/settings/SettingsSidebar.tsx` - Added "Export & Backup" link
- `app/(authenticated)/settings/export/page.tsx` - Settings page
- `app/(authenticated)/settings/export/ExportSettingsClient.tsx` - Interactive UI

**Settings Structure:**
```typescript
exportBackup: {
  defaultFormat: 'markdown',
  markdown: {
    includeMetadata: true,
    preserveSemantics: true,
    wikiLinkStyle: '[[]]',
    // ... more options
  },
  bulkExport: {
    batchSize: 50,
    compressionFormat: 'zip',
    includeStructure: true,
  }
}
```

---

## Usage Examples

### Export Single Document

```typescript
// From client component
const response = await fetch(`/api/content/export/${contentId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ format: 'markdown' }),
});

const blob = await response.blob();
// Download file...
```

### Export Entire Vault

```typescript
// From settings page
const response = await fetch('/api/content/export/vault', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    format: 'markdown',
    filters: {
      tags: ['important', 'work'],
      includeDeleted: false,
    },
  }),
});

const zipBlob = await response.blob();
// Download ZIP...
```

### Programmatic Conversion

```typescript
import { convertDocument } from '@/lib/domain/export';

const result = await convertDocument(tiptapJson, {
  format: 'markdown',
  settings: userSettings.exportBackup,
  metadata: {
    customMetadata: {
      title: 'My Note',
      tags: [...],
    },
  },
});

// result.files[0].content = markdown string
// result.files[1].content = metadata JSON (if enabled)
```

---

## Architecture Highlights

### Factory Pattern
```
User Request
    ↓
getConverter(format)
    ↓
MarkdownConverter | HTMLConverter | JSONConverter | ...
    ↓
ConversionResult { files: [...] }
```

### Metadata Flow
```
TipTap JSON
    ↓
extractWikiLinksFromTipTap()
extractCalloutsFromTipTap()
extractTagsFromTipTap()
    ↓
generateMetadataSidecar()
    ↓
.meta.json file
```

### Bulk Export Flow
```
Fetch notes (with filters)
    ↓
Process in batches
    ↓
Convert each note
    ↓
Add to ZIP with folder structure
    ↓
Return ZIP buffer
```

---

## Testing Checklist

### Unit Tests Needed
- [ ] Markdown converter with all node types
- [ ] HTML converter with themes
- [ ] Metadata extraction utilities
- [ ] Bulk export with filters
- [ ] File naming strategies

### Integration Tests Needed
- [ ] API endpoint: single document export
- [ ] API endpoint: vault export
- [ ] Settings: save/load export preferences
- [ ] ZIP integrity check

### E2E Tests Needed
- [ ] User exports single note (all formats)
- [ ] User exports vault
- [ ] Markdown + metadata sidecar download
- [ ] Re-import exported markdown

---

## Required Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "jszip": "^3.10.1"
  },
  "devDependencies": {
    "@types/jszip": "^3.4.1"
  }
}
```

Optional (for PDF/DOCX):
```json
{
  "dependencies": {
    "puppeteer": "^21.7.0",
    "docx": "^8.5.0"
  }
}
```

---

## Next Steps

### Phase 1: Complete Core Converters (Current)
- ✅ Markdown with metadata
- ✅ HTML standalone
- ✅ JSON lossless
- ✅ Plain text
- ⏳ Test and refine

### Phase 2: Advanced Formats
- [ ] Implement PDF converter (Puppeteer)
- [ ] Implement DOCX converter (docx library)
- [ ] Add LaTeX support
- [ ] Add AsciiDoc support

### Phase 3: Markdown Import
- [ ] Create markdown upload endpoint
- [ ] Detect and parse metadata sidecars
- [ ] Restore tags from metadata
- [ ] Restore wiki-links from metadata
- [ ] Handle frontmatter parsing

### Phase 4: Auto Backup
- [ ] Background job queue
- [ ] Scheduled backup triggers
- [ ] Backup to storage providers
- [ ] Backup rotation (keep last N)
- [ ] Restore from backup UI

### Phase 5: Polish
- [ ] Export progress tracking
- [ ] Streaming for large exports
- [ ] Export history log
- [ ] Email notification when done
- [ ] Comparison tool (diff exports)

---

## Known Limitations

1. **PDF/DOCX Not Implemented**
   - Stub implementations included
   - Requires additional dependencies
   - Puppeteer adds ~300MB to deployment

2. **No Import Yet**
   - Export works, but import needs separate implementation
   - Markdown → TipTap conversion exists but not in upload flow

3. **No Auto Backup**
   - Settings schema ready
   - Background job system needed

4. **Table Export**
   - Markdown tables work
   - Complex tables may lose styling

5. **Large Vaults**
   - Current implementation loads all notes
   - May need streaming for 10,000+ notes

---

## File Locations

### Core System
```
lib/domain/export/
├── types.ts                    # TypeScript interfaces
├── index.ts                    # Barrel export
├── factory.ts                  # Converter factory
├── metadata.ts                 # Metadata utilities
├── bulk-export.ts              # Bulk export service
└── converters/
    ├── markdown.ts             # Markdown converter
    ├── html.ts                 # HTML converter
    ├── json.ts                 # JSON converter
    ├── plaintext.ts            # Plain text converter
    ├── pdf.ts                  # PDF stub
    └── docx.ts                 # DOCX stub
```

### API Routes
```
app/api/content/export/
├── [id]/route.ts               # Single document export
└── vault/route.ts              # Bulk vault export
```

### Settings
```
app/(authenticated)/settings/export/
├── page.tsx                    # Server component
└── ExportSettingsClient.tsx   # Client component
```

### Settings Integration
```
lib/features/settings/
└── validation.ts               # Updated with exportBackup schema
```

---

## Performance Considerations

### Batch Processing
- Processes 50 notes at a time (configurable)
- Prevents memory exhaustion
- Parallel conversion within batches

### ZIP Compression
- Level 9 compression for ZIP
- Level 0 (no compression) for tar.gz
- Configurable compression format

### Streaming
- Currently loads entire vault into memory
- For 10,000+ notes, implement streaming
- Stream directly to response

### Caching
- Cache converted documents
- Invalidate on content update
- Store in storage bucket

---

## Security Notes

### Rate Limiting
- Should add: 10 exports per minute
- Should add: 1 vault export per 5 minutes

### File Size Limits
- Single export: 100MB
- Vault export: 5GB
- Configurable in settings

### Access Control
- User can only export own content
- Session validation on every request
- No public export endpoints

---

## Schema Versioning & Evolution

**CRITICAL:** The export system includes comprehensive schema versioning to prevent breaking changes when TipTap extensions evolve.

### Version Format

```
MAJOR.MINOR.PATCH (Semantic Versioning)
```

### Version Bump Rules

| Change | Bump | Migration | Example |
|--------|------|-----------|---------|
| Remove extension | **MAJOR** (X.0.0) | ✅ Required | Remove callout |
| Rename node/mark | **MAJOR** (X.0.0) | ✅ Required | internalLink → wikiLink |
| Change attr type | **MAJOR** (X.0.0) | ✅ Required | level: string → number |
| Add extension | **MINOR** (0.X.0) | ❌ Not needed | Add highlight |
| Add optional attr | **MINOR** (0.X.0) | ❌ Not needed | Add color?: string |
| Fix converter bug | **PATCH** (0.0.X) | ❌ Not needed | Fix syntax |

### When to Update Schema Version

**Every time you:**
- Add/modify/remove a TipTap extension
- Change extension attributes or behavior
- Upgrade TipTap core library

**Update checklist:**
1. [ ] Update `TIPTAP_SCHEMA_VERSION` in `lib/domain/editor/schema-version.ts`
2. [ ] Add entry to `SCHEMA_HISTORY` array
3. [ ] Update converters if schema changed
4. [ ] Create migration if MAJOR bump
5. [ ] Run tests: `pnpm test lib/domain/export`

### Automatic Protection

- **Pre-commit hook** enforces version updates
- **Compatibility tests** catch breaking changes
- **Migration system** handles old exports
- **Fallback handlers** prevent crashes
- **Health monitoring** tracks discrepancies

### Quick Reference

**See comprehensive versioning guide:**
- `VERSIONING-QUICK-REFERENCE.md` - One-page cheat sheet
- `TIPTAP-SCHEMA-EVOLUTION-GUIDE.md` - Full guide
- `SCHEMA-EVOLUTION-SUMMARY.md` - Overview

---

## Maintenance

### Adding New Format

1. Create converter in `lib/domain/export/converters/`
2. Implement `DocumentConverter` interface
3. Add to factory in `factory.ts`
4. Update `ExportFormat` type in `types.ts`
5. Add UI option in settings page

### Updating Metadata Schema

1. Update `MetadataSidecar` interface in `metadata.ts`
2. Update extraction functions
3. Update version number in metadata
4. Implement migration for old exports

---

## Support

**Documentation:**
- `EXPORT-BACKUP-ARCHITECTURE.md` - Complete system architecture
- `EXPORT-MARKDOWN-SOLUTION.md` - Markdown compatibility guide
- `VERSIONING-QUICK-REFERENCE.md` - Schema versioning cheat sheet ⭐
- `TIPTAP-SCHEMA-EVOLUTION-GUIDE.md` - Comprehensive versioning guide
- `ERROR-HANDLING-GUIDE.md` - Error monitoring and validation
- `00-index.md` - Documentation index

**Versioning & Schema Evolution:**
- When adding TipTap extensions: See `VERSIONING-QUICK-REFERENCE.md`
- When modifying extensions: See `TIPTAP-SCHEMA-EVOLUTION-GUIDE.md`
- When breaking changes occur: Create migration in `lib/domain/export/migrations.ts`

**Common Issues:**
- Missing dependencies: Run `pnpm install jszip`
- Export fails: Check logs for converter errors
- ZIP corrupted: Verify compression format setting
- Schema version outdated: Update `lib/domain/editor/schema-version.ts`
- Pre-commit hook blocks: Update schema version or fix tests
