# Security Model

**Version:** 1.0  
**Last Updated:** January 10, 2026

## Authentication

Uses existing session-based authentication from `lib/auth/middleware.ts`.

### Session Management

- HTTP-only cookies
- 7-day expiration
- Automatic renewal on activity
- Secure flag in production

## Authorization

### Role Hierarchy

```
owner (level 3)
  ↓ can do everything admins can, plus:
  - Delete any content
  - Manage storage providers
  - Access all settings

admin (level 2)
  ↓ can do everything members can, plus:
  - View all user content (with permission)
  - Edit shared documents
  - Manage categories

member (level 1)
  ↓ can do everything guests can, plus:
  - Create documents
  - Upload files
  - Edit own content

guest (level 0)
  - View public documents only
  - No write access
```

### Permission Checks

```typescript
// In API routes
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireRole("admin"); // Only admin+ can delete

  const document = await prisma.structuredDocument.findUnique({
    where: { id: params.id },
  });

  if (document.ownerId !== session.user.id && session.user.role !== "owner") {
    throw new Error("FORBIDDEN");
  }

  // Proceed with deletion
}
```

## Row-Level Security

### Database Queries

```typescript
// Users can only query their own documents
const documents = await prisma.structuredDocument.findMany({
  where: {
    ownerId: session.user.id,
    // OR documents granted to them via ViewGrant
    OR: [{ viewGrants: { some: { userId: session.user.id } } }],
  },
});
```

### Document Access Matrix

| User Role | Own Documents | Others' Private | Others' Public | Admin-Only |
| --------- | ------------- | --------------- | -------------- | ---------- |
| guest     | ❌            | ❌              | ✅             | ❌         |
| member    | ✅ CRUD       | ❌              | ✅ Read        | ❌         |
| admin     | ✅ CRUD       | ✅ Read\*       | ✅ CRUD        | ✅ Read    |
| owner     | ✅ CRUD       | ✅ CRUD         | ✅ CRUD        | ✅ CRUD    |

\* With ViewGrant

## File Upload Security

### Validation Pipeline

```typescript
async function validateUpload(file: File): Promise<ValidationResult> {
  // 1. MIME type check
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  }

  // 2. File size check
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("FILE_TOO_LARGE");
  }

  // 3. Extension check (prevent bypass via MIME)
  const ext = getExtension(file.name);
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    throw new Error("DANGEROUS_FILE_TYPE");
  }

  // 4. Magic bytes check (verify actual file type)
  const buffer = await file.arrayBuffer();
  const actualType = await detectFileType(buffer);
  if (actualType !== file.type) {
    throw new Error("FILE_TYPE_MISMATCH");
  }

  return { valid: true };
}
```

### Allowed MIME Types

```typescript
const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",

  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  // Text
  "text/plain",
  "text/markdown",
  "text/csv",

  // Code
  "application/javascript",
  "application/json",
  "text/html",

  // Archives
  "application/zip",
  "application/x-tar",
  "application/gzip",

  // Media
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
```

### Dangerous Extensions Blacklist

```typescript
const DANGEROUS_EXTENSIONS = [
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".pif",
  ".scr",
  ".vbs",
  ".js",
];
```

## XSS Prevention

### Content Sanitization

```typescript
import DOMPurify from "isomorphic-dompurify";

// Sanitize user HTML before rendering
function sanitizeHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "b", "i", "em", "strong", "a", "ul", "ol", "li"],
    ALLOWED_ATTR: ["href", "title"],
  });
}

// For markdown, use TipTap's built-in sanitization
const editor = useEditor({
  extensions: [StarterKit],
  // TipTap automatically escapes user input
});
```

### SVG XSS Prevention

```typescript
// SVG sanitization to prevent JavaScript injection
function sanitizeSVG(svgString: string): string {
  return DOMPurify.sanitize(svgString, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
    // Remove dangerous elements
    FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'object', 'embed'],
    // Remove event handlers
    FORBID_ATTR: [
      'onerror', 'onload', 'onclick', 'onmouseover',
      'onmouseout', 'onmousemove', 'onmousedown', 'onmouseup',
      'onfocus', 'onblur', 'onchange', 'onsubmit',
    ],
  });
}

// Safe SVG component
export function SafeSVGImage({ src }: { src: string }) {
  const [sanitized, setSanitized] = useState('');

  useEffect(() => {
    fetch(src)
      .then(res => res.text())
      .then(svg => setSanitized(sanitizeSVG(svg)));
  }, [src]);

  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

### Iframe Sandboxing

```typescript
// Secure iframe for embedding user content
export function SecureIframe({ src, title }: IframeProps) {
  return (
    <iframe
      src={src}
      title={title}
      sandbox="allow-scripts allow-same-origin"
      // Restrictive attributes:
      // - allow-scripts: Required for PDF viewers, etc.
      // - allow-same-origin: Required for some viewers
      // - NO allow-forms, allow-popups, allow-top-navigation
      style={{
        width: '100%',
        height: '600px',
        border: '1px solid #ddd',
      }}
      // Security headers
      referrerPolicy="no-referrer"
      loading="lazy"
    />
  );
}

// For maximum security, serve from separate domain
export function IsolatedIframe({ contentId }: { contentId: string }) {
  // Use separate subdomain for user content
  const isolatedUrl = `https://usercontent.yourdomain.com/${contentId}`;

  return (
    <iframe
      src={isolatedUrl}
      sandbox="allow-scripts"
      // NO allow-same-origin = complete isolation
      style={{ width: '100%', height: '600px' }}
    />
  );
}
```

### Code Block XSS Prevention

```typescript
// Server-side code rendering with Shiki (safe by default)
import { codeToHtml } from 'shiki';

export async function renderCodeBlock(code: string, language: string) {
  // Shiki escapes all user input automatically
  const html = await codeToHtml(code, {
    lang: language,
    theme: 'github-dark',
  });

  // Safe to render - no JavaScript execution possible
  return html;
}

// Client-side code rendering (requires escaping)
export function ClientCodeBlock({ code, language }: CodeBlockProps) {
  // ALWAYS escape user code before rendering
  const escapedCode = escapeHtml(code);

  return (
    <pre className={`language-${language}`}>
      <code>{escapedCode}</code>
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
    '/': '&#x2F;',
  };
  return text.replace(/[&<>"'/]/g, m => map[m]);
}
```

### HTML Blocks in Markdown

```typescript
// Configure TipTap to disallow raw HTML
import StarterKit from "@tiptap/starter-kit";

export const secureEditorExtensions = [
  StarterKit.configure({
    // Disable raw HTML in markdown
    html: false,
  }),
];

// If HTML is needed, use sanitized custom extension
import { Node } from "@tiptap/core";

const SafeHTML = Node.create({
  name: "safeHtml",

  parseHTML() {
    return [{ tag: "div[data-safe-html]" }];
  },

  renderHTML({ node }) {
    const sanitized = DOMPurify.sanitize(node.attrs.content, {
      ALLOWED_TAGS: ["p", "br", "strong", "em", "a"],
      ALLOWED_ATTR: ["href"],
    });

    return ["div", { "data-safe-html": "" }, sanitized];
  },
});
```

### CSP Headers

```typescript
// next.config.ts
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https:;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`;

export const config = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader.replace(/\n/g, ""),
          },
        ],
      },
    ];
  },
};
```

## Storage Security

### Presigned URLs

- 1-hour expiration
- Single-use (tracked in database)
- IP-bound (optional, for sensitive files)

```typescript
async function generatePresignedURL(contentId: string, userId: string) {
  // Verify ownership
  const doc = await prisma.structuredDocument.findFirst({
    where: { id: contentId, ownerId: userId },
  });

  if (!doc) throw new Error("NOT_FOUND");

  // Generate presigned URL
  const url = await storageProvider.getPresignedUploadUrl({
    key: `files/${userId}/${contentId}`,
    expiresIn: 3600,
    conditions: [["content-length-range", 0, MAX_FILE_SIZE]],
  });

  // Store URL record for tracking
  await redis.set(`presigned:${contentId}`, url, "EX", 3600);

  return url;
}
```

### Encryption at Rest

All storage providers encrypt data at rest by default:

- **R2:** AES-256
- **S3:** SSE-S3 or SSE-KMS
- **Vercel Blob:** AES-256

### Access Control

```typescript
// Storage bucket policy (R2/S3)
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::bucket/*",
    "Condition": {
      "StringNotEquals": {
        "s3:x-amz-server-side-encryption": "AES256"
      }
    }
  }]
}
```

## Audit Logging

### Logged Events

```typescript
enum AuditEvent {
  DOCUMENT_CREATED = "document.created",
  DOCUMENT_UPDATED = "document.updated",
  DOCUMENT_DELETED = "document.deleted",
  FILE_UPLOADED = "file.uploaded",
  FILE_DOWNLOADED = "file.downloaded",
  PERMISSION_GRANTED = "permission.granted",
  PERMISSION_REVOKED = "permission.revoked",
  STORAGE_CONFIG_CHANGED = "storage.config_changed",
}

async function logAuditEvent(event: AuditEvent, data: any) {
  await prisma.auditLog.create({
    data: {
      event,
      userId: session.user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      data: JSON.stringify(data),
      timestamp: new Date(),
    },
  });
}
```

## CSRF Protection

Next.js automatically provides CSRF protection via:

- SameSite cookies
- Origin header validation
- Custom headers requirement for API calls

## Rate Limiting

See [API Specification](./04-api-specification.md) for rate limits.

## Compliance

- **GDPR:** Data export, right to deletion
- **CCPA:** Data access, opt-out
- **SOC 2:** Audit logging, access controls

## Virus Scanning

All uploaded files should be scanned for malware before storage. See [Advanced Security](./16-advanced-security.md) for comprehensive implementation details including:

- ClamAV integration (self-hosted)
- VirusTotal API (cloud-based)
- AWS S3 Malware Protection
- Office document macro detection
- Integration patterns in upload flow

**Quick Example:**

```typescript
// In upload confirmation endpoint
const scanResult = await scanFileWithVirusTotal(fileBuffer, filename);

if (!scanResult.clean) {
  // Delete file and log security event
  await deleteFromStorage(storageKey);
  await logSecurityEvent({
    type: "MALWARE_DETECTED",
    userId: session.user.id,
    threat: scanResult.vendors.join(", "),
  });

  return Response.json({ error: "Malware detected" }, { status: 400 });
}
```

## Next Steps

1. Review [File Storage](./07-file-storage.md) for storage security details
2. See [API Specification](./04-api-specification.md) for authentication headers
3. Check [Implementation Guide](./11-implementation-guide.md) for security setup
4. Read [Advanced Security](./16-advanced-security.md) for virus scanning, sandboxing, and abuse controls
