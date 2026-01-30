# M10: Backblaze B2 Secondary Backup Provider

**Milestone:** M10 (Future)
**Created:** January 21, 2026
**Status:** Planned, Not Yet Scheduled

---

## Overview

Add Backblaze B2 as a secondary backup provider for disaster recovery and cost-effective long-term storage.

**Why Backblaze B2?**
- **Cheapest storage:** $0.005/GB/month (1/3 the cost of R2/S3)
- **Free egress to Cloudflare:** Perfect pairing with R2 primary storage
- **No minimum storage duration:** Delete anytime without penalty
- **S3-compatible API:** Easy to implement using existing S3 provider code

---

## Architecture Design

### Primary + Secondary Backup Strategy

```
Primary Storage (R2/S3):
  - User uploads
  - Fast access
  - Active files
  - Versioning enabled

Secondary Backup (Backblaze B2):
  - Weekly/monthly snapshots
  - Disaster recovery
  - Long-term retention
  - Cold storage
```

**Example Workflow:**
```
Day 0:   User uploads file.jpg → R2 (primary)
Day 7:   Backup job copies file.jpg → B2 (secondary)
Day 30:  R2 lifecycle moves old version to IA tier
Day 90:  B2 still has copy (long-term retention)
```

---

## Database Schema Extension

### Add Secondary Backup Config

```prisma
model StorageProviderConfig {
  // ... existing fields

  // New fields for secondary backup
  isBackupProvider    Boolean   @default(false)
  backupSourceId      String?   @db.Uuid  // Points to primary provider
  backupSchedule      String?   @db.VarChar(20)  // "weekly", "monthly", "manual"
  lastBackupRun       DateTime? @db.Timestamptz()
  nextBackupRun       DateTime? @db.Timestamptz()

  backupSource        StorageProviderConfig? @relation("BackupRelation", fields: [backupSourceId], references: [id])
  backupTargets       StorageProviderConfig[] @relation("BackupRelation")
}
```

**Example Data:**
```typescript
// Primary provider (R2)
{
  id: "r2-config-123",
  provider: "r2",
  isDefault: true,
  isBackupProvider: false,
  // ... other fields
}

// Secondary backup provider (B2)
{
  id: "b2-config-456",
  provider: "b2",  // New enum value
  isDefault: false,
  isBackupProvider: true,
  backupSourceId: "r2-config-123",
  backupSchedule: "weekly",
  lastBackupRun: "2026-01-14T00:00:00Z",
  nextBackupRun: "2026-01-21T00:00:00Z",
}
```

---

## Implementation Plan

### Phase 1: B2 Provider Implementation (2 days)

**Install Dependencies:**
```bash
# Backblaze B2 uses S3-compatible API
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

**Create B2 Provider:**
```typescript
// lib/storage/b2-provider.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class B2StorageProvider implements StorageProvider {
  private client: S3Client;

  constructor(config: B2Config) {
    this.client = new S3Client({
      region: 'us-west-000', // B2 uses specific region format
      endpoint: `https://s3.${config.region}.backblazeb2.com`,
      credentials: {
        accessKeyId: config.keyId,
        secretAccessKey: config.applicationKey,
      },
    });
  }

  async generateUploadUrl(key: string, mimeType: string): Promise<PresignedUrl> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
      ContentType: mimeType,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn: 3600 });

    return {
      url,
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };
  }

  // ... other methods (same as S3Provider)
}
```

**Add to Provider Enum:**
```prisma
enum StorageProvider {
  r2
  s3
  vercel
  b2        // New
  cloudinary
}
```

**Add to Factory:**
```typescript
// lib/storage/factory.ts
export async function createStorageProvider(config: StorageProviderConfig): Promise<StorageProvider> {
  switch (config.provider) {
    case 'r2':
      return new R2StorageProvider(decryptConfig(config.credentials));
    case 's3':
      return new S3StorageProvider(decryptConfig(config.credentials));
    case 'vercel':
      return new VercelBlobProvider(decryptConfig(config.credentials));
    case 'b2':
      return new B2StorageProvider(decryptConfig(config.credentials));  // New
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}
```

---

### Phase 2: Backup Job Implementation (3 days)

**Create Backup Service:**
```typescript
// lib/storage/backup-service.ts
export class BackupService {
  /**
   * Copy files from primary to secondary backup provider
   */
  async backupFiles(
    primaryProviderId: string,
    backupProviderId: string,
    options: BackupOptions
  ): Promise<BackupResult> {
    const primaryProvider = await getStorageProvider(primaryProviderId);
    const backupProvider = await getStorageProvider(backupProviderId);

    // Get files to backup (based on options)
    const files = await this.getFilesToBackup(primaryProviderId, options);

    const results = {
      total: files.length,
      succeeded: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const file of files) {
      try {
        // Stream file from primary to backup
        const stream = await primaryProvider.getFileStream(file.storageKey);

        // Upload to backup provider (different key prefix)
        const backupKey = `backups/${file.ownerId}/${file.id}/${Date.now()}.${file.fileExtension}`;
        await backupProvider.uploadStream(backupKey, stream, file.mimeType);

        // Log backup
        await prisma.backupLog.create({
          data: {
            filePayloadId: file.id,
            primaryProvider: primaryProviderId,
            backupProvider: backupProviderId,
            backupKey,
            backupSize: file.fileSize,
            backupStatus: 'success',
          },
        });

        results.succeeded++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Failed to backup ${file.fileName}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Get files that need backup based on criteria
   */
  private async getFilesToBackup(
    providerId: string,
    options: BackupOptions
  ): Promise<FilePayload[]> {
    const where: any = {
      storageProvider: providerId,
      uploadStatus: 'ready',
    };

    // Filter by user's backup settings
    if (options.onlyBackupEnabled) {
      where.content = {
        // ContentNode.metadata.backupEnabled = true
        metadata: {
          path: ['backupEnabled'],
          equals: true,
        },
      };
    }

    // Filter by date (only backup files older than X days)
    if (options.olderThanDays) {
      where.uploadedAt = {
        lte: new Date(Date.now() - options.olderThanDays * 24 * 60 * 60 * 1000),
      };
    }

    return prisma.filePayload.findMany({
      where,
      include: { content: true },
    });
  }
}
```

**Backup Log Model:**
```prisma
model BackupLog {
  id              String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  filePayloadId   String      @db.Uuid
  primaryProvider String      @db.Uuid
  backupProvider  String      @db.Uuid
  backupKey       String      @db.VarChar(512)
  backupSize      BigInt
  backupStatus    String      @db.VarChar(20)  // "success", "failed"
  errorMessage    String?     @db.Text
  createdAt       DateTime    @default(now()) @db.Timestamptz()

  filePayload     FilePayload @relation(fields: [filePayloadId], references: [contentId])

  @@index([filePayloadId])
  @@index([createdAt])
}
```

---

### Phase 3: Scheduled Backup Jobs (2 days)

**Vercel Cron Configuration:**
```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/backup",
      "schedule": "0 2 * * 0"
    }
  ]
}
```
- Runs every Sunday at 2 AM UTC
- Weekly backup schedule

**Backup Cron Endpoint:**
```typescript
// app/api/cron/backup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { BackupService } from '@/lib/storage/backup-service';

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const backupService = new BackupService();

  // Find all users with secondary backup enabled
  const backupConfigs = await prisma.storageProviderConfig.findMany({
    where: {
      isBackupProvider: true,
      isActive: true,
    },
    include: {
      backupSource: true,  // Primary provider
      user: true,
    },
  });

  const results = [];

  for (const config of backupConfigs) {
    // Check if backup is due
    if (config.nextBackupRun && config.nextBackupRun > new Date()) {
      continue; // Not due yet
    }

    try {
      const result = await backupService.backupFiles(
        config.backupSourceId!,
        config.id,
        {
          onlyBackupEnabled: true,  // Only backup files with backupEnabled=true
          olderThanDays: 7,         // Only backup files older than 7 days
        }
      );

      // Update last/next backup run
      await prisma.storageProviderConfig.update({
        where: { id: config.id },
        data: {
          lastBackupRun: new Date(),
          nextBackupRun: calculateNextBackupRun(config.backupSchedule),
        },
      });

      results.push({
        userId: config.userId,
        provider: config.provider,
        result,
      });
    } catch (error) {
      results.push({
        userId: config.userId,
        error: error.message,
      });
    }
  }

  return NextResponse.json({ success: true, results });
}

function calculateNextBackupRun(schedule: string): Date {
  const now = new Date();
  switch (schedule) {
    case 'daily':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case 'weekly':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case 'monthly':
      return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    default:
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
}
```

---

### Phase 4: UI for Secondary Backup (2 days)

**Settings → Storage → Backups Tab Update:**

```tsx
<Card>
  <CardHeader>
    <CardTitle>Secondary Backup Provider</CardTitle>
    <CardDescription>
      Configure a secondary provider for disaster recovery and long-term retention
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* Enable Secondary Backup */}
    <div className="flex items-center justify-between">
      <div>
        <Label>Enable Secondary Backup</Label>
        <p className="text-sm text-muted-foreground">
          Automatically copy files to a secondary provider for redundancy
        </p>
      </div>
      <Switch
        checked={secondaryBackupEnabled}
        onCheckedChange={setSecondaryBackupEnabled}
      />
    </div>

    {secondaryBackupEnabled && (
      <>
        {/* Provider Selection */}
        <div>
          <Label>Backup Provider</Label>
          <Select value={backupProvider} onValueChange={setBackupProvider}>
            <SelectTrigger>
              <SelectValue placeholder="Choose backup provider..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="b2">
                <div className="flex items-center gap-2">
                  <Cloud className="h-4 w-4" />
                  <div>
                    <div>Backblaze B2</div>
                    <div className="text-xs text-muted-foreground">
                      Cheapest ($0.005/GB/month)
                    </div>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="s3">Amazon S3 Glacier</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Backup Schedule */}
        <div>
          <Label>Backup Schedule</Label>
          <Select value={backupSchedule} onValueChange={setBackupSchedule}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly (Recommended)</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="manual">Manual Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Next Backup Info */}
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>
            Next backup: {formatDate(nextBackupRun)}
            <Button
              size="sm"
              variant="outline"
              onClick={runBackupNow}
              className="ml-2"
            >
              Run Now
            </Button>
          </AlertDescription>
        </Alert>

        {/* Backup History */}
        <div>
          <Label>Recent Backups</Label>
          <div className="space-y-2 mt-2">
            {backupHistory.map(backup => (
              <div key={backup.id} className="flex justify-between text-sm">
                <span>{formatDate(backup.createdAt)}</span>
                <span className="text-muted-foreground">
                  {backup.filesBackedUp} files • {formatBytes(backup.totalSize)}
                </span>
                <Badge variant={backup.status === 'success' ? 'success' : 'destructive'}>
                  {backup.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Cost Estimate */}
        <Alert>
          <DollarSign className="h-4 w-4" />
          <AlertDescription>
            Estimated monthly cost: ${estimatedCost.toFixed(2)}
            <div className="text-xs text-muted-foreground mt-1">
              Based on {formatBytes(totalStorageSize)} across {totalFiles} files
            </div>
          </AlertDescription>
        </Alert>
      </>
    )}
  </CardContent>
</Card>
```

---

## Cost Analysis

**Example: 100 GB of files**

| Storage Type | Provider | Cost/Month | Egress | Total |
|-------------|----------|------------|--------|-------|
| **Primary** | Cloudflare R2 | $1.50 | $0 (free) | **$1.50** |
| **Primary Backups** | R2 Versioning (30-day IA) | $0.15 | $0 | **$0.15** |
| **Secondary Backup** | Backblaze B2 | $0.50 | $0 (free to CF) | **$0.50** |
| **Total** | | | | **$2.15/month** |

**Comparison:**
- Without any backups: $1.50/month (100% risk)
- With primary versioning only: $1.65/month (10% increase, 90% risk reduction)
- With primary + secondary backup: $2.15/month (43% increase, 99% risk reduction)

**Recommendation:** Secondary backup is optional, but provides disaster recovery for only $0.50/month.

---

## Architecture Extensibility

### Current M7 Architecture (Primary + Versioning)

```typescript
// Backup config stored in ContentNode.metadata
{
  "backupEnabled": true,
  "backupSchedule": "weekly",  // Uses primary provider versioning
  "retentionDays": 90
}
```

### Future M9 Architecture (Primary + Secondary)

```typescript
// Backup config expanded
{
  "backupEnabled": true,
  "backupSchedule": "weekly",
  "retentionDays": 90,

  // New fields for M9
  "secondaryBackupEnabled": true,
  "secondaryBackupProvider": "b2",  // Backblaze B2
  "secondaryBackupSchedule": "weekly",
  "lastSecondaryBackup": "2026-01-14T00:00:00Z"
}
```

**Database Changes Required for M9:**
1. Add `isBackupProvider`, `backupSourceId`, `backupSchedule` to `StorageProviderConfig`
2. Add `BackupLog` model
3. Add B2 to `StorageProvider` enum

**No changes needed to existing M7 code** - fully backward compatible.

---

## Disaster Recovery Workflow

**Scenario: Primary provider (R2) suffers data loss**

1. **Detect loss:** Automated health check finds missing files
2. **Alert admin:** Email/SMS notification
3. **Restore from B2:**
   ```typescript
   const backupService = new BackupService();
   await backupService.restoreFromBackup({
     fileId: 'lost-file-123',
     backupProvider: 'b2',
     targetProvider: 'r2',
   });
   ```
4. **Verify:** Check file integrity (checksum match)
5. **Resume:** Files back online, users see no downtime

**Recovery Time Objective (RTO):** < 1 hour
**Recovery Point Objective (RPO):** Last weekly backup (max 7 days data loss)

---

## Implementation Timeline

**M9 Milestone (Future):**
- Week 1: B2 provider implementation + testing
- Week 2: Backup service + Vercel Cron job
- Week 3: UI for secondary backup configuration
- Week 4: Disaster recovery testing + documentation

**Total:** 4 weeks

---

## References

- [Backblaze B2 Documentation](https://www.backblaze.com/b2/docs/)
- [Backblaze + Cloudflare Bandwidth Alliance](https://www.backblaze.com/blog/backblaze-and-cloudflare-partner-to-provide-free-data-transfer/)
- [M7 Storage Architecture](./M7-STORAGE-ARCHITECTURE-V2.md)
- [Prisma Schema](../../prisma/schema.prisma)
