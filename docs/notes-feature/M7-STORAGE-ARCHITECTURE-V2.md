# M7 Storage Architecture - Final Design

**Created:** January 20, 2026
**Updated:** January 21, 2026
**Status:** Architecture Approved, Ready for Implementation

---

## Executive Summary

**Decisions Made:**
- ✅ Settings UI: Dedicated `/settings` route with Notes design theme
- ✅ Provider Priority: R2 → S3 → Vercel (in that order)
- ✅ Bucket Strategy: Same bucket with prefix-based policies
- ✅ Security: Encrypt credentials, split config into metadata + encrypted credentials
- ✅ Quotas: Tiered storage limits (free: 100MB, basic: 5GB, pro: 100GB, enterprise: unlimited)
- ✅ Backups: Bucket versioning + lifecycle policies (10-20% cost increase, not 100%)
- ✅ Trash Bin: 30-day soft delete for all content types (notes + files)
- ✅ Rate Limiting: 10 downloads/hour for non-admins (prevent egress abuse)
- ✅ Provider Switching: No automatic migration, clear warning before switching

---

## Architecture Overview

### Storage Prefix Strategy (Same Bucket)

```
my-digital-garden-bucket/
├── uploads/{userId}/{uuid}.{ext}                    # Original files
├── uploads/{userId}/{uuid}-thumb-150.{ext}          # Small thumbnails
├── uploads/{userId}/{uuid}-thumb-300.{ext}          # Large thumbnails
└── backups/{userId}/{uuid}/{timestamp}.{ext}        # Versioned backups
```

**Prefix-Based Access Policies:**
```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::bucket/uploads/*/thumb-*",
      "Principal": "*"
    }
  ]
}
```
- Thumbnails: Public (for fast CDN delivery)
- Originals: Private (presigned URLs only)
- Backups: Private (admin/owner access only)

---

## Database Schema Updates

### Split Config into Metadata + Credentials

**Before:**
```prisma
model StorageProviderConfig {
  config  Json  @db.JsonB  // Everything mixed together
}
```

**After:**
```prisma
model StorageProviderConfig {
  id            String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId        String          @db.Uuid
  provider      StorageProvider
  isDefault     Boolean         @default(false)
  displayName   String?         @db.VarChar(100)

  // Split configuration
  config        Json            @db.JsonB  // Non-sensitive metadata (bucket, region, endpoint)
  credentials   String?         @db.Text   // Encrypted credentials (access keys)

  isActive      Boolean         @default(true)
  createdAt     DateTime        @default(now()) @db.Timestamptz()
  updatedAt     DateTime        @updatedAt @db.Timestamptz()

  user          User            @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, provider])
  @@index([userId, isDefault])
}
```

**Example Data:**

```typescript
// config field (plain JSON, queryable)
{
  "bucket": "my-digital-garden",
  "region": "auto",
  "endpoint": "https://abc123.r2.cloudflarestorage.com",
  "cdnUrl": "https://cdn.example.com"
}

// credentials field (encrypted string)
"U2FsdGVkX1+Nw8bMvFJXNzQ1NjU..." // Decrypts to:
{
  "accountId": "abc123",
  "accessKeyId": "AKI...",
  "secretAccessKey": "wJa..."
}
```

**Benefits:**
- ✅ Queryable metadata (bucket name, region) without decryption
- ✅ Credentials protected even if DB dumped
- ✅ Easy to show masked values in UI (`R2_***KEY123`)
- ✅ Compliant with SOC2/PCI requirements

---

### Add Download Tracking (Egress Protection)

```prisma
model DownloadLog {
  id           String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId       String      @db.Uuid
  contentId    String      @db.Uuid
  ipAddress    String      @db.VarChar(45)  // IPv6 max length
  userAgent    String?     @db.Text
  bytesServed  BigInt?     // Track egress usage
  downloadedAt DateTime    @default(now()) @db.Timestamptz()

  user         User        @relation(fields: [userId], references: [id])
  content      ContentNode @relation(fields: [contentId], references: [id])

  @@index([userId, contentId, downloadedAt])
  @@index([ipAddress, downloadedAt])
  @@index([userId, downloadedAt])  // For quota tracking
}
```

**Rate Limiting Logic:**
```typescript
// 10 downloads per hour for non-admins, 100 for admins
const limit = session.user.role === 'admin' ? 100 : 10;
const recentDownloads = await prisma.downloadLog.count({
  where: {
    userId: session.user.id,
    contentId: id,
    downloadedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
  },
});

if (recentDownloads >= limit) {
  throw new Error("Rate limit exceeded (10/hour). Upgrade for higher limits.");
}
```

---

### Add Storage Usage Tracking

```prisma
model User {
  id                String  @id
  // ... existing fields

  // Storage tracking (updated by triggers/background jobs)
  storageUsedBytes  BigInt  @default(0)
  storageTier       String  @default("free") @db.VarChar(20)  // free, basic, pro, enterprise
}
```

**Quota Enforcement:**

```typescript
export const STORAGE_QUOTAS = {
  free: {
    maxStorageBytes: 100 * 1024 * 1024,        // 100 MB
    maxFileSize: 10 * 1024 * 1024,             // 10 MB per file
    allowedProviders: ['cloudinary'],          // Locked to Cloudinary
    backupsEnabled: false,
    downloadsPerHour: 10,
  },
  basic: {
    maxStorageBytes: 5 * 1024 * 1024 * 1024,   // 5 GB
    maxFileSize: 100 * 1024 * 1024,            // 100 MB
    allowedProviders: ['cloudinary', 'r2'],
    backupsEnabled: true,
    downloadsPerHour: 50,
  },
  pro: {
    maxStorageBytes: 100 * 1024 * 1024 * 1024, // 100 GB
    maxFileSize: 500 * 1024 * 1024,            // 500 MB
    allowedProviders: ['cloudinary', 'r2', 's3', 'vercel'],
    backupsEnabled: true,
    downloadsPerHour: 200,
  },
  enterprise: {
    maxStorageBytes: null,  // Unlimited
    maxFileSize: null,
    allowedProviders: ['cloudinary', 'r2', 's3', 'vercel', 'custom'],
    backupsEnabled: true,
    downloadsPerHour: null,
  },
};
```

---

## Backup Architecture

### Cost-Effective Backup Strategy

**Use Bucket Versioning + Lifecycle Policies (10-20% cost increase)**

**Cloudflare R2 Lifecycle:**
```json
{
  "Rules": [
    {
      "ID": "MoveOldVersionsToIA",
      "Status": "Enabled",
      "NoncurrentVersionTransitions": [
        {
          "NoncurrentDays": 30,
          "StorageClass": "INFREQUENT_ACCESS"
        }
      ]
    },
    {
      "ID": "DeleteOldBackups",
      "Status": "Enabled",
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 90
      }
    }
  ]
}
```

**Cost Breakdown:**
- Day 0-30: Standard storage ($0.015/GB) - Full price
- Day 30-90: Infrequent Access ($0.0015/GB) - 90% cheaper
- Day 90+: Deleted automatically

**Example:** 100 GB of files
- Month 1: $1.50 (current) + $0.15 (old versions in IA) = **$1.65 total** (10% increase)
- Not 2x ($3.00)

### Backup UI (Settings → Storage → Backups)

**Per-Folder Backup Toggles:**
```typescript
// Store in ContentNode metadata
{
  "backupEnabled": true,
  "backupSchedule": "daily" | "weekly" | "manual",
  "retentionDays": 90,
  "lastBackup": "2026-01-20T10:30:00Z"
}
```

**UI Components:**
- Backup toggle switch per folder
- "Backup All" button (recursive)
- Restore from backup modal (list versions, preview, restore)
- Backup status indicator (badge on folder icon)

---

## Trash Bin Architecture

### 30-Day Soft Delete for All Content

**Delete Flow:**

```
User clicks delete
  ↓
Soft delete (set deletedAt)
  ↓
Create TrashBin entry (scheduledDeletion = now() + 30 days)
  ↓
Keep DB record + storage file
  ↓
Show in Trash UI
  ↓
Auto-cleanup after 30 days (Cron job)
  OR
Force delete from trash (immediate cleanup)
```

**TrashBin Model (Already Exists):**
```prisma
model TrashBin {
  id                  String      @id
  contentId           String      @unique @db.Uuid
  originalPath        String?     @db.Text
  deletedBy           String      @db.Uuid
  deletedAt           DateTime    @default(now()) @db.Timestamptz()
  scheduledDeletion   DateTime    @db.Timestamptz()  // +30 days
  deletionReason      String?     @db.VarChar(255)
  contentSnapshot     Json        @db.JsonB  // Full snapshot for restore

  content             ContentNode @relation(fields: [contentId], references: [id], onDelete: Cascade)
  deletedByUser       User        @relation(fields: [deletedBy], references: [id])
}
```

**Consistency Between DB and Storage:**

| Content Type | DB Record | Storage File | On Soft Delete | On Force Delete |
|-------------|-----------|--------------|----------------|-----------------|
| Note (`.md`) | `NotePayload.tiptapJson` | N/A | Keep DB record | Delete DB record |
| File (image, PDF) | `FilePayload` metadata | Actual file in R2/S3 | Keep both | Delete both |
| Folder | `ContentNode` (no payload) | N/A | Keep DB record + children | Delete DB record + children |

**Force Delete from Trash:**
```typescript
// User clicks "Delete Forever" in trash
async function forceDelete(contentId: string) {
  // 1. Get content + payload
  const content = await prisma.contentNode.findUnique({
    where: { id: contentId },
    include: { filePayload: true },
  });

  // 2. If file, delete from storage
  if (content.filePayload) {
    const provider = await getStorageProvider(content.filePayload.storageProvider);
    await provider.deleteFile(content.filePayload.storageKey);

    // Also delete thumbnails
    await provider.deleteFile(`${content.filePayload.storageKey}-thumb-150`);
    await provider.deleteFile(`${content.filePayload.storageKey}-thumb-300`);
  }

  // 3. Delete DB records (cascades to payload)
  await prisma.trashBin.delete({ where: { contentId } });
  await prisma.contentNode.delete({ where: { id: contentId } });
}
```

**Trash UI:**
```
/notes/trash
  ├─ List of deleted items
  ├─ Restore button (moves back to original location)
  ├─ Delete Forever button (force delete)
  ├─ Empty Trash button (bulk force delete)
  └─ Auto-delete countdown (e.g., "Deletes in 28 days")
```

---

## Settings Page Architecture

### Settings Layout (`/settings`)

**Navigation Structure:**
```
/settings
  ├─ /general             - App preferences (theme, language)
  ├─ /storage             - Storage provider configuration ✨ Primary focus
  │  ├─ Providers tab     - R2, S3, Vercel config
  │  ├─ Backups tab       - Backup settings per folder
  │  └─ Usage tab         - Storage quota, usage stats
  ├─ /api                 - API keys for external access ✨ New
  ├─ /mcp                 - Model Context Protocol integration ✨ Stub
  ├─ /preferences         - Editor settings, shortcuts
  └─ /account             - Profile, billing, security
```

**Design Theme:**
- Use Notes design system (Liquid Glass + DiceUI)
- Same `getSurfaceStyles("glass-0")` surfaces
- Consistent with `/notes` layout
- Sticky sidebar navigation (same pattern as notes left sidebar)

### Storage Settings UI

**Tab 1: Providers**

```tsx
<div className="space-y-6">
  {/* Current Default Provider */}
  <Card className="bg-glass-0 border-primary">
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle>Default Provider: Cloudflare R2</CardTitle>
          <CardDescription>All new uploads use this provider</CardDescription>
        </div>
        <Badge variant="success">Active</Badge>
      </div>
    </CardHeader>
    <CardContent>
      <div className="space-y-2 text-sm">
        <div>Bucket: <code>my-digital-garden</code></div>
        <div>Region: <code>auto</code></div>
        <div>Credentials: <code>R2_***KEY123</code></div>
      </div>
    </CardContent>
    <CardFooter>
      <Button variant="outline" onClick={() => setEditingProvider('r2')}>
        Edit Configuration
      </Button>
    </CardFooter>
  </Card>

  {/* Add Provider */}
  <Card className="bg-glass-0">
    <CardHeader>
      <CardTitle>Add Storage Provider</CardTitle>
      <CardDescription>Configure additional providers for redundancy</CardDescription>
    </CardHeader>
    <CardContent>
      <Select onValueChange={setSelectedProvider}>
        <SelectTrigger>
          <SelectValue placeholder="Choose provider..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="r2">Cloudflare R2</SelectItem>
          <SelectItem value="s3">Amazon S3</SelectItem>
          <SelectItem value="vercel">Vercel Blob</SelectItem>
        </SelectContent>
      </Select>
    </CardContent>
  </Card>

  {/* Provider Switching Warning */}
  <Alert variant="warning">
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>Warning: Changing Storage Provider</AlertTitle>
    <AlertDescription>
      Changing your default provider only affects <strong>new uploads</strong>.
      Existing files remain in their current provider.

      <p className="mt-2 font-semibold">
        Manual migration is not currently supported. Switching is final.
      </p>
    </AlertDescription>
  </Alert>
</div>
```

**Tab 2: Backups**

```tsx
<div className="space-y-4">
  {/* Global Backup Toggle */}
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle>Automatic Backups</CardTitle>
          <CardDescription>Enable versioning for file recovery</CardDescription>
        </div>
        <Switch checked={backupsEnabled} onCheckedChange={setBackupsEnabled} />
      </div>
    </CardHeader>
  </Card>

  {/* Per-Folder Backup Settings */}
  <Card>
    <CardHeader>
      <CardTitle>Folder Backup Settings</CardTitle>
      <CardDescription>Choose which folders to back up</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="space-y-2">
        {folders.map(folder => (
          <div key={folder.id} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Folder className="h-4 w-4" />
              <span>{folder.title}</span>
            </div>
            <Switch
              checked={folder.backupEnabled}
              onCheckedChange={(checked) => updateFolderBackup(folder.id, checked)}
            />
          </div>
        ))}
      </div>
    </CardContent>
  </Card>

  {/* Backup Schedule */}
  <Card>
    <CardHeader>
      <CardTitle>Backup Schedule</CardTitle>
    </CardHeader>
    <CardContent>
      <Select value={backupSchedule} onValueChange={setBackupSchedule}>
        <SelectItem value="manual">Manual Only</SelectItem>
        <SelectItem value="daily">Daily</SelectItem>
        <SelectItem value="weekly">Weekly</SelectItem>
      </Select>
    </CardContent>
  </Card>

  {/* Retention Policy */}
  <Card>
    <CardHeader>
      <CardTitle>Retention Policy</CardTitle>
      <CardDescription>How long to keep old versions</CardDescription>
    </CardHeader>
    <CardContent>
      <Select value={retentionDays.toString()} onValueChange={(v) => setRetentionDays(Number(v))}>
        <SelectItem value="30">30 days</SelectItem>
        <SelectItem value="90">90 days</SelectItem>
        <SelectItem value="365">1 year</SelectItem>
      </Select>
    </CardContent>
  </Card>
</div>
```

**Tab 3: Usage**

```tsx
<div className="space-y-4">
  {/* Storage Quota */}
  <Card>
    <CardHeader>
      <CardTitle>Storage Usage</CardTitle>
      <CardDescription>
        You're using {formatBytes(storageUsed)} of {formatBytes(storageQuota)}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <Progress value={(storageUsed / storageQuota) * 100} />
      {storageUsed / storageQuota > 0.9 && (
        <Alert variant="warning" className="mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You're using {Math.round((storageUsed / storageQuota) * 100)}% of your quota.
            <Link href="/settings/billing">Upgrade to increase limit</Link>
          </AlertDescription>
        </Alert>
      )}
    </CardContent>
  </Card>

  {/* Breakdown by Provider */}
  <Card>
    <CardHeader>
      <CardTitle>Storage by Provider</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span>Cloudflare R2</span>
          <span className="font-mono">{formatBytes(r2Usage)}</span>
        </div>
        <div className="flex justify-between">
          <span>Amazon S3</span>
          <span className="font-mono">{formatBytes(s3Usage)}</span>
        </div>
      </div>
    </CardContent>
  </Card>

  {/* Export Data (GDPR Compliance) */}
  <Card>
    <CardHeader>
      <CardTitle>Export Your Data</CardTitle>
      <CardDescription>
        Download all your files and notes for offline backup or migration
      </CardDescription>
    </CardHeader>
    <CardContent>
      <Button onClick={exportAllData}>
        <Download className="mr-2 h-4 w-4" />
        Export All Data (.zip)
      </Button>

      <Alert className="mt-4">
        <Info className="h-4 w-4" />
        <AlertDescription>
          Your data remains yours. You can export and migrate at any time.
          <Link href="/docs/data-export">Learn more</Link>
        </AlertDescription>
      </Alert>
    </CardContent>
  </Card>
</div>
```

### API Keys Settings (`/settings/api`)

**Stub for M8, but UI ready now:**

```tsx
<div className="space-y-4">
  <Card>
    <CardHeader>
      <CardTitle>API Keys</CardTitle>
      <CardDescription>
        Generate API keys to access your notes programmatically
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        {/* Existing Keys */}
        {apiKeys.map(key => (
          <div key={key.id} className="flex items-center justify-between p-4 border rounded">
            <div>
              <div className="font-mono text-sm">{key.name}</div>
              <div className="text-xs text-muted-foreground">
                Created {formatDate(key.createdAt)} • Last used {formatDate(key.lastUsedAt)}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => copyKey(key.id)}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => deleteKey(key.id)}>
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {/* Generate New Key */}
        <Button onClick={() => setShowGenerateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Generate New API Key
        </Button>
      </div>
    </CardContent>
  </Card>

  {/* Documentation Link */}
  <Alert>
    <BookOpen className="h-4 w-4" />
    <AlertDescription>
      Learn how to use the API in our <Link href="/docs/api">API Documentation</Link>
    </AlertDescription>
  </Alert>
</div>
```

**Generate Key Dialog:**
```tsx
<Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Generate API Key</DialogTitle>
      <DialogDescription>
        This key will have full access to your notes. Store it securely.
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-4">
      <Input
        placeholder="Key name (e.g., 'My Automation Script')"
        value={keyName}
        onChange={(e) => setKeyName(e.target.value)}
      />
      <div className="flex gap-2">
        <Button onClick={generateKey}>Generate Key</Button>
        <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
          Cancel
        </Button>
      </div>
    </div>
  </DialogContent>
</Dialog>
```

**Generated Key Display (One-Time):**
```tsx
<Alert variant="warning">
  <Key className="h-4 w-4" />
  <AlertTitle>Save This Key Now</AlertTitle>
  <AlertDescription>
    This is the only time you'll see this key. Copy it now.

    <div className="mt-2 p-2 bg-muted rounded font-mono text-sm">
      {generatedKey}
    </div>

    <Button onClick={() => copyToClipboard(generatedKey)} className="mt-2">
      <Copy className="mr-2 h-4 w-4" />
      Copy to Clipboard
    </Button>
  </AlertDescription>
</Alert>
```

### MCP Settings (`/settings/mcp`)

**Stub for M8:**

```tsx
<div className="space-y-4">
  <Card>
    <CardHeader>
      <CardTitle>Model Context Protocol (MCP)</CardTitle>
      <CardDescription>
        Connect your Digital Garden to AI assistants like Claude Desktop
      </CardDescription>
    </CardHeader>
    <CardContent>
      <Alert>
        <Sparkles className="h-4 w-4" />
        <AlertTitle>Coming Soon</AlertTitle>
        <AlertDescription>
          MCP integration is planned for a future release. Stay tuned!
        </AlertDescription>
      </Alert>

      {/* Stub UI (non-functional) */}
      <div className="mt-4 space-y-2 opacity-50 pointer-events-none">
        <Switch disabled />
        <Label className="text-sm">Enable MCP Server</Label>
        <Input disabled placeholder="MCP Server URL" />
        <Button disabled>Connect to Claude Desktop</Button>
      </div>
    </CardContent>
  </Card>
</div>
```

---

## File Metadata Panel

### Add "Metadata" Tab to RightSidebar

**Tab Structure:**
```
Right Sidebar Tabs:
├─ Search
├─ Outline
├─ Backlinks
├─ Tags
└─ Metadata  ← New (only visible when file selected)
```

**Metadata Panel UI:**

```tsx
export function MetadataPanel() {
  const { selectedContentId } = useContentStore();
  const [metadata, setMetadata] = useState<FileMetadata | null>(null);

  // Fetch metadata
  useEffect(() => {
    if (!selectedContentId) return;

    fetch(`/api/notes/content/${selectedContentId}/metadata`)
      .then(res => res.json())
      .then(data => setMetadata(data));
  }, [selectedContentId]);

  if (!metadata) return <div>Loading...</div>;

  return (
    <div className="p-4 space-y-4">
      {/* File Info */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">File Information</h3>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">File Name</dt>
            <dd className="font-mono">{metadata.fileName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Size</dt>
            <dd>{formatBytes(metadata.fileSize)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Type</dt>
            <dd>{metadata.mimeType}</dd>
          </div>
          {metadata.width && metadata.height && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Dimensions</dt>
              <dd>{metadata.width} × {metadata.height}</dd>
            </div>
          )}
          {metadata.duration && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Duration</dt>
              <dd>{formatDuration(metadata.duration)}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Storage Info */}
      <div className="space-y-2 border-t pt-4">
        <h3 className="text-sm font-semibold">Storage</h3>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Provider</dt>
            <dd className="capitalize">{metadata.storageProvider}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Uploaded</dt>
            <dd>{formatDate(metadata.uploadedAt)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Checksum</dt>
            <dd className="font-mono text-xs">{metadata.checksum.slice(0, 8)}...</dd>
          </div>
        </dl>
      </div>

      {/* Backup Info */}
      {metadata.backupEnabled && (
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Backups</h3>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="flex items-center gap-1">
                <Badge variant="success">Enabled</Badge>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Last Backup</dt>
              <dd>{formatDate(metadata.lastBackup)}</dd>
            </div>
          </dl>
          <Button variant="outline" size="sm" onClick={() => showBackupHistory()}>
            View Backup History
          </Button>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2 border-t pt-4">
        <Button className="w-full" onClick={() => downloadFile(metadata.id)}>
          <Download className="mr-2 h-4 w-4" />
          Download
        </Button>
        <Button variant="outline" className="w-full" onClick={() => deleteFile(metadata.id)}>
          <Trash className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}
```

---

## Security Enhancements

### Code File Security

**Prevent Execution:**
```typescript
// When generating presigned download URL
headers: {
  'Content-Type': mimeType,
  'Content-Disposition': 'attachment; filename="' + sanitizeFileName(fileName) + '"',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'",
}
```

**Sanitize Filenames:**
```typescript
function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')  // Remove special chars
    .replace(/\.{2,}/g, '.')            // Prevent directory traversal
    .substring(0, 255);                 // Limit length
}
```

**Optional Malware Scanning (M8):**
```typescript
// During finalize step
if (mimeType === 'application/javascript' || fileExtension === 'exe') {
  const scanResult = await scanForMalware(storageUrl);
  if (scanResult.isMalicious) {
    await prisma.filePayload.update({
      where: { contentId },
      data: {
        processingStatus: 'quarantined',
        uploadError: 'Malicious file detected',
      },
    });
    throw new Error('File quarantined due to security concerns');
  }
}
```

---

## Toaster Updates

### Multi-Upload Queue Support

**Update Toaster Config:**
```tsx
// From: visibleToasts={1}
// To:   visibleToasts={5}

<Toaster
  position="top-center"
  expand={true}
  richColors
  visibleToasts={5}  // Show up to 5 toasts (upload queue)
/>
```

**Upload Progress Toast:**
```tsx
// Initiate upload
const uploadId = `upload-${Date.now()}`;
toast.loading(
  <div className="flex items-center gap-3">
    <Loader2 className="h-4 w-4 animate-spin" />
    <div className="flex-1">
      <div className="text-sm font-medium">{fileName}</div>
      <div className="mt-1 h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {formatBytes(uploadedBytes)} of {formatBytes(totalBytes)} • {progress}%
      </div>
    </div>
  </div>,
  { id: uploadId, duration: Infinity }
);

// Update progress
toast.loading(/* same content with updated progress */, { id: uploadId });

// Success
toast.success(
  <div>
    <div className="font-medium">{fileName} uploaded</div>
    <div className="text-xs text-muted-foreground">
      {formatBytes(totalBytes)} • {formatDuration(uploadTime)}
    </div>
  </div>,
  { id: uploadId }
);

// Error
toast.error(
  <div>
    <div className="font-medium">Failed to upload {fileName}</div>
    <div className="text-xs">{error.message}</div>
    <Button size="sm" variant="outline" onClick={() => retryUpload()}>
      Retry
    </Button>
  </div>,
  { id: uploadId }
);
```

---

## Implementation Phases (Updated)

### Phase 0: Settings UI (Week 1, Days 1-2) ✨ NEW

**Goal:** Build complete settings page with all sections stubbed out

1. ✅ Create settings layout (`/app/(authenticated)/settings/layout.tsx`)
2. ✅ Create sticky sidebar navigation (match notes design)
3. ✅ Build storage settings UI (3 tabs: Providers, Backups, Usage)
4. ✅ Stub API keys page with dummy data
5. ✅ Stub MCP page with "Coming Soon"
6. ✅ Add encryption utility (`/lib/crypto/encrypt.ts`)
7. ✅ Connect storage tabs to console alerts (not real APIs yet)
8. ✅ Add metadata panel to RightSidebar (stub for now)

**Deliverable:** Fully designed, non-functional settings page ready to wire up

---

### Phase 1: Core Storage SDK (Week 1, Days 3-4)

1. ✅ Install dependencies (`@aws-sdk/client-s3`, `@vercel/blob`, etc.)
2. ✅ Migrate schema: split `config` into `config + credentials`
3. ✅ Add `DownloadLog` model to schema
4. ✅ Update `User` model with `storageUsedBytes` and `storageTier`
5. ✅ Create storage provider interface (`/lib/storage/types.ts`)
6. ✅ Implement R2 provider (`/lib/storage/r2-provider.ts`)
7. ✅ Create encryption utility (`/lib/crypto/encrypt.ts`)
8. ✅ Create storage factory (`/lib/storage/factory.ts`)
9. ✅ Update upload initiate API to use real R2 provider
10. ✅ Test R2 upload flow end-to-end

---

### Phase 2: Quota & Rate Limiting (Week 1, Day 5)

11. ✅ Create quota enforcement middleware
12. ✅ Update upload initiate to check quota
13. ✅ Create download logging middleware
14. ✅ Update download API to check rate limits
15. ✅ Add usage calculation helper (sum of FilePayload.fileSize)
16. ✅ Test quota blocking (should reject when over limit)

---

### Phase 3: Media Processing (Week 2, Days 1-2)

17. ✅ Install media dependencies (Sharp, FFmpeg, pdfjs)
18. ✅ Create media processor (`/lib/media/processor.ts`)
19. ✅ Implement image processing (dimensions + thumbnails)
20. ✅ Implement video processing (duration + thumbnail)
21. ✅ Implement PDF processing (page count + thumbnail)
22. ✅ Update finalize API to process media
23. ✅ Test thumbnail generation for all types

---

### Phase 4: Upload UI & File Management (Week 2, Days 3-4)

24. ✅ Install react-dropzone
25. ✅ Create FileUpload component with drag-and-drop
26. ✅ Add upload progress tracking
27. ✅ Wire up to upload API (initiate → upload → finalize)
28. ✅ Update toaster for multi-upload queue
29. ✅ Add upload errors with retry button
30. ✅ Add file upload to context menu (+ → Upload File)
31. ✅ Create download API route with rate limiting
32. ✅ Add download button to file context menu
33. ✅ Update delete to remove from storage + trash bin

---

### Phase 5: Media Viewers (Week 2, Day 5)

34. ✅ Create ImageViewer component
35. ✅ Create PDFViewer component (react-pdf)
36. ✅ Create VideoViewer component (HTML5 video)
37. ✅ Create AudioViewer component (HTML5 audio)
38. ✅ Update MainPanel to route by content type
39. ✅ Add fallback for unsupported types

---

### Phase 6: Wire Up Settings (Week 3, Days 1-2)

40. ✅ Connect storage providers tab to real API
41. ✅ Connect backups tab to ContentNode metadata
42. ✅ Connect usage tab to real quota data
43. ✅ Test provider switching with warning dialog
44. ✅ Test backup enable/disable per folder
45. ✅ Wire up metadata panel to real file data

---

### Phase 7: Trash Bin & Cleanup (Week 3, Days 3-4)

46. ✅ Create trash bin UI (`/notes/trash`)
47. ✅ Update delete to create TrashBin entry
48. ✅ Add restore functionality
49. ✅ Add force delete with storage cleanup
50. ✅ Create auto-cleanup Vercel Cron job
51. ✅ Test trash → restore → delete flow

---

### Phase 8: Testing & Documentation (Week 3, Day 5)

52. ✅ Test R2 provider end-to-end
53. ✅ Test quota enforcement (free, basic, pro tiers)
54. ✅ Test rate limiting (download abuse protection)
55. ✅ Test media processing for all file types
56. ✅ Test backup enable/disable
57. ✅ Test trash bin auto-cleanup
58. ✅ Update M7 documentation
59. ✅ Create data export guide (GDPR compliance)
60. ✅ Update IMPLEMENTATION-STATUS.md

---

## Open Questions (Resolved)

All questions from the initial document have been resolved:

1. ✅ **Settings Location:** Dedicated `/settings` route with full UI
2. ✅ **Credential Encryption:** Yes, split into `config` (plain) + `credentials` (encrypted)
3. ✅ **Onboarding:** Environment default with banner prompt (non-blocking)
4. ✅ **Provider Migration:** No automatic migration, clear warning before switching
5. ✅ **Quotas:** Tiered quotas tracked in `User.storageUsedBytes`
6. ✅ **Cleanup Jobs:** Vercel Cron for orphaned files and trash auto-delete
7. ✅ **Backups:** Bucket versioning + lifecycle policies (10-20% cost, not 100%)
8. ✅ **Trash Bin:** 30-day soft delete for all content types
9. ✅ **Rate Limiting:** 10/hour for non-admins, tracked in `DownloadLog`
10. ✅ **File Metadata:** New tab in RightSidebar with full file info

---

## Next Steps

**Before Starting Implementation:**

1. ✅ Review this updated architecture document
2. ✅ Confirm all decisions are aligned with vision
3. ✅ Prepare R2 credentials for testing (or use env defaults)

**Start with Phase 0: Settings UI**
- Build entire settings page layout
- Stub out all sections with dummy data
- Use console alerts for interactions
- Get visual design approved before wiring up APIs

**Then Phase 1: Core Storage SDK**
- Migrate database schema
- Implement R2 provider
- Update upload APIs
- Test end-to-end upload flow

---

## References

- [Original M7 Plan](./M7-FILE-MANAGEMENT-MEDIA.md)
- [Prisma Schema](../../prisma/schema.prisma)
- [Upload Initiate API](../../app/api/notes/content/upload/initiate/route.ts)
- [Upload Finalize API](../../app/api/notes/content/upload/finalize/route.ts)
- [Storage Config API](../../app/api/notes/storage/route.ts)
- [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md)
