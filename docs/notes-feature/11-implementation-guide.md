# Implementation Guide

**Version:** 1.0  
**Last Updated:** January 10, 2026

## Overview

This guide provides a phased approach to implementing the notes feature, from foundation to advanced functionality.

## Prerequisites

- Next.js 16+ application running
- PostgreSQL database configured
- Prisma ORM set up
- Existing authentication system
- Design system in place

## Phase 1: Foundation (Week 1-2)

### 1.1 Database Migration

```bash
# Create migration
npx prisma migrate dev --name add_notes_feature

# Generate Prisma client
npx prisma generate
```

**Files to create:**

- `prisma/migrations/XXX_add_notes_feature/migration.sql`

**Tasks:**

- ✅ Add FileMetadata table
- ✅ Add StorageProviderConfig table
- ✅ Add indexes
- ✅ Seed default storage configs

### 1.2 Install Dependencies

```bash
pnpm add allotment @tanstack/react-virtual zustand \
  novel @tiptap/react @tiptap/starter-kit \
  shiki @react-pdf-viewer/core pdfjs-dist
```

### 1.3 Create Base Layout

```typescript
// app/notes/layout.tsx
import { NotesLayout } from '@/components/content/NotesLayout';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <NotesLayout>{children}</NotesLayout>;
}
```

**Components to create:**

- `components/content/NotesLayout.tsx`
- `components/content/LeftSidebar.tsx`
- `components/content/MainPanel.tsx`
- `components/content/RightSidebar.tsx`
- `components/content/StatusBar.tsx`

### 1.4 State Management Setup

```typescript
// stores/panel-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const usePanelStore = create(
  persist(
    (set) => ({
      leftWidth: 300,
      rightWidth: 250,
      setLeftWidth: (width: number) => set({ leftWidth: width }),
      // ...
    }),
    { name: "notes-panel-layout" }
  )
);
```

**Stores to create:**

- `stores/panel-store.ts`
- `stores/tab-store.ts`
- `stores/file-tree-store.ts`

## Phase 2: File System (Week 3-4)

### 2.1 File Tree Component

```typescript
// components/content/FileTree.tsx
import { useVirtualizer } from '@tanstack/react-virtual';

export function FileTree() {
  const { data: nodes } = useFileTree();
  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 32,
  });

  return (
    // Virtualized tree rendering
  );
}
```

**Components to create:**

- `components/content/FileTree.tsx`
- `components/content/FileTreeNode.tsx`
- `components/content/FolderNode.tsx`

### 2.2 API Routes - Files

```typescript
// app/api/content/files/route.ts
export async function GET(req: Request) {
  const session = await requireAuth();
  const documents = await prisma.structuredDocument.findMany({
    where: { ownerId: session.user.id },
    include: { fileMetadata: true },
  });
  return Response.json({ success: true, data: documents });
}

export async function POST(req: Request) {
  const session = await requireAuth();
  const { title, parentId, tiptapJson, html, code, language, isFolder } =
    await req.json();

  // Create ContentNode
  const content = await prisma.contentNode.create({
    data: {
      ownerId: session.user.id,
      title,
      slug: generateSlug(title),
      parentId,
    },
  });

  // Create appropriate payload based on request
  if (tiptapJson) {
    await prisma.notePayload.create({
      data: {
        contentId: content.id,
        tiptapJson,
        searchText: extractPlainText(tiptapJson),
        metadata: computeMetadata(tiptapJson),
      },
    });
  } else if (html) {
    await prisma.htmlPayload.create({
      data: {
        contentId: content.id,
        html,
        searchText: extractPlainText(html),
      },
    });
  } else if (code) {
    await prisma.codePayload.create({
      data: {
        contentId: content.id,
        code,
        language: language || "plaintext",
        searchText: code,
      },
    });
  }
  // Note: Folders have no payload (type derived from children)

  return Response.json({ success: true, data: content });
}
```

**API routes to create:**

- `app/api/content/files/route.ts`
- `app/api/content/files/[id]/route.ts`
- `app/api/content/tree/route.ts`

## Phase 3: Content Editors (Week 5-6)

### 3.1 Markdown Editor (Novel/TipTap)

```typescript
// components/content/MarkdownEditor.tsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

export function MarkdownEditor({ content, onChange }: EditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
  });

  return <EditorContent editor={editor} className="prose" />;
}
```

**Components to create:**

- `components/content/MarkdownEditor.tsx`
- `components/content/CodeEditor.tsx`
- `components/content/PDFViewer.tsx`
- `components/content/ImageViewer.tsx`
- `components/content/VideoPlayer.tsx`

### 3.2 Tab Management

```typescript
// components/content/TabBar.tsx
export function TabBar() {
  const { tabs, activeTabId, openTab, closeTab } = useTabStore();

  return (
    <div className="flex border-b">
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onClick={() => openTab(tab.id)}
          onClose={() => closeTab(tab.id)}
        />
      ))}
    </div>
  );
}
```

**Components to create:**

- `components/content/TabBar.tsx`
- `components/content/Tab.tsx`

### 3.3 Content API

```typescript
// app/api/content/content/[id]/route.ts
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth();

  const document = await prisma.structuredDocument.findFirst({
    where: {
      id: params.id,
      ownerId: session.user.id,
    },
  });

  if (!document) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ success: true, data: document });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth();
  const { tiptapJson, html, code } = await req.json();

  const content = await prisma.contentNode.update({
    where: { id: params.id },
    data: {
      updatedAt: new Date(),
    },
  });

  // Update appropriate payload
  if (tiptapJson) {
    await prisma.notePayload.update({
      where: { contentId: params.id },
      data: {
        tiptapJson,
        searchText: extractPlainText(tiptapJson),
        metadata: computeMetadata(tiptapJson),
      },
    });
  } else if (html) {
    await prisma.htmlPayload.update({
      where: { contentId: params.id },
      data: {
        html,
        searchText: extractPlainText(html),
      },
    });
  } else if (code) {
    await prisma.codePayload.update({
      where: { contentId: params.id },
      data: {
        code,
        searchText: code,
      },
    });
  }

  // Create history entry
  await prisma.contentHistory.create({
    data: {
      contentId: params.id,
      revisionData: tiptapJson || html || code,
      editedById: session.user.id,
    },
  });

  return Response.json({ success: true, data: content });
}
```

**API routes to create:**

- `app/api/content/content/[id]/route.ts`

## Phase 3.5: Markdown File Upload (Week 6)

### 3.5.1 Markdown Conversion Utilities

```typescript
// lib/converters/markdown.ts
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/extension-markdown";

const extensions = [StarterKit, Markdown];

export function markdownToTiptap(markdown: string): object {
  const editor = new Editor({
    extensions,
    content: "", // Start empty
  });

  // Set markdown content (auto-converts to JSON)
  editor.commands.setContent(markdown);
  const json = editor.getJSON();

  editor.destroy();
  return json;
}

export function tiptapToMarkdown(tiptapJson: object): string {
  const editor = new Editor({
    extensions,
    content: tiptapJson,
  });

  const markdown = editor.storage.markdown.getMarkdown();
  editor.destroy();

  return markdown;
}
```

**Files to create:**

- `lib/converters/markdown.ts`

### 3.5.2 Update Upload Handler

```typescript
// app/api/content/content/route.ts
import { markdownToTiptap } from "@/lib/converters/markdown";

export async function POST(req: Request) {
  const session = await requireAuth();
  const { title, parentId, tiptapJson, markdown, html, code, language } =
    await req.json();

  // Create ContentNode
  const content = await prisma.contentNode.create({
    data: {
      ownerId: session.user.id,
      title,
      slug: generateSlug(title),
      parentId,
    },
  });

  // Handle markdown conversion
  let finalTiptapJson = tiptapJson;
  if (markdown && !tiptapJson) {
    finalTiptapJson = markdownToTiptap(markdown);
  }

  // Create appropriate payload
  if (finalTiptapJson) {
    await prisma.notePayload.create({
      data: {
        contentId: content.id,
        tiptapJson: finalTiptapJson,
        searchText: extractPlainText(finalTiptapJson),
        metadata: computeMetadata(finalTiptapJson),
      },
    });
  }
  // ... rest of payload creation

  return Response.json({ success: true, data: content });
}
```

### 3.5.3 Client-Side Upload Detection

```typescript
// components/content/FileUploader.tsx
async function handleFileUpload(file: File) {
  const mimeType = file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();

  // Check if markdown file
  if (mimeType === "text/markdown" || extension === "md") {
    const markdownContent = await file.text();

    // Upload as note
    await fetch("/api/content/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: file.name.replace(".md", ""),
        markdown: markdownContent,
      }),
    });
  } else {
    // Regular file upload (two-phase)
    await initiateFileUpload(file);
  }
}
```

**API routes to update:**

- `app/api/content/content/route.ts`

**Components to create:**

- Update `components/content/FileUploader.tsx`

## Phase 4: File Storage (Week 7-8)

### 4.1 Storage Providers

```typescript
// lib/storage/r2.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function getR2PresignedUrl(key: string, mimeType: string) {
  const command = new PutObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET!,
    Key: key,
    ContentType: mimeType,
  });

  return await getSignedUrl(r2Client, command, { expiresIn: 3600 });
}
```

**Files to create:**

- `lib/storage/r2.ts`
- `lib/storage/s3.ts`
- `lib/storage/vercel-blob.ts`
- `lib/storage/index.ts`

### 4.2 Upload API

```typescript
// app/api/content/content/upload/route.ts
// Phase 1: Initiate upload
export async function POST(req: Request) {
  const session = await requireAuth();
  const { fileName, mimeType, fileSize, checksum, storageProvider } =
    await req.json();

  // Validate
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return Response.json({ error: "Unsupported file type" }, { status: 400 });
  }

  // Create ContentNode
  const content = await prisma.contentNode.create({
    data: {
      ownerId: session.user.id,
      title: fileName,
      slug: generateSlug(fileName),
    },
  });

  // Create FilePayload with uploadStatus=uploading
  const storage = getStorageProvider(storageProvider || "r2");
  const key = `files/${session.user.id}/${content.id}/${fileName}`;

  await prisma.filePayload.create({
    data: {
      contentId: content.id,
      fileName,
      fileExtension: getFileExtension(fileName),
      mimeType,
      fileSize,
      checksum,
      storageProvider: storageProvider || "r2",
      storageKey: key,
      uploadStatus: "uploading", // CRITICAL: UI must check this
    },
  });

  // Generate presigned URL for direct upload
  const presignedUrl = await storage.getPresignedUploadUrl(key, mimeType);

  return Response.json({
    success: true,
    data: {
      contentId: content.id,
      presignedUrl,
      method: "PUT",
      headers: { "Content-Type": mimeType },
      expiresIn: 3600,
    },
  });
}
```

```typescript
// app/api/content/content/[id]/finalize/route.ts
// Phase 3: Finalize upload
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth();
  const { success, error } = await req.json();

  const filePayload = await prisma.filePayload.findUnique({
    where: { contentId: params.id },
  });

  if (!filePayload || filePayload.uploadStatus !== "uploading") {
    return Response.json({ error: "Invalid upload state" }, { status: 400 });
  }

  if (success) {
    // Mark as ready (UI can now download)
    await prisma.filePayload.update({
      where: { contentId: params.id },
      data: {
        uploadStatus: "ready",
        uploadedAt: new Date(),
      },
    });

    return Response.json({
      success: true,
      data: { uploadStatus: "ready" },
    });
  } else {
    // Mark as failed
    await prisma.filePayload.update({
      where: { contentId: params.id },
      data: {
        uploadStatus: "failed",
        uploadError: error,
      },
    });

    return Response.json({
      success: true,
      data: { uploadStatus: "failed", error },
    });
  }
}
```

**API routes to create:**

- `app/api/content/files/upload/route.ts`
- `app/api/content/files/upload/confirm/route.ts`

## Phase 5: Advanced Features (Week 9-10)

### 5.1 Command Palette

```typescript
// components/content/CommandPalette.tsx
import { Command, CommandInput, CommandList } from '@/components/ui/command';

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command..." />
      <CommandList>
        {/* Command items */}
      </CommandList>
    </CommandDialog>
  );
}
```

### 5.2 Search Functionality

```typescript
// app/api/content/search/route.ts
export async function GET(req: Request) {
  const session = await requireAuth();
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");

  const results = await prisma.$queryRaw`
    SELECT cn.*, 
      ts_rank(
        to_tsvector('english', COALESCE(np."searchText", hp."searchText", cp."searchText", cn.title)),
        plainto_tsquery('english', ${query})
      ) as rank
    FROM "ContentNode" cn
    LEFT JOIN "NotePayload" np ON cn.id = np."contentId"
    LEFT JOIN "HtmlPayload" hp ON cn.id = hp."contentId"
    LEFT JOIN "CodePayload" cp ON cn.id = cp."contentId"
    WHERE cn."ownerId" = ${session.user.id}::uuid
      AND cn."deletedAt" IS NULL
      AND (
        to_tsvector('english', cn.title) @@ plainto_tsquery('english', ${query})
        OR to_tsvector('english', COALESCE(np."searchText", hp."searchText", cp."searchText", '')) 
           @@ plainto_tsquery('english', ${query})
      )
    ORDER BY rank DESC
    LIMIT 20
  `;

  return Response.json({ success: true, data: results });
}
```

### 5.3 Backlinks

```typescript
// app/api/content/backlinks/[id]/route.ts
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const backlinks = await prisma.documentLink.findMany({
    where: { targetId: params.id },
    include: {
      source: {
        select: { id: true, title: true },
        include: {
          notePayload: true,
          filePayload: true,
          htmlPayload: true,
          codePayload: true,
        },
      },
    },
  });

  return Response.json({ success: true, data: backlinks });
}
```

## Phase 6: Polish & Testing (Week 11-12)

### 6.1 Error Boundaries

```typescript
// components/content/ErrorBoundary.tsx
export class NotesErrorBoundary extends React.Component {
  componentDidCatch(error: Error) {
    logError(error);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
```

### 6.2 Loading States

```typescript
// components/content/EditorSkeleton.tsx
export function EditorSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-gray-200 rounded mb-4 w-1/3" />
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-5/6" />
      </div>
    </div>
  );
}
```

### 6.3 E2E Tests

```typescript
// e2e/notes.spec.ts
test("create and edit note", async ({ page }) => {
  await page.goto("/notes");
  await page.click('[data-testid="new-note"]');
  await page.fill('input[name="title"]', "Test Note");
  await page.click(".ProseMirror");
  await page.keyboard.type("Content");
  await page.waitForSelector('[data-status="saved"]');
  expect(await page.locator("text=Test Note").count()).toBe(1);
});
```

## Deployment Checklist

- [ ] Run database migrations in production
- [ ] Set environment variables for storage providers
- [ ] Configure CDN for file delivery
- [ ] Set up monitoring (Sentry, DataDog)
- [ ] Enable rate limiting
- [ ] Configure CSP headers
- [ ] Run security audit
- [ ] Perform load testing
- [ ] Update documentation
- [ ] Train users (if applicable)

## Rollback Plan

If issues arise:

1. **Disable feature flag** (if implemented)
2. **Revert database migration** (if safe)
3. **Restore from backup** (if data corrupted)
4. **Monitor error logs** for root cause

## Post-Launch

### Week 1

- Monitor error rates
- Track performance metrics
- Gather user feedback
- Fix critical bugs

### Week 2-4

- Optimize slow queries
- Improve UX based on feedback
- Add missing features
- Write user guides

## Error Logging Setup

### Option 1: Sentry Integration

```bash
npm install @sentry/nextjs
```

```typescript
// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,

  // Ignore common errors
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "Non-Error promise rejection captured",
  ],

  // Capture user context
  beforeSend(event, hint) {
    // Add user context
    if (event.user) {
      event.user = {
        id: event.user.id,
        email: event.user.email,
        // Don't send sensitive data
      };
    }
    return event;
  },
});
```

```typescript
// sentry.server.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,

  // Server-specific config
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Prisma({ client: prisma }),
  ],
});
```

### Option 2: Custom Logger

```typescript
// lib/logger.ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      ignore: "pid,hostname",
      translateTime: "SYS:standard",
    },
  },
});

// Usage in API routes
export async function POST(request: Request) {
  try {
    // ... your code
    logger.info({ contentId }, "Content created");
  } catch (error) {
    logger.error({ error, url: request.url }, "Failed to create content");
    throw error;
  }
}
```

### Error Boundaries

```typescript
// components/ErrorBoundary.tsx
'use client';

import { Component, ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to Sentry
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Something went wrong</h2>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 bg-blue-500 text-white rounded"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Usage
<ErrorBoundary fallback={<ErrorFallback />}>
  <NotesApp />
</ErrorBoundary>
```

## Performance Monitoring Setup

### Vercel Analytics

```bash
npm install @vercel/analytics
```

```typescript
// app/layout.tsx
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
```

### Custom Performance Tracking

```typescript
// lib/performance.ts
export function measurePerformance(name: string, fn: () => Promise<any>) {
  return async (...args: any[]) => {
    const start = performance.now();

    try {
      const result = await fn(...args);
      const duration = performance.now() - start;

      // Log slow operations
      if (duration > 1000) {
        console.warn(`Slow operation: ${name} took ${duration}ms`);
      }

      // Send to analytics
      analytics.track("performance", {
        operation: name,
        duration,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      const duration = performance.now() - start;
      analytics.track("performance_error", {
        operation: name,
        duration,
        error: error.message,
      });
      throw error;
    }
  };
}

// Usage
export const getFileTree = measurePerformance("getFileTree", async () => {
  // ... implementation
});
```

### Web Vitals Tracking

```typescript
// app/web-vitals.ts
'use client';

import { useReportWebVitals } from 'next/web-vitals';

export function WebVitals() {
  useReportWebVitals((metric) => {
    // Send to analytics
    analytics.track('web_vital', {
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      id: metric.id,
    });

    // Log poor metrics
    if (metric.rating === 'poor') {
      console.warn(`Poor ${metric.name}:`, metric.value);
    }
  });

  return null;
}

// In layout
<WebVitals />
```

### API Response Time Tracking

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const start = Date.now();
  const response = NextResponse.next();

  response.headers.set("X-Response-Time", `${Date.now() - start}ms`);

  // Track API performance
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const duration = Date.now() - start;

    analytics.track("api_performance", {
      path: request.nextUrl.pathname,
      method: request.method,
      duration,
      status: response.status,
    });

    // Alert on slow APIs
    if (duration > 2000) {
      logger.warn(
        {
          path: request.nextUrl.pathname,
          duration,
        },
        "Slow API response"
      );
    }
  }

  return response;
}
```

### Database Query Performance

```typescript
// lib/db/prisma.ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  log: [
    { level: "query", emit: "event" },
    { level: "error", emit: "stdout" },
    { level: "warn", emit: "stdout" },
  ],
});

// Log slow queries
prisma.$on("query", (e) => {
  if (e.duration > 1000) {
    logger.warn(
      {
        query: e.query,
        duration: e.duration,
        params: e.params,
      },
      "Slow database query"
    );

    // Send to monitoring
    analytics.track("slow_query", {
      query: e.query,
      duration: e.duration,
    });
  }
});
```

## Next Steps

1. Review [Architecture](./01-architecture.md) for system overview
2. Check [Technology Stack](./02-technology-stack.md) for library decisions
3. See [Database Design](./03-database-design.md) for schema details
4. Follow this guide phase by phase
5. Run tests from [Testing Strategy](./12-testing-strategy.md)
6. Optimize using [Performance](./13-performance.md) guide
