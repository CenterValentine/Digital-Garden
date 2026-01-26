# Storage Provider Configuration Examples

## How to Access config Values

The `validateProviderConfig` function receives a typed `config` parameter. Access values using destructuring or dot notation.

---

## Updated validateProviderConfig (with usage examples)

```typescript
// apps/web/app/api/notes/storage/route.ts

import type { R2Config, S3Config, VercelConfig, StorageConfig } from "@/lib/content/api-types";

function validateProviderConfig(
  provider: "r2" | "s3" | "vercel",
  config: StorageConfig
): string | null {
  
  if (provider === "r2") {
    const r2Config = config as R2Config;
    
    // Validation
    if (
      !r2Config.accountId ||
      !r2Config.accessKeyId ||
      !r2Config.secretAccessKey ||
      !r2Config.bucket
    ) {
      return "R2 requires: accountId, accessKeyId, secretAccessKey, bucket";
    }
    
    // USAGE EXAMPLE 1: Destructuring
    const { accountId, accessKeyId, secretAccessKey, bucket } = r2Config;
    console.log("R2 Config:", { accountId, bucket }); // Don't log secrets!
    
    // USAGE EXAMPLE 2: Dot notation
    console.log("Bucket:", r2Config.bucket);
    
    // USAGE EXAMPLE 3: Pass to SDK
    // const s3Client = new S3Client({
    //   endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
    //   region: "auto",
    //   credentials: {
    //     accessKeyId: r2Config.accessKeyId,
    //     secretAccessKey: r2Config.secretAccessKey,
    //   },
    // });
    
  } else if (provider === "s3") {
    const s3Config = config as S3Config;
    
    // Validation
    if (
      !s3Config.region ||
      !s3Config.accessKeyId ||
      !s3Config.secretAccessKey ||
      !s3Config.bucket
    ) {
      return "S3 requires: region, accessKeyId, secretAccessKey, bucket";
    }
    
    // USAGE: Access values
    const { region, accessKeyId, secretAccessKey, bucket } = s3Config;
    console.log("S3 Config:", { region, bucket });
    
  } else if (provider === "vercel") {
    const vercelConfig = config as VercelConfig;
    
    // Validation
    if (!vercelConfig.token) {
      return "Vercel Blob requires: token";
    }
    
    // USAGE: Access values
    const { token } = vercelConfig;
    console.log("Vercel Config: token present =", !!token);
  }

  return null; // Valid
}
```

---

## Complete Example: Using Config in Upload

```typescript
// apps/web/app/api/notes/content/upload/initiate/route.ts

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { R2Config, S3Config, VercelConfig } from "@/lib/content/api-types";

async function generatePresignedUploadUrl(
  provider: "r2" | "s3" | "vercel",
  config: Record<string, unknown>, // From database (JSONB)
  storageKey: string,
  mimeType: string
): Promise<string> {
  
  if (provider === "r2") {
    // Cast config to proper type
    const r2Config = config as R2Config;
    
    // Access config values
    const { accountId, accessKeyId, secretAccessKey, bucket } = r2Config;
    
    // Initialize S3 client (R2 is S3-compatible)
    const s3Client = new S3Client({
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      region: "auto",
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    
    // Generate presigned URL
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      ContentType: mimeType,
    });
    
    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600, // 1 hour
    });
    
    return presignedUrl;
    
  } else if (provider === "s3") {
    // Cast config to proper type
    const s3Config = config as S3Config;
    
    // Access config values
    const { region, accessKeyId, secretAccessKey, bucket } = s3Config;
    
    // Initialize S3 client
    const s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    
    // Generate presigned URL
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      ContentType: mimeType,
    });
    
    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });
    
    return presignedUrl;
    
  } else if (provider === "vercel") {
    // Cast config to proper type
    const vercelConfig = config as VercelConfig;
    
    // Access config values
    const { token } = vercelConfig;
    
    // Use Vercel Blob SDK
    // const { put } = await import("@vercel/blob");
    // const blob = await put(storageKey, file, {
    //   access: "public",
    //   token,
    // });
    // return blob.uploadUrl;
    
    return `https://blob.vercel-storage.com/upload?token=${token}`;
  }
  
  throw new Error(`Unsupported provider: ${provider}`);
}
```

---

## Config Type Definitions

```typescript
// lib/content/api-types.ts

export interface R2Config {
  accountId: string;      // e.g., "abc123"
  accessKeyId: string;    // e.g., "R2_ACCESS_KEY"
  secretAccessKey: string;// e.g., "r2_secret_..."
  bucket: string;         // e.g., "my-uploads"
}

export interface S3Config {
  region: string;         // e.g., "us-east-1"
  accessKeyId: string;    // e.g., "AKIA..."
  secretAccessKey: string;// e.g., "aws_secret_..."
  bucket: string;         // e.g., "my-s3-bucket"
}

export interface VercelConfig {
  token: string;          // e.g., "vercel_blob_..."
}

export type StorageConfig = R2Config | S3Config | VercelConfig;
```

---

## Request/Response Example

### Create Storage Config

```http
POST /api/notes/storage
Content-Type: application/json

{
  "provider": "r2",
  "displayName": "Cloudflare R2 Production",
  "config": {
    "accountId": "abc123",
    "accessKeyId": "R2_ACCESS_KEY",
    "secretAccessKey": "r2_secret_...",
    "bucket": "my-uploads"
  },
  "isDefault": true
}
```

### Response

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "provider": "r2",
    "displayName": "Cloudflare R2 Production",
    "isDefault": true,
    "isActive": true,
    "createdAt": "2026-01-12T...",
    "updatedAt": "2026-01-12T..."
  }
}
```

Note: `config` is omitted in response (sensitive data).

### Get Storage Config (includes sensitive config)

```http
GET /api/notes/storage/{id}
```

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "provider": "r2",
    "displayName": "Cloudflare R2 Production",
    "config": {
      "accountId": "abc123",
      "accessKeyId": "R2_ACCESS_KEY",
      "secretAccessKey": "r2_secret_...",
      "bucket": "my-uploads"
    },
    "isDefault": true,
    "isActive": true,
    "createdAt": "2026-01-12T...",
    "updatedAt": "2026-01-12T..."
  }
}
```

---

## Summary

**Accessing config values:**

1. **In validateProviderConfig:**
   ```typescript
   const r2Config = config as R2Config;
   const { accountId, accessKeyId, secretAccessKey, bucket } = r2Config;
   ```

2. **In upload handlers:**
   ```typescript
   const config = storageConfig.config as R2Config;
   const client = new S3Client({
     endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
     credentials: {
       accessKeyId: config.accessKeyId,
       secretAccessKey: config.secretAccessKey,
     },
   });
   ```

3. **TypeScript ensures type safety:**
   - `R2Config` has `accountId`, `accessKeyId`, `secretAccessKey`, `bucket`
   - `S3Config` has `region`, `accessKeyId`, `secretAccessKey`, `bucket`
   - `VercelConfig` has `token`
   - Wrong property access = compile error ✓

