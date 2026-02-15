---
epoch: 4
name: "Export & Extensibility"
theme: "Data Portability, Content Types"
duration: Feb 2026 (4 weeks)
status: completed
---

# Epoch 4: Export & Extensibility

## Vision
Enable seamless data portability with multi-format export and establish extensible content type system for future payload additions.

## Strategic Goals
1. **Multi-Format Export**: Support Markdown, HTML, JSON, plain text export
2. **Metadata Sidecars**: Preserve semantic information lost in format conversion
3. **Bulk Export**: ZIP archives with folder hierarchy preservation
4. **Type System Refactor**: Discriminated union pattern for type safety
5. **External Content**: Bookmark system with Open Graph preview

## Success Metrics
✅ 4+ export formats (Markdown, HTML, JSON, text)
✅ Metadata sidecar system for re-import
✅ Bulk vault export as ZIP
✅ ContentType discriminant refactor complete
✅ ExternalPayload with Open Graph preview
✅ ContentRole visibility control

## Sprints

### Sprint 21-22: Export System (M8)
**Duration**: Feb 3-16, 2026
**Goal**: Multi-format export with metadata preservation
**Deliverables**:
- TipTap → Markdown converter (Obsidian-compatible)
- TipTap → HTML converter (standalone with CSS)
- TipTap → JSON export (lossless)
- TipTap → Plain text (search indexing)
- Metadata sidecar system
- Bulk ZIP export

**Export Formats**:

**1. Markdown** (Obsidian-compatible)
- Wiki-links: `[[Note Title]]`
- Callouts: `> [!note]`, `> [!warning]`, etc.
- Task lists: `- [ ]`, `- [x]`
- YAML frontmatter with metadata
- Code blocks with language specifiers
- Tables (GitHub Flavored Markdown)

**2. HTML** (Standalone)
- Embedded CSS (light/dark theme support)
- Syntax highlighting with highlight.js
- Responsive layout
- Print-friendly styles
- Standalone (no external dependencies)

**3. JSON** (Lossless)
- Complete TipTap JSON structure
- All node attributes preserved
- Re-importable with zero data loss
- Schema version tracking

**4. Plain Text** (Search indexing)
- Strip all formatting
- Preserve paragraph breaks
- Extract text content only
- Useful for full-text search indexing

**Metadata Sidecar System**:
- `.meta.json` files alongside exports
- Preserves: content ID, tags with colors, wiki-links with target IDs, callout types, timestamps
- Enables accurate re-import with context
- Format:
```json
{
  "contentId": "abc123",
  "title": "Note Title",
  "slug": "note-title",
  "tags": [{"name": "tag1", "color": "#FF5733"}],
  "wikiLinks": [{"targetTitle": "Other Note", "targetId": "def456"}],
  "callouts": [{"type": "warning", "line": 5}],
  "exportedAt": "2026-02-16T10:30:00Z"
}
```

**Bulk Export Features**:
- Export entire vault or filtered subset
- ZIP archive with folder hierarchy
- Auto-generated README.md in export
- Configurable file naming (slug, title, or ID)
- Batch processing for performance

**API Endpoints**:
- `POST /api/content/export/[id]` - Single document export
- `POST /api/content/export/vault` - Bulk vault export
- `GET /api/content/export/health` - Export system health check

**Converter Architecture**:
```
lib/domain/export/
├── converters/
│   ├── markdown-converter.ts    # TipTap → Markdown
│   ├── html-converter.ts        # TipTap → HTML
│   ├── json-converter.ts        # TipTap → JSON
│   └── text-converter.ts        # TipTap → Plain text
├── metadata.ts                  # Sidecar generation
└── bulk-export.ts               # ZIP archive creation
```

**Outcomes**:
- 4 export formats implemented
- Metadata sidecar system for re-import
- Bulk export with folder hierarchy
- <5 second export for 100-page document
- Obsidian-compatible Markdown

### Sprint 23-24: Type System Refactor (M9 Phase 1)
**Duration**: Feb 17-28, 2026 (estimated)
**Goal**: Refactor ContentType to discriminated union pattern
**Deliverables**:
- ContentType enum with discriminant values
- Type-safe payload access via discriminated unions
- Update all API endpoints to use new types
- Database migration for contentType field

**Old Pattern** (String literal):
```typescript
type ContentType = 'NOTE' | 'FILE' | 'CODE' | 'HTML';
```

**New Pattern** (Discriminated union):
```typescript
enum ContentType {
  FOLDER = 'FOLDER',
  NOTE = 'NOTE',
  FILE = 'FILE',
  CODE = 'CODE',
  HTML = 'HTML',
  EXTERNAL = 'EXTERNAL',
}

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
- Prevents impossible states (e.g., FOLDER with NotePayload)
- Compile-time safety for type checks
- Easier to add new content types

**Migration Steps**:
1. Add new ContentType enum values
2. Update Prisma schema with new types
3. Create database migration
4. Update API endpoints to use discriminated unions
5. Update UI components to handle new types
6. Test all CRUD operations

**Outcomes**:
- Type-safe content type system
- Foundation for new payload types
- Reduced runtime errors
- Easier content type additions

### Sprint 25-26: External Links + ContentRole (M9 Phase 2)
**Duration**: Feb 29 - Mar 14, 2026 (estimated)
**Goal**: External link bookmarks with Open Graph preview + ContentRole visibility
**Deliverables**:
- ExternalPayload model and schema
- Open Graph metadata fetcher
- URL validation and security controls
- External link dialog and viewer
- ContentRole enum (REGULAR, REFERENCED)
- File tree filter for referenced content

**ExternalPayload**:
```prisma
model ExternalPayload {
  id        String   @id @default(cuid())
  contentId String   @unique
  content   ContentNode @relation(fields: [contentId], references: [id], onDelete: Cascade)

  url       String
  subtype   ExternalSubtype @default(WEBSITE)

  // Open Graph metadata (cached)
  ogTitle       String?
  ogDescription String?
  ogImage       String?
  ogSiteName    String?
  fetchedAt     DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum ExternalSubtype {
  WEBSITE
  APPLICATION
}
```

**Open Graph Fetcher**:
- Fetch HTML from external URLs (5s timeout, 256KB limit)
- Parse `<meta property="og:*">` tags
- Fallback to `<meta name="title">` and `<title>` tags
- Block cross-domain redirects (except www variants)
- Handle SSL certificate errors with dev-mode bypass
- Return null on failure (no crash)

**Security Controls**:
- HTTPS-only enforcement (bypass via `allowHttp` setting in dev)
- Domain allowlist with wildcard support (`*.github.io`, `google.com`)
- Default allowlist: 50+ popular domains (Google, GitHub, social media, dev resources)
- `allowAllDomains` override for power users (bypasses allowlist)

**UI Components**:
- **ExternalLinkDialog**: Create/edit with name and URL fields
- **ExternalLinkViewer**: Preview card with OG metadata
- **ExternalViewer**: MainPanelContent integration
- **Placeholder Image**: Gradient background when no OG image

**Settings Schema**:
```typescript
external: {
  previewsEnabled: boolean          // Master toggle (default: false)
  allowAllDomains: boolean          // Bypass allowlist (default: false)
  allowlistedHosts: string[]        // Wildcard-supported domains
  allowHttp: boolean                // Allow HTTP URLs (default: false, dev only)
}
```

**ContentRole System**:
- `ContentRole` enum: `REGULAR`, `REFERENCED`
- Per-folder toggle to hide/show referenced content
- File tree filter store (`useFileTreeFilterStore`)
- Toggle button in left sidebar header

**Outcomes**:
- External link bookmarks with Open Graph preview
- Security controls (HTTPS, allowlist, domain validation)
- ContentRole visibility control
- Settings integration for user preferences

## Technical Achievements
- **Export**: 4 formats with metadata sidecars for re-import
- **Bulk Export**: ZIP archives with folder hierarchy
- **Type Safety**: Discriminated union pattern for ContentType
- **External Content**: Open Graph preview with security controls
- **Visibility Control**: ContentRole system for referenced content

## Risks Encountered & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Markdown export compatibility | High | Obsidian-compatible syntax, YAML frontmatter |
| Metadata loss in export | High | Sidecar `.meta.json` files |
| Type refactor breaking changes | Medium | Gradual migration with backward compatibility |
| Open Graph fetch failures | Medium | Timeout, fallback, null handling |
| SSL certificate errors | Low | Dev-mode bypass with `NODE_TLS_REJECT_UNAUTHORIZED` |

## Lessons Learned
1. **Metadata Sidecars**: Essential for lossless export/import roundtrip
2. **Obsidian Compatibility**: Match popular tool syntax for adoption
3. **Discriminated Unions**: TypeScript's type narrowing is powerful
4. **Open Graph**: Many sites don't provide OG metadata (need placeholders)
5. **Security First**: Validate URLs, enforce HTTPS, use allowlists

## Metrics
- **Duration**: 4 weeks (6 sprints)
- **Files Created**: ~25 new files
- **Lines of Code**: ~2,500
- **Export Formats**: 4 (MD, HTML, JSON, text)
- **New Payload Types**: 1 (ExternalPayload)
- **Content Types**: 6 total (FOLDER, NOTE, FILE, CODE, HTML, EXTERNAL)

## Related Documentation
- [Export System](../../core/17-export-import.md)
- [Export Architecture](../../guides/export/EXPORT-BACKUP-ARCHITECTURE.md)
- [Markdown Solution](../../guides/export/EXPORT-MARKDOWN-SOLUTION.md)
- [Type System Refactor](../../archive/milestones/M9/M9-TYPE-SYSTEM-REFACTOR-README.md)

## What's Next
→ **Epoch 5: Advanced Content Types** - Folder views, new payloads

---

**Completed**: February 2026 (ongoing)
**Mapped from**: M8 (Export System), M9 Phase 1 (Type Refactor), M9 Phase 2 (External Links)
