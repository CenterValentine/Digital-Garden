# Advanced Security

**Version:** 1.0  
**Last Updated:** January 12, 2026

## Overview

This document covers advanced security measures including virus scanning, sandboxing, abuse controls, and protection against sophisticated attacks.

## Virus and Malware Scanning

### Scanning Strategy

All uploaded files should be scanned for viruses before storage and serving.

### Option 1: ClamAV Integration (Self-Hosted)

```typescript
// lib/security/virus-scan.ts
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";

const execAsync = promisify(exec);

export async function scanFileWithClamAV(
  filePath: string
): Promise<{ clean: boolean; threat?: string }> {
  try {
    // Run ClamAV scan
    const { stdout } = await execAsync(`clamscan --no-summary ${filePath}`);

    if (stdout.includes("OK")) {
      return { clean: true };
    } else if (stdout.includes("FOUND")) {
      const threat = stdout.split(":")[1].trim();
      return { clean: false, threat };
    }

    throw new Error("Unexpected scan result");
  } catch (error) {
    // Log error and fail safe (reject file)
    console.error("Virus scan error:", error);
    return { clean: false, threat: "SCAN_ERROR" };
  }
}
```

### Option 2: VirusTotal API (Cloud)

```typescript
// lib/security/virustotal.ts
export async function scanFileWithVirusTotal(
  fileBuffer: Buffer,
  filename: string
): Promise<{ clean: boolean; detections: number; vendors: string[] }> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY;

  // Upload file for scanning
  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), filename);

  const uploadResponse = await fetch(
    "https://www.virustotal.com/api/v3/files",
    {
      method: "POST",
      headers: { "x-apikey": apiKey },
      body: formData,
    }
  );

  const { data } = await uploadResponse.json();
  const analysisId = data.id;

  // Wait for scan to complete (poll)
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Get results
  const resultsResponse = await fetch(
    `https://www.virustotal.com/api/v3/analyses/${analysisId}`,
    { headers: { "x-apikey": apiKey } }
  );

  const results = await resultsResponse.json();
  const stats = results.data.attributes.stats;

  return {
    clean: stats.malicious === 0 && stats.suspicious === 0,
    detections: stats.malicious + stats.suspicious,
    vendors: Object.keys(results.data.attributes.results).filter(
      (vendor) =>
        results.data.attributes.results[vendor].category === "malicious"
    ),
  };
}
```

### Option 3: AWS S3 Malware Protection

```typescript
// lib/storage/s3-malware-scan.ts

// Enable S3 Malware Protection in AWS Console, then:
export async function uploadWithMalwareScan(
  key: string,
  buffer: Buffer
): Promise<{ uploaded: boolean; scanStatus: string }> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: buffer,
      // Tag for malware scanning
      Tagging: "scan-on-upload=true",
    })
  );

  // Wait for scan result via SNS/SQS or polling
  const scanResult = await waitForScanResult(key);

  if (scanResult.status === "CLEAN") {
    return { uploaded: true, scanStatus: "CLEAN" };
  } else {
    // Delete infected file
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
      })
    );

    return { uploaded: false, scanStatus: scanResult.status };
  }
}
```

### Integration in Upload Flow

```typescript
// app/api/notes/files/upload/confirm/route.ts
export async function POST(request: Request) {
  const { contentId } = await request.json();
  const session = await requireAuth();

  // Get file metadata
  const fileMetadata = await prisma.fileMetadata.findUnique({
    where: { contentId },
  });

  // Download file from temporary storage
  const fileBuffer = await downloadFromStorage(fileMetadata.storageKey);

  // Scan for viruses
  const scanResult = await scanFileWithVirusTotal(
    fileBuffer,
    fileMetadata.fileName
  );

  if (!scanResult.clean) {
    // Delete file and metadata
    await deleteFromStorage(fileMetadata.storageKey);
    await prisma.fileMetadata.delete({ where: { contentId } });
    await prisma.structuredDocument.delete({ where: { id: contentId } });

    // Log security event
    await logSecurityEvent({
      type: "MALWARE_DETECTED",
      userId: session.user.id,
      filename: fileMetadata.fileName,
      threat: scanResult.vendors.join(", "),
    });

    return Response.json(
      { error: "Malware detected", detections: scanResult.detections },
      { status: 400 }
    );
  }

  // Mark as scanned and processed
  await prisma.fileMetadata.update({
    where: { contentId },
    data: {
      isProcessed: true,
      storageMetadata: {
        scanned: true,
        scanDate: new Date(),
        scanEngine: "virustotal",
      },
    },
  });

  return Response.json({ success: true });
}
```

### Office Document Macro Scanning

```typescript
// lib/security/macro-scan.ts
import AdmZip from "adm-zip";

export async function scanOfficeDocumentForMacros(
  fileBuffer: Buffer
): Promise<{ hasMacros: boolean; macroFiles: string[] }> {
  try {
    const zip = new AdmZip(fileBuffer);
    const entries = zip.getEntries();

    // Check for VBA macro files
    const macroFiles = entries
      .filter(
        (entry) =>
          entry.entryName.includes("vbaProject.bin") ||
          entry.entryName.includes("/macros/") ||
          entry.entryName.endsWith(".vba")
      )
      .map((entry) => entry.entryName);

    return {
      hasMacros: macroFiles.length > 0,
      macroFiles,
    };
  } catch (error) {
    // If can't parse as zip, assume no macros (or not Office doc)
    return { hasMacros: false, macroFiles: [] };
  }
}

// In upload validation
if (mimeType.includes("officedocument")) {
  const macroScan = await scanOfficeDocumentForMacros(fileBuffer);

  if (macroScan.hasMacros) {
    // Policy decision: reject or warn user
    return Response.json(
      { error: "Office documents with macros are not allowed" },
      { status: 400 }
    );
  }
}
```

## Sandboxing Strategies

### Iframe Sandboxing for User Content

```typescript
// components/notes/PDFViewer.tsx
export function PDFViewer({ url }: { url: string }) {
  return (
    <iframe
      src={url}
      sandbox="allow-scripts allow-same-origin"
      // Restrictive sandbox:
      // - No form submission
      // - No popup windows
      // - No top navigation
      // - No downloads (without user permission)
      style={{ width: '100%', height: '100%', border: 'none' }}
      title="PDF Viewer"
    />
  );
}

// For even more security, use separate domain
export function SecurePDFViewer({ contentId }: { contentId: string }) {
  // Serve from user-content subdomain
  const secureUrl = `https://user-content.yourdomain.com/pdf/${contentId}`;

  return (
    <iframe
      src={secureUrl}
      sandbox="allow-scripts"
      // No allow-same-origin = complete isolation
      style={{ width: '100%', height: '100%', border: 'none' }}
    />
  );
}
```

### SVG Sanitization

```typescript
// lib/security/svg-sanitizer.ts
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeSVG(svgString: string): string {
  return DOMPurify.sanitize(svgString, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'foreignObject'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
  });
}

// When displaying SVG images
export function SVGImage({ src }: { src: string }) {
  const [sanitizedSVG, setSanitizedSVG] = useState('');

  useEffect(() => {
    fetch(src)
      .then(res => res.text())
      .then(svg => setSanitizedSVG(sanitizeSVG(svg)));
  }, [src]);

  return (
    <div
      dangerouslySetInnerHTML={{ __html: sanitizedSVG }}
      className="svg-container"
    />
  );
}
```

### Code Block XSS Prevention

```typescript
// components/notes/CodeBlock.tsx
import { codeToHtml } from 'shiki';

export async function CodeBlock({ code, language }: CodeBlockProps) {
  // Shiki renders code server-side, no client execution
  const html = await codeToHtml(code, {
    lang: language,
    theme: 'github-dark',
  });

  // Safe to render - Shiki escapes all user input
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

// For client-side rendering with Prism
export function ClientCodeBlock({ code, language }: CodeBlockProps) {
  const sanitizedCode = escapeHtml(code);

  return (
    <pre>
      <code className={`language-${language}`}>
        {sanitizedCode}
      </code>
    </pre>
  );
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
```

### HTML Blocks in Markdown

```typescript
// TipTap configuration for markdown editor
import StarterKit from "@tiptap/starter-kit";

export const editorExtensions = [
  StarterKit.configure({
    // Disable raw HTML by default
    html: false,
  }),

  // If HTML needed, use sanitized version
  CustomHTML.configure({
    HTMLAttributes: {
      class: "user-html",
    },
    sanitize: (html: string) => {
      return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "a"],
        ALLOWED_ATTR: ["href"],
      });
    },
  }),
];
```

### WebWorker Isolation for File Processing

```typescript
// workers/file-processor.worker.ts

// Run file processing in isolated WebWorker
self.addEventListener("message", async (event) => {
  const { type, data } = event.data;

  try {
    switch (type) {
      case "EXTRACT_TEXT":
        const text = await extractTextFromPDF(data.buffer);
        self.postMessage({ success: true, text });
        break;

      case "GENERATE_THUMBNAIL":
        const thumbnail = await generateThumbnail(data.buffer);
        self.postMessage({ success: true, thumbnail });
        break;

      default:
        throw new Error("Unknown task type");
    }
  } catch (error) {
    self.postMessage({ success: false, error: error.message });
  }
});

// Usage in main thread
const worker = new Worker(
  new URL("./file-processor.worker.ts", import.meta.url)
);

worker.postMessage({
  type: "EXTRACT_TEXT",
  data: { buffer: pdfBuffer },
});

worker.addEventListener("message", (event) => {
  if (event.data.success) {
    console.log("Extracted text:", event.data.text);
  }
});
```

## Abuse Controls

### Account Suspension System

```typescript
// lib/security/abuse-detection.ts

export async function checkAbusePatterns(userId: string): Promise<{
  suspicious: boolean;
  reasons: string[];
  action: "none" | "warn" | "suspend";
}> {
  const reasons: string[] = [];

  // Check 1: Upload rate
  const recentUploads = await prisma.fileMetadata.count({
    where: {
      document: { ownerId: userId },
      uploadedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
    },
  });

  if (recentUploads > 100) {
    reasons.push("Excessive upload rate");
  }

  // Check 2: Failed upload attempts
  const failedUploads = await redis.get(`failed-uploads:${userId}`);
  if (Number(failedUploads) > 20) {
    reasons.push("Multiple failed upload attempts");
  }

  // Check 3: Malware detections
  const malwareCount = await prisma.securityLog.count({
    where: {
      userId,
      event: "MALWARE_DETECTED",
      timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  if (malwareCount > 0) {
    reasons.push("Malware upload detected");
  }

  // Check 4: Abnormal file sizes
  const avgFileSize = await getAverageFileSize(userId);
  if (avgFileSize > 50 * 1024 * 1024) {
    reasons.push("Unusually large files");
  }

  // Determine action
  let action: "none" | "warn" | "suspend" = "none";
  if (reasons.length >= 3 || malwareCount > 0) {
    action = "suspend";
  } else if (reasons.length >= 1) {
    action = "warn";
  }

  return {
    suspicious: reasons.length > 0,
    reasons,
    action,
  };
}

// Suspend account
export async function suspendAccount(
  userId: string,
  reason: string,
  duration?: number // minutes, undefined = permanent
) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      suspended: true,
      suspendedUntil: duration
        ? new Date(Date.now() + duration * 60 * 1000)
        : null,
      suspensionReason: reason,
    },
  });

  // Log suspension
  await logSecurityEvent({
    type: "ACCOUNT_SUSPENDED",
    userId,
    reason,
    duration,
  });

  // Notify user
  await sendEmail({
    to: user.email,
    subject: "Account Suspended",
    body: `Your account has been suspended. Reason: ${reason}`,
  });
}
```

### IP Blocking

```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  const ip = request.ip || request.headers.get("x-forwarded-for");

  // Check if IP is blocked
  const isBlocked = await redis.get(`blocked-ip:${ip}`);
  if (isBlocked) {
    return new Response("Access denied", { status: 403 });
  }

  // Check rate limit
  const requests = await redis.incr(
    `rate-limit:${ip}:${(Date.now() / 60000) | 0}`
  );
  await redis.expire(`rate-limit:${ip}:${(Date.now() / 60000) | 0}`, 60);

  if (requests > 100) {
    // Block IP for 1 hour
    await redis.setex(`blocked-ip:${ip}`, 3600, "1");

    await logSecurityEvent({
      type: "IP_BLOCKED",
      ip,
      reason: "Rate limit exceeded",
    });

    return new Response("Too many requests", { status: 429 });
  }

  return NextResponse.next();
}
```

### CAPTCHA Integration

```typescript
// lib/security/captcha.ts
export async function verifyCaptcha(token: string): Promise<boolean> {
  const response = await fetch(
    "https://www.google.com/recaptcha/api/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`,
    }
  );

  const data = await response.json();
  return data.success && data.score > 0.5; // Adjust threshold
}

// In upload endpoint
export async function POST(request: Request) {
  const { captchaToken, ...uploadData } = await request.json();

  // Check for suspicious activity
  const suspicion = await checkAbusePatterns(session.user.id);

  if (suspicion.suspicious) {
    // Require CAPTCHA for suspicious users
    if (!captchaToken) {
      return Response.json(
        { error: "CAPTCHA required", requiresCaptcha: true },
        { status: 403 }
      );
    }

    const captchaValid = await verifyCaptcha(captchaToken);
    if (!captchaValid) {
      return Response.json({ error: "Invalid CAPTCHA" }, { status: 403 });
    }
  }

  // Proceed with upload...
}
```

### Upload Quota System

```typescript
// lib/security/quota.ts

export async function checkUploadQuota(userId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  resetsAt: Date;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  // Define quotas by role
  const quotas = {
    guest: 10 * 1024 * 1024, // 10 MB/day
    member: 1024 * 1024 * 1024, // 1 GB/day
    admin: 10 * 1024 * 1024 * 1024, // 10 GB/day
    owner: Infinity,
  };

  const limit = quotas[user.role];

  // Get today's uploads
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const used = await prisma.fileMetadata.aggregate({
    where: {
      document: { ownerId: userId },
      uploadedAt: { gte: today },
    },
    _sum: { fileSize: true },
  });

  const usedBytes = Number(used._sum.fileSize) || 0;

  // Calculate reset time (midnight)
  const resetsAt = new Date(today);
  resetsAt.setDate(resetsAt.getDate() + 1);

  return {
    allowed: usedBytes < limit,
    used: usedBytes,
    limit,
    resetsAt,
  };
}

// In upload endpoint
const quota = await checkUploadQuota(session.user.id);
if (!quota.allowed) {
  return Response.json(
    {
      error: "Upload quota exceeded",
      quota: {
        used: quota.used,
        limit: quota.limit,
        resetsAt: quota.resetsAt,
      },
    },
    { status: 429 }
  );
}
```

## ZIP Bomb Detection

```typescript
// lib/security/zip-bomb.ts

export async function detectZipBomb(
  fileBuffer: Buffer
): Promise<{ isBomb: boolean; reason?: string }> {
  try {
    const zip = new AdmZip(fileBuffer);
    const entries = zip.getEntries();

    let totalUncompressedSize = 0;
    const compressedSize = fileBuffer.length;

    for (const entry of entries) {
      totalUncompressedSize += entry.header.size;

      // Check for excessive compression ratio
      const ratio = entry.header.size / entry.header.compressedSize;
      if (ratio > 100) {
        return {
          isBomb: true,
          reason: `Excessive compression ratio: ${ratio}x`,
        };
      }

      // Check for deeply nested archives
      if (entry.entryName.split("/").length > 10) {
        return {
          isBomb: true,
          reason: "Deeply nested archive structure",
        };
      }
    }

    // Check overall compression ratio
    const overallRatio = totalUncompressedSize / compressedSize;
    if (overallRatio > 1000) {
      return {
        isBomb: true,
        reason: `Excessive overall ratio: ${overallRatio}x`,
      };
    }

    // Check for excessive uncompressed size
    if (totalUncompressedSize > 10 * 1024 * 1024 * 1024) {
      // 10GB
      return {
        isBomb: true,
        reason: "Uncompressed size exceeds 10GB",
      };
    }

    return { isBomb: false };
  } catch (error) {
    // If can't parse, reject to be safe
    return { isBomb: true, reason: "Invalid archive format" };
  }
}
```

## Security Monitoring Dashboard

```typescript
// app/admin/security/page.tsx

export default async function SecurityDashboard() {
  const stats = await getSecurityStats();

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Security Dashboard</h1>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard title="Blocked IPs" value={stats.blockedIPs} />
        <StatCard title="Suspended Accounts" value={stats.suspendedAccounts} />
        <StatCard title="Malware Detected" value={stats.malwareDetections} />
        <StatCard title="Failed Uploads" value={stats.failedUploads} />
      </div>

      <div className="grid grid-cols-2 gap-8">
        <SecurityEventLog events={stats.recentEvents} />
        <ThreatMap threats={stats.threatsByCountry} />
      </div>
    </div>
  );
}
```

## Next Steps

1. Review [Security Model](./05-security-model.md) for basic security
2. See [File Storage](./07-file-storage.md) for upload implementation
3. Check [Implementation Guide](./11-implementation-guide.md) for setup
4. Set up monitoring and alerting for security events
