# Multi-Cloud Storage Architecture

**Unified storage abstraction** supporting Cloudflare R2, AWS S3, and Vercel Blob.

## Overview

The Digital Garden uses a **multi-cloud storage architecture** that abstracts storage operations behind a unified interface. This allows seamless switching between storage providers without code changes.

**Supported Providers:**
- Cloudflare R2 (Primary - S3-compatible, no egress fees)
- AWS S3 (Traditional cloud storage)
- Vercel Blob (Vercel-native storage)

**Key Benefits:**
- Provider independence (easy migration)
- Encrypted credential storage
- Unified API for upload/download/delete
- Cost optimization (R2 has no egress fees)

## Architecture Pattern

### Factory Pattern

**Core Abstraction**: `StorageProvider` interface

```typescript
interface StorageProvider {
  upload(file: File, path: string): Promise<string>;
  download(path: string): Promise<string>; // presigned URL
  delete(path: string): Promise<void>;
  generatePresignedUrl(path: string, expirySeconds?: number): Promise<string>;
}
```

**Factory Function**: `createStorageProvider()`

```typescript
// lib/infrastructure/storage/factory.ts
export async function createStorageProvider(
  config: StorageProviderConfig
): Promise<StorageProvider> {
  const decryptedCredentials = decryptCredentials(config.encryptedCredentials);

  switch (config.type) {
    case 'R2':
      return new R2Provider({
        bucket: config.bucket,
        region: config.region,
        ...decryptedCredentials,
      });
    case 'S3':
      return new S3Provider({ /* ... */ });
    case 'VERCEL_BLOB':
      return new VercelBlobProvider({ /* ... */ });
    default:
      throw new Error(`Unsupported provider: ${config.type}`);
  }
}
```

## Storage Providers

### Cloudflare R2 (Primary)

**File**: `lib/infrastructure/storage/r2-provider.ts`

**Features**:
- S3-compatible API (uses `@aws-sdk/client-s3`)
- No egress fees (free data transfer out)
- Fast global distribution
- R2-specific endpoint configuration

**Configuration**:
```typescript
{
  type: 'R2',
  bucket: 'my-bucket',
  region: 'auto', // R2 uses 'auto' for region
  endpoint: 'https://account-id.r2.cloudflarestorage.com',
  encryptedCredentials: '...' // Encrypted access key + secret
}
```

**Cost Advantage**:
- Storage: ~$0.015/GB/month
- Egress: **$0** (vs AWS S3 ~$0.09/GB)
- Operations: Similar to S3

### AWS S3

**File**: `lib/infrastructure/storage/s3-provider.ts`

**Features**:
- Traditional cloud storage
- Full S3 feature set (versioning, lifecycle, etc.)
- Wide ecosystem support

**Configuration**:
```typescript
{
  type: 'S3',
  bucket: 'my-s3-bucket',
  region: 'us-east-1',
  encryptedCredentials: '...'
}
```

**Use Cases**:
- Legacy infrastructure
- AWS-native deployments
- Advanced S3 features (versioning, intelligent tiering)

### Vercel Blob

**File**: `lib/infrastructure/storage/vercel-provider.ts`

**Features**:
- Vercel-native storage
- Simplified API (no S3 SDK)
- Automatic CDN integration
- Easy Vercel deployment

**Configuration**:
```typescript
{
  type: 'VERCEL_BLOB',
  encryptedCredentials: '...' // Just BLOB_READ_WRITE_TOKEN
}
```

**Use Cases**:
- Vercel-hosted deployments
- Simplified setup
- Quick prototyping

## Prefix Strategy

All providers use the same prefix structure within a single bucket:

```
bucket-name/
├── uploads/{userId}/{uuid}.{ext}           # Original files
├── uploads/{userId}/{uuid}-thumb-150.{ext} # Small thumbnails
├── uploads/{userId}/{uuid}-thumb-300.{ext} # Large thumbnails
└── backups/{userId}/{uuid}/{timestamp}     # Versioned backups
```

**Benefits**:
- Single bucket handles all content
- User isolation via `{userId}` prefix
- Easy cleanup (delete all user files)
- Thumbnail organization

**Example Paths**:
```
uploads/user_abc123/file_xyz789.jpg
uploads/user_abc123/file_xyz789-thumb-150.jpg
uploads/user_abc123/file_xyz789-thumb-300.jpg
backups/user_abc123/note_123/2026-02-18T10-30-00.json
```

## Credential Encryption

**Security**: All storage credentials encrypted before database storage

### Encryption Flow

**1. Setup (Initial Config)**:
```typescript
// User provides credentials
const credentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};

// Encrypt with STORAGE_ENCRYPTION_KEY
const encryptedCredentials = encrypt(
  JSON.stringify(credentials),
  process.env.STORAGE_ENCRYPTION_KEY
);

// Store encrypted in database
await prisma.storageProviderConfig.create({
  data: {
    type: 'R2',
    bucket: 'my-bucket',
    region: 'auto',
    encryptedCredentials, // ← Encrypted blob
  },
});
```

**2. Usage (On-Demand Decryption)**:
```typescript
// Fetch config from database
const config = await prisma.storageProviderConfig.findUnique({ ... });

// Decrypt credentials
const credentials = JSON.parse(
  decrypt(config.encryptedCredentials, process.env.STORAGE_ENCRYPTION_KEY)
);

// Create provider instance
const provider = new R2Provider({
  bucket: config.bucket,
  region: config.region,
  ...credentials,
});
```

**Encryption Details**:
- Algorithm: AES-256-GCM
- Key: `STORAGE_ENCRYPTION_KEY` (32-byte hex, environment variable)
- Library: `lib/infrastructure/crypto/encryption.ts`

**Security Best Practices**:
- ✅ Rotate `STORAGE_ENCRYPTION_KEY` periodically
- ✅ Never log decrypted credentials
- ✅ Use different keys for dev/staging/production
- ✅ Store encryption key in secure secret manager

## Presigned URLs

**Pattern**: Generate time-limited URLs for direct client access

### Why Presigned URLs?

**Without presigned URLs** (server proxy):
```
Client → Server → Storage Provider → Server → Client
(Slow, server becomes bottleneck, high bandwidth cost)
```

**With presigned URLs**:
```
Client → Server (get presigned URL) → Client → Storage Provider
(Fast, direct upload/download, no server bandwidth)
```

### Upload Flow

**1. Client requests presigned URL**:
```typescript
// POST /api/content/content/upload/initiate
const response = await fetch('/api/content/content/upload/initiate', {
  method: 'POST',
  body: JSON.stringify({
    filename: 'image.jpg',
    mimeType: 'image/jpeg',
    size: 1024000,
  }),
});

const { presignedUrl, path, uploadId } = await response.json();
```

**2. Server generates presigned URL**:
```typescript
// API route
const provider = await createStorageProvider(config);
const path = `uploads/${userId}/${uuid}.${ext}`;

const presignedUrl = await provider.generatePresignedUrl(path, 900); // 15 min
```

**3. Client uploads directly to storage**:
```typescript
// Direct PUT to presigned URL (bypasses server)
await fetch(presignedUrl, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': file.type },
});
```

**4. Client confirms upload**:
```typescript
// POST /api/content/content/upload/finalize
await fetch('/api/content/content/upload/finalize', {
  method: 'POST',
  body: JSON.stringify({
    uploadId,
    path,
    filename: 'image.jpg',
    mimeType: 'image/jpeg',
    size: 1024000,
  }),
});
```

**5. Server creates ContentNode + FilePayload**:
```typescript
await prisma.contentNode.create({
  data: {
    title: 'image.jpg',
    contentType: 'FILE',
    filePayload: {
      create: {
        filename: 'image.jpg',
        mimeType: 'image/jpeg',
        size: 1024000,
        storagePath: path,
        storageProvider: config.id,
      },
    },
  },
});
```

### Download Flow

**1. Get presigned URL from server**:
```typescript
const response = await fetch(`/api/content/content/${fileId}/download`);
const { presignedUrl } = await response.json();
```

**2. Direct download from storage**:
```typescript
window.open(presignedUrl, '_blank');
// Or: <img src={presignedUrl} />
```

**Expiry**: Presigned URLs expire after 15 minutes (configurable)

## Provider Switching

**Scenario**: Migrate from AWS S3 to Cloudflare R2

### Option 1: Migrate Existing Files

```typescript
// 1. Create new R2 config
const r2Config = await prisma.storageProviderConfig.create({ ... });

// 2. Copy files from S3 to R2
const s3Provider = await createStorageProvider(s3Config);
const r2Provider = await createStorageProvider(r2Config);

for (const file of files) {
  const presignedUrl = await s3Provider.generatePresignedUrl(file.storagePath);
  const fileData = await fetch(presignedUrl);
  await r2Provider.upload(fileData, file.storagePath);

  // Update FilePayload to point to R2
  await prisma.filePayload.update({
    where: { id: file.id },
    data: { storageProvider: r2Config.id },
  });
}

// 3. Delete S3 config
await prisma.storageProviderConfig.delete({ where: { id: s3Config.id } });
```

### Option 2: Dual-Provider (Gradual Migration)

```typescript
// New uploads go to R2
const defaultProvider = await prisma.storageProviderConfig.findFirst({
  where: { isDefault: true, type: 'R2' },
});

// Existing files stay on S3 (read-only)
const s3Provider = await createStorageProvider(s3Config);
```

**Migration Strategy**:
1. Set R2 as default for new uploads
2. Existing files remain on S3
3. Gradually migrate files on-demand (when accessed)
4. Delete S3 config when migration complete

## Performance Optimizations

### Thumbnail Generation

**Pattern**: Generate thumbnails immediately after upload

```typescript
// After file upload
if (isImage(mimeType)) {
  await generateThumbnails({
    sourcePath: `uploads/${userId}/${uuid}.${ext}`,
    sizes: [150, 300],
    provider,
  });
}
```

**Implementation**: Uses Sharp library for fast image processing

### CDN Integration

**Cloudflare R2**: Automatic CDN via R2 public buckets
**AWS S3**: Use CloudFront distribution
**Vercel Blob**: Built-in CDN

**Pattern**:
```typescript
// Return CDN URL instead of presigned URL (for public content)
const cdnUrl = `https://cdn.example.com/${path}`;
```

### Caching Strategy

**Presigned URLs**: Cache in memory for 5 minutes
```typescript
const urlCache = new Map<string, { url: string; expiresAt: number }>();
```

**Provider Instances**: Reuse provider instances (connection pooling)

## Error Handling

### Common Errors

**1. Credential Decryption Failure**:
```typescript
try {
  const credentials = decrypt(config.encryptedCredentials, key);
} catch (error) {
  throw new Error('Invalid storage credentials. Re-configure provider.');
}
```

**2. Upload Timeout**:
```typescript
const presignedUrl = await provider.generatePresignedUrl(path, 900); // 15 min
// If upload takes >15 min, URL expires → Client gets 403
// Mitigation: Client requests new presigned URL
```

**3. Provider Unavailable**:
```typescript
try {
  await provider.upload(file, path);
} catch (error) {
  // Fallback to alternative provider or queue for retry
  await queueUploadRetry({ file, path, providerId });
}
```

## Related Documentation

- [File Storage Core](../../guides/storage/07-file-storage.md)
- [Storage Config Examples](../../guides/storage/STORAGE-CONFIG-EXAMPLES.md)
- [Two-Phase Upload](two-phase-upload.md)
- [Provider Configuration](provider-configuration.md)

---

**Implemented**: Epoch 3 (M7 - Storage Architecture v2)
**Last Updated**: Feb 18, 2026
