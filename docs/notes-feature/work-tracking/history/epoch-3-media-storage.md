---
epoch: 3
name: "Media & Storage"
theme: "File Management, Multi-Cloud, Viewers"
duration: Jan-Feb 2026 (6 weeks)
status: completed
---

# Epoch 3: Media & Storage

## Vision
Transform the Content IDE into a universal file manager supporting images, PDFs, videos, audio, and office documents with multi-cloud storage backends.

## Strategic Goals
1. **Multi-Cloud Storage**: Abstract R2, S3, and Vercel Blob behind unified interface
2. **Rich Media Viewers**: Native viewers for images, PDFs, videos, audio
3. **Office Document Support**: Multi-tier viewing strategy (Google Docs, ONLYOFFICE, Microsoft)
4. **Two-Phase Upload**: Secure, presigned URL-based file upload

## Success Metrics
✅ 3 storage providers with encrypted credentials
✅ Two-phase upload with presigned URLs
✅ 5+ file type viewers (image, PDF, video, audio, office)
✅ Drag-and-drop file upload to tree
✅ Thumbnail generation for images

## Sprints

### Sprint 14-16: Storage Architecture v2 (M7)
**Duration**: Jan 6-26, 2026
**Goal**: Multi-cloud storage abstraction with encrypted credentials
**Deliverables**:
- Storage provider factory pattern
- R2, S3, Vercel Blob implementations
- Encrypted credential storage
- Presigned URL generation
- Two-phase upload workflow

**Storage Providers**:
1. **Cloudflare R2** (Primary)
   - S3-compatible API
   - No egress fees
   - `lib/infrastructure/storage/r2-provider.ts`

2. **AWS S3**
   - Traditional cloud storage
   - Full S3 feature set
   - `lib/infrastructure/storage/s3-provider.ts`

3. **Vercel Blob**
   - Vercel-native storage
   - Simplified API
   - `lib/infrastructure/storage/vercel-provider.ts`

**Factory Pattern**:
```typescript
// lib/infrastructure/storage/factory.ts
export async function createStorageProvider(
  config: StorageProviderConfig
): Promise<StorageProvider> {
  switch (config.type) {
    case 'R2': return new R2Provider(config);
    case 'S3': return new S3Provider(config);
    case 'VERCEL_BLOB': return new VercelBlobProvider(config);
  }
}
```

**Unified Interface**:
- `upload(file, path)` → presigned URL
- `download(path)` → presigned URL
- `delete(path)` → void
- `generatePresignedUrl(path)` → URL with expiry

**Credential Encryption**:
- `STORAGE_ENCRYPTION_KEY` environment variable (32-byte hex)
- Encrypt access keys before storing in database
- Decrypt on-demand when creating provider instance
- `lib/infrastructure/crypto/encryption.ts`

**Prefix Strategy** (same bucket):
```
bucket/
├── uploads/{userId}/{uuid}.{ext}           # Original files
├── uploads/{userId}/{uuid}-thumb-150.{ext} # Small thumbnails
├── uploads/{userId}/{uuid}-thumb-300.{ext} # Large thumbnails
└── backups/{userId}/{uuid}/{timestamp}     # Versioned backups
```

**Two-Phase Upload**:
1. **Phase 1**: `POST /api/content/content/upload/initiate`
   - Validate file type and size
   - Generate presigned URL (15-minute expiry)
   - Return URL to client

2. **Phase 2**: `POST /api/content/content/upload/finalize`
   - Client uploads directly to storage (bypassing server)
   - Client calls finalize with file metadata
   - Server creates FilePayload and ContentNode

**Outcomes**:
- 3 storage providers with unified interface
- Encrypted credentials in database
- <15 second presigned URL generation
- Direct client→storage upload (no server proxy)

### Sprint 17-18: Media Viewers (M7)
**Duration**: Jan 27 - Feb 9, 2026
**Goal**: Native viewers for images, PDFs, videos, audio
**Deliverables**:
- Image viewer with zoom and pan
- PDF viewer with pdfjs-dist
- Video player with keyboard shortcuts
- Audio player with waveform visualization
- Thumbnail generation with Sharp

**Image Viewer** (`components/content/viewers/ImageViewer.tsx`):
- Lightbox mode with dark overlay
- Zoom in/out (Ctrl +/-, or mouse wheel)
- Pan with mouse drag
- Fit to screen / actual size toggle
- Keyboard shortcuts (Esc to close)

**PDF Viewer** (`components/content/viewers/PdfViewer.tsx`):
- pdfjs-dist integration (client-side rendering)
- Page navigation (← → arrows, or page input)
- Zoom controls
- Document outline (if available)
- Download button

**Video Player** (`components/content/viewers/VideoViewer.tsx`):
- HTML5 video element
- Custom controls overlay
- Keyboard shortcuts (Space = play/pause, ← → = skip 5s)
- Playback speed control
- Fullscreen mode

**Audio Player** (`components/content/viewers/AudioViewer.tsx`):
- Waveform visualization (canvas-based)
- Play/pause, seek, volume controls
- Timestamp display (current / duration)
- Keyboard shortcuts (Space = play/pause)

**Thumbnail Generation**:
- Sharp library for image processing
- Generate 150px and 300px thumbnails on upload
- Store alongside original file
- Lazy loading with thumbnails in file tree

**Outcomes**:
- 4 media viewers with keyboard shortcuts
- Thumbnail generation <2 seconds
- Client-side PDF rendering (no server load)
- Waveform visualization for audio

### Sprint 19-20: Office Document Support (M7)
**Duration**: Feb 10-23, 2026
**Goal**: Multi-tier office document viewing strategy
**Deliverables**:
- Google Docs Viewer (Tier 1 - free)
- Microsoft Office Viewer (Tier 2 - free)
- ONLYOFFICE integration (Tier 3 - self-hosted)
- Document creation from templates

**Multi-Tier Strategy**:

**Tier 1: Google Docs Viewer** (Default)
- Free, no authentication required
- Embed iframe: `https://docs.google.com/viewer?url={fileUrl}&embedded=true`
- Supports: DOC, DOCX, XLS, XLSX, PPT, PPTX
- Limitations: No editing, requires public URL

**Tier 2: Microsoft Office Viewer** (Fallback)
- Free, no authentication required
- Embed iframe: `https://view.officeapps.live.com/op/embed.aspx?src={fileUrl}`
- Supports: DOC, DOCX, XLS, XLSX, PPT, PPTX
- Limitations: No editing, requires public URL

**Tier 3: ONLYOFFICE** (Self-Hosted)
- Self-hosted document server
- Full editing capabilities
- Real-time collaboration
- Requires: Docker container + document server URL
- Configuration via `ONLYOFFICE_DOCUMENT_SERVER_URL` env variable

**Document Creation**:
- Generate blank DOCX from template using `docx` library
- Upload to storage and create FilePayload
- Open in viewer immediately

**Viewer Component** (`components/content/viewers/OfficeViewer.tsx`):
```typescript
export function OfficeViewer({ fileUrl, mimeType }: Props) {
  const tier = useMemo(() => {
    if (onlyofficeEnabled) return 'onlyoffice';
    if (preferMicrosoft) return 'microsoft';
    return 'google';
  }, [onlyofficeEnabled, preferMicrosoft]);

  return <iframe src={getViewerUrl(tier, fileUrl)} />;
}
```

**Outcomes**:
- 3-tier viewing strategy (Google → Microsoft → ONLYOFFICE)
- Document creation from templates
- Office document support without paid APIs
- Self-hosted editing option via ONLYOFFICE

## Technical Achievements
- **Storage**: Multi-cloud abstraction with 3 providers
- **Upload**: Two-phase workflow with presigned URLs
- **Viewers**: 7 file type viewers (image, PDF, video, audio, DOC, XLS, PPT)
- **Thumbnails**: Sharp-based thumbnail generation
- **Encryption**: Secure credential storage with AES-256

## Risks Encountered & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Storage credential leaks | Critical | Encrypt all credentials with dedicated key |
| Large file upload timeouts | High | Two-phase upload with presigned URLs |
| PDF rendering performance | Medium | Client-side rendering with pdfjs-dist |
| Office viewer reliability | Medium | Multi-tier fallback strategy |
| Thumbnail generation memory | Medium | Sharp with stream processing |

## Lessons Learned
1. **Presigned URLs**: Offload upload to storage provider (scalability)
2. **Encryption**: Always encrypt storage credentials (security)
3. **Multi-Tier Strategy**: Free tiers + self-hosted = flexibility
4. **Client-Side Rendering**: Reduce server load with browser capabilities
5. **Thumbnail Strategy**: Generate multiple sizes for different use cases

## Metrics
- **Duration**: 6 weeks (7 sprints)
- **Files Created**: ~30 new files
- **Lines of Code**: ~3,500
- **Storage Providers**: 3 (R2, S3, Vercel Blob)
- **File Viewers**: 7 types
- **Upload Performance**: <15s presigned URL generation

## Related Documentation
- [File Storage](../../core/07-file-storage.md)
- [Storage Provider Guide](../../guides/storage/)
- [Media Viewers](../../archive/milestones/M7/M7-MEDIA-VIEWERS-IMPLEMENTATION.md)
- [Office Documents](../../archive/milestones/M7/M7-OFFICE-DOCUMENTS-IMPLEMENTATION.md)

## What's Next
→ **Epoch 4: Export & Extensibility** - Data portability, content types

---

**Completed**: February 2026
**Mapped from**: M7 (Storage Architecture, Media Viewers, Office Documents)
