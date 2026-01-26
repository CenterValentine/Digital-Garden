# M7 Storage Architecture - Design Analysis

**Created:** January 20, 2026
**Purpose:** Comprehensive storage integration design before implementation

## Current State Analysis

### ✅ What We Have

**Database Schema** ([schema.prisma:265-280](../../prisma/schema.prisma#L265-L280)):
```prisma
model StorageProviderConfig {
  id            String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId        String          @db.Uuid
  provider      StorageProvider // Enum: r2, s3, vercel
  isDefault     Boolean         @default(false)
  displayName   String?         @db.VarChar(100)
  config        Json            @db.JsonB  // Provider credentials + settings
  isActive      Boolean         @default(true)
  createdAt     DateTime        @default(now()) @db.Timestamptz()
  updatedAt     DateTime        @updatedAt @db.Timestamptz()

  user          User            @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, provider])  // One config per provider per user
  @@index([userId, isDefault])
}
```

**API Endpoints** (Already Implemented):
- ✅ `GET /api/content/storage` - List user's storage configurations
- ✅ `POST /api/content/storage` - Create new storage configuration
- ✅ `GET /api/content/storage/[id]` - Get specific configuration
- ✅ `PATCH /api/content/storage/[id]` - Update configuration
- ✅ `DELETE /api/content/storage/[id]` - Delete configuration (with safety checks)

**Upload Flow** (Skeleton Implemented):
- ✅ Two-phase upload pattern designed
- ✅ `POST /api/content/content/upload/initiate` - Creates ContentNode + FilePayload, returns presigned URL
- ✅ `POST /api/content/content/upload/finalize` - Verifies upload, extracts metadata, marks ready
- ⚠️ Storage SDK integration is placeholder (lines 215-237, 195-213)

### ❌ What We Need to Build

**Core Storage Layer:**
1. ❌ Storage provider interface (`/lib/storage/types.ts`)
2. ❌ R2 provider implementation (`/lib/storage/r2-provider.ts`)
3. ❌ S3 provider implementation (`/lib/storage/s3-provider.ts`)
4. ❌ Vercel Blob provider implementation (`/lib/storage/vercel-provider.ts`)
5. ❌ Storage provider factory (`/lib/storage/factory.ts`)
6. ❌ Media processing utilities (`/lib/media/`)

**UI Components:**
7. ❌ Settings page for storage configuration (`/app/(authenticated)/settings/storage/`)
8. ❌ File upload components (drag-and-drop, progress)
9. ❌ Media viewers (image, PDF, video, audio)
10. ❌ File management operations (download, delete)

---

## Architecture Design

### 1. Storage Provider Abstraction

**Design Goal:** Single interface for all storage providers, swappable at runtime based on user config.

**Interface Design** (`/lib/storage/types.ts`):
```typescript
export interface StorageProvider {
  /** Generate presigned URL for direct client upload */
  generateUploadUrl(key: string, mimeType: string, expiresIn?: number): Promise<PresignedUrl>;

  /** Generate presigned URL for download */
  generateDownloadUrl(key: string, expiresIn?: number): Promise<string>;

  /** Verify file exists and get metadata */
  verifyFileExists(key: string): Promise<{ exists: boolean; size?: number; etag?: string }>;

  /** Get public URL for file (if publicly accessible) */
  getPublicUrl(key: string): string;

  /** Delete file from storage */
  deleteFile(key: string): Promise<void>;

  /** Copy file to new key (for deduplication) */
  copyFile(sourceKey: string, destKey: string): Promise<void>;

  /** Get file stream (for media processing) */
  getFileStream(key: string): Promise<ReadableStream>;
}

export interface PresignedUrl {
  url: string;
  method: 'PUT' | 'POST';
  headers?: Record<string, string>;
  fields?: Record<string, string>; // For multipart POST
  expiresAt: Date;
}
```

**Why This Design:**
- ✅ Client-side uploads (reduces server bandwidth)
- ✅ Presigned URLs for security (no public write access)
- ✅ Provider-agnostic interface (easy to add new providers)
- ✅ Stream support for efficient media processing
- ✅ Copy operation for deduplication

### 2. Storage Configuration Strategy

**Two-Tier Configuration:**

**Level 1: User Preferences** (Database - `StorageProviderConfig`)
- User selects which providers to use
- User configures credentials (encrypted at rest)
- User sets default provider
- Multiple providers per user allowed

**Level 2: Environment Defaults** (`.env.local`)
```env
# Fallback if user has no config (during onboarding)
DEFAULT_STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET=xxx

# Optional: Pre-configured providers for self-hosted
ENABLE_VERCEL_BLOB=false
ENABLE_S3=false
```

**Precedence:**
1. User's selected default provider (from `StorageProviderConfig`)
2. First active provider for user
3. Environment default (`DEFAULT_STORAGE_PROVIDER`)
4. Error: No storage configured

**Settings UI Location:**
```
/settings
  ├─ /general
  ├─ /storage          ← New storage settings page
  │  ├─ Provider list (R2, S3, Vercel)
  │  ├─ Add provider button
  │  ├─ Configure credentials modal
  │  └─ Set default toggle
  ├─ /preferences
  └─ /account
```

### 3. File Upload Flow (Detailed)

**Phase 1: Initiate Upload** (`POST /api/content/content/upload/initiate`)
```
Client                        API Route                    Database              Storage Provider
  │                             │                            │                         │
  │── POST /initiate ──────────>│                            │                         │
  │  {fileName, size, mime}     │                            │                         │
  │                             │──── Get user's default ───>│                         │
  │                             │<──── StorageProviderConfig─│                         │
  │                             │                            │                         │
  │                             │──── Create ContentNode ───>│                         │
  │                             │       + FilePayload        │                         │
  │                             │       uploadStatus="uploading"                       │
  │                             │<──── ContentNode (id) ─────│                         │
  │                             │                            │                         │
  │                             │──── Generate presigned URL ────────────────────────>│
  │                             │<──── Presigned URL (1hr TTL) ──────────────────────│
  │<── Response ────────────────│                            │                         │
  │   {contentId, uploadUrl}   │                            │                         │
```

**Phase 2: Client Upload**
```
Client                                                      Storage Provider (R2/S3/Vercel)
  │                                                                   │
  │── PUT {file} ─────────────────────────────────────────────────>│
  │   (Direct upload, bypasses API server)                          │
  │<── 200 OK ──────────────────────────────────────────────────────│
```

**Phase 3: Finalize Upload** (`POST /api/content/content/upload/finalize`)
```
Client                        API Route                    Database              Storage Provider
  │                             │                            │                         │
  │── POST /finalize ──────────>│                            │                         │
  │  {contentId, success=true}  │                            │                         │
  │                             │──── Verify file exists ────────────────────────────>│
  │                             │<──── File metadata (size, etag) ────────────────────│
  │                             │                            │                         │
  │                             │──── Extract metadata ───────────────────────────────>│
  │                             │       (thumbnails, dimensions)                       │
  │                             │<──── Processed metadata ─────────────────────────────│
  │                             │                            │                         │
  │                             │──── Update FilePayload ───>│                         │
  │                             │       uploadStatus="ready" │                         │
  │                             │       storageUrl, thumbnail│                         │
  │                             │<──── Updated record ───────│                         │
  │<── Response ────────────────│                            │                         │
  │   {storageUrl, thumbnail}   │                            │                         │
```

### 4. Media Processing Pipeline

**Processing Strategy:**
- **Images**: Extract dimensions, generate thumbnails (150x150, 300x300)
- **Videos**: Extract first frame thumbnail, duration, dimensions
- **Audio**: Extract duration, waveform thumbnail (optional)
- **PDFs**: Generate first page thumbnail
- **Other**: Generic file icon

**Processing Location:**
- ✅ Server-side (API route) - More secure, consistent environment
- ❌ Client-side - Unreliable, can't trust results

**Dependencies:**
```json
{
  "sharp": "^0.33.0",           // Image processing
  "@ffmpeg-installer/ffmpeg": "^1.1.0",  // FFmpeg installer
  "fluent-ffmpeg": "^2.1.2",    // Video/audio processing
  "pdfjs-dist": "^4.0.0",       // PDF rendering
  "file-type": "^19.0.0"        // MIME type detection
}
```

**Implementation:**
```typescript
// /lib/media/processor.ts
export class MediaProcessor {
  async processImage(stream: ReadableStream, storageKey: string): Promise<ImageMetadata> {
    // 1. Load image with sharp
    // 2. Extract width, height, format
    // 3. Generate thumbnails (150x150, 300x300)
    // 4. Upload thumbnails to storage
    // 5. Return metadata + thumbnail URLs
  }

  async processVideo(stream: ReadableStream, storageKey: string): Promise<VideoMetadata> {
    // 1. Save stream to temp file (FFmpeg requires file path)
    // 2. Extract duration, dimensions, codec
    // 3. Generate thumbnail at 00:00:01
    // 4. Upload thumbnail to storage
    // 5. Clean up temp file
    // 6. Return metadata + thumbnail URL
  }

  async processPDF(stream: ReadableStream, storageKey: string): Promise<PDFMetadata> {
    // 1. Load PDF with pdfjs
    // 2. Count pages
    // 3. Render first page to canvas
    // 4. Convert canvas to PNG thumbnail
    // 5. Upload thumbnail to storage
    // 6. Return metadata + thumbnail URL
  }
}
```

### 5. Security Considerations

**Credentials Storage:**
- ✅ Store encrypted in database (`StorageProviderConfig.config` JSON field)
- ✅ Use environment variable for encryption key (`STORAGE_CONFIG_ENCRYPTION_KEY`)
- ✅ Never expose full credentials in API responses
- ✅ Only show masked values in UI (e.g., "R2_***KEY123")

**Upload Security:**
- ✅ Server generates presigned URLs (client can't forge)
- ✅ 1-hour expiration on presigned URLs
- ✅ Content-type enforcement in presigned URLs
- ✅ File size limits enforced (100MB default)
- ✅ MIME type validation before processing

**Download Security:**
- ✅ Generate short-lived presigned URLs for downloads
- ✅ Check ownership before generating download URL
- ✅ Rate limit download URL generation (prevent abuse)

### 6. Error Handling & Recovery

**Upload Failures:**

| Failure Point | Current State | Recovery Action |
|---------------|---------------|-----------------|
| Client cancels upload | `uploadStatus="uploading"` | Background job marks failed after 2 hours |
| Network error during upload | `uploadStatus="uploading"` | Client can retry with same `contentId` |
| Upload succeeds but finalize fails | File in storage, `uploadStatus="uploading"` | Retry finalize with same `contentId` |
| File not found during finalize | `uploadStatus="uploading"` | Mark failed, delete ContentNode |

**Orphaned Files:**
- **Problem:** File uploaded to storage but never finalized
- **Solution:** Background cleanup job (daily)
  - Find `FilePayload` records with `uploadStatus="uploading"` older than 24 hours
  - Check if file exists in storage
  - If exists: delete from storage
  - Mark `uploadStatus="failed"` or delete ContentNode

**Storage Provider Downtime:**
- **Problem:** Provider is down, uploads fail
- **Solution:**
  - Fallback to secondary provider (if configured)
  - Show user-friendly error message
  - Queue for retry (background job)

### 7. Performance Optimizations

**Deduplication:**
- Check for duplicate files by `checksum + fileSize` before upload
- Return existing `contentId` if duplicate found
- Save storage costs and bandwidth

**Lazy Loading:**
- Don't load Sharp/FFmpeg until needed (reduce cold start time)
- Use dynamic imports: `import('sharp')` only when processing images

**Thumbnail Generation:**
- Generate multiple sizes asynchronously (don't block finalize response)
- Store thumbnails in same bucket with `-thumb-150.jpg` suffix
- Use lazy loading for thumbnails in UI

**Caching:**
- Cache presigned URLs for 5 minutes (reduce API calls to storage providers)
- Cache storage provider configs in memory (reduce DB queries)

---

## Implementation Plan

### Phase 1: Core Storage SDK (Week 1, Days 1-2)
1. ✅ Install dependencies (`@aws-sdk/client-s3`, `@vercel/blob`, etc.)
2. ✅ Create storage provider interface (`/lib/storage/types.ts`)
3. ✅ Implement R2 provider (`/lib/storage/r2-provider.ts`)
4. ✅ Implement S3 provider (`/lib/storage/s3-provider.ts`)
5. ✅ Implement Vercel Blob provider (`/lib/storage/vercel-provider.ts`)
6. ✅ Create storage factory (`/lib/storage/factory.ts`)
7. ✅ Update upload API routes to use real providers

### Phase 2: Media Processing (Week 1, Days 3-4)
8. ✅ Install media processing dependencies (Sharp, FFmpeg, pdfjs)
9. ✅ Create media processor class (`/lib/media/processor.ts`)
10. ✅ Implement image processing
11. ✅ Implement video processing
12. ✅ Implement PDF processing
13. ✅ Update finalize endpoint to process media

### Phase 3: Settings UI (Week 1, Day 5)
14. ✅ Create storage settings page (`/app/(authenticated)/settings/storage/page.tsx`)
15. ✅ Create provider configuration forms (R2, S3, Vercel)
16. ✅ Add credential encryption utility
17. ✅ Connect to storage API endpoints
18. ✅ Add "Set as Default" toggle
19. ✅ Add delete provider with safety checks

### Phase 4: Upload UI (Week 2, Days 1-2)
20. ✅ Install react-dropzone
21. ✅ Create FileUpload component (`/components/content/FileUpload.tsx`)
22. ✅ Add drag-and-drop zone
23. ✅ Add progress bar during upload
24. ✅ Handle upload errors with retry
25. ✅ Add to file tree context menu (+ → Upload File)

### Phase 5: Media Viewers (Week 2, Days 3-4)
26. ✅ Create ImageViewer component
27. ✅ Create PDFViewer component (react-pdf)
28. ✅ Create VideoViewer component (HTML5 video)
29. ✅ Create AudioViewer component (HTML5 audio)
30. ✅ Update MainPanel to route by content type

### Phase 6: File Operations (Week 2, Day 5)
31. ✅ Implement download API route (`GET /api/content/content/[id]/download`)
32. ✅ Add "Download" to context menu
33. ✅ Update delete operation to remove from storage
34. ✅ Add file size display in tree

### Phase 7: Testing & Polish (Week 3)
35. ✅ Test all three storage providers
36. ✅ Test upload error scenarios
37. ✅ Test media processing for all file types
38. ✅ Test deduplication
39. ✅ Add loading skeletons
40. ✅ Add error boundaries
41. ✅ Performance testing (large files)
42. ✅ Update documentation

---

## Critical Decisions

### Decision 1: Where should settings live?

**Option A: Dedicated `/settings` route** (Recommended)
```
/settings
  ├─ /storage
  ├─ /preferences
  └─ /account
```
**Pros:**
- ✅ Standard pattern (users expect it)
- ✅ Easy to navigate
- ✅ Room for future settings (themes, shortcuts, etc.)

**Cons:**
- ❌ Requires new layout component
- ❌ Additional navigation item

**Option B: Within `/content` layout (Quick Access)**
```
/notes
  ├─ File tree
  ├─ Editor
  └─ Right sidebar → Settings tab
```
**Pros:**
- ✅ No context switch
- ✅ Quick access while working

**Cons:**
- ❌ Cramped space in sidebar
- ❌ Settings don't feel "global"
- ❌ Harder to expand later

**Recommendation:** **Option A** - Dedicated `/settings` route
- More scalable
- Standard UX pattern
- Gives settings proper attention

### Decision 2: Storage provider priority during M7

**All three providers equally?** ❌ No - Focus on R2 first
- R2 is cheapest for bandwidth (zero egress fees)
- R2 is S3-compatible (easier to implement)
- Vercel Blob is easiest but most expensive at scale

**Implementation Order:**
1. R2 (full implementation, production-ready)
2. S3 (leverage R2 code, swap endpoints)
3. Vercel Blob (different API, implement last)

### Decision 3: Where to store thumbnails?

**Option A: Same bucket, different key pattern**
```
uploads/user-id/uuid.jpg              (original)
uploads/user-id/uuid-thumb-150.jpg    (thumbnail)
uploads/user-id/uuid-thumb-300.jpg    (larger thumbnail)
```
**Pros:**
- ✅ Simple, one provider config
- ✅ Easy to clean up (delete all related keys)

**Cons:**
- ❌ Mixed original + processed files

**Option B: Separate bucket for processed files**
```
Bucket: my-uploads              (originals)
Bucket: my-uploads-processed    (thumbnails)
```
**Pros:**
- ✅ Clear separation
- ✅ Can apply different policies (e.g., public thumbnails, private originals)

**Cons:**
- ❌ More complex config
- ❌ Requires second bucket setup

**Recommendation:** **Option A** - Same bucket, different key suffix
- Simpler for users (one bucket to configure)
- Easier cleanup
- Most providers offer prefix-based policies if needed

---

## Questions for Discussion

1. **Credential Encryption:** Should we encrypt storage credentials in the database? If yes, where do we store the encryption key?
   - **Recommendation:** Yes, use `STORAGE_CONFIG_ENCRYPTION_KEY` environment variable

2. **Onboarding:** How should we handle users who haven't configured storage yet?
   - **Option A:** Force configuration on first file upload (blocking)
   - **Option B:** Use environment default, prompt to configure later (non-blocking)
   - **Recommendation:** Option B with banner notification

3. **Migration:** What if a user switches default provider? Should we migrate existing files?
   - **Recommendation:** No automatic migration - keep files in original provider. New uploads use new provider. Offer manual migration tool later (M8+).

4. **Quotas:** Should we track storage usage per user?
   - **Recommendation:** Not in M7 - add in M8 (Analytics & Monitoring)

5. **Cleanup Jobs:** Who manages orphaned files and failed uploads?
   - **Recommendation:** Background job using Vercel Cron or similar (M8 scope)

---

## Next Steps

**Before proceeding with implementation:**
1. ✅ Review this architecture document
2. ✅ Make critical decisions (settings location, provider priority, thumbnail storage)
3. ✅ Agree on implementation order (core SDK → processing → UI)
4. ✅ Set up environment variables for R2 testing

**Then start Phase 1:**
- Install dependencies
- Implement storage provider interface
- Test R2 provider with real credentials
- Update upload endpoints

---

## References

- [Prisma Schema](../../prisma/schema.prisma) - StorageProviderConfig model
- [Upload Initiate API](../../app/api/content/content/upload/initiate/route.ts) - Phase 1 upload
- [Upload Finalize API](../../app/api/content/content/upload/finalize/route.ts) - Phase 2 upload
- [Storage Config API](../../app/api/content/storage/route.ts) - CRUD for storage settings
- [M7 Implementation Plan](./M7-FILE-MANAGEMENT-MEDIA.md) - Original M7 scope
