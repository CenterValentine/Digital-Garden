# Runtime and Caching Strategy

**Version:** 1.0  
**Last Updated:** January 12, 2026

## Overview

This document outlines the runtime selection strategy for API routes, streaming responses, and comprehensive caching strategies for optimal performance.

## Next.js Route Handlers: Edge vs Node Runtime

### Runtime Selection Matrix

| Route Type                  | Runtime  | Rationale                             |
| --------------------------- | -------- | ------------------------------------- |
| `/api/notes/files` (GET)    | **Edge** | Fast JSON responses, no DB writes     |
| `/api/notes/files` (POST)   | **Node** | Database writes, complex logic        |
| `/api/notes/files/upload`   | **Node** | Presigned URL generation, crypto      |
| `/api/notes/content/[id]`   | **Edge** | Read-heavy, fast delivery             |
| `/api/notes/tree`           | **Edge** | Cached tree data, global distribution |
| `/api/notes/search`         | **Node** | Database queries, full-text search    |
| `/api/notes/backlinks/[id]` | **Edge** | Read-only, cacheable                  |

### Edge Runtime Configuration

```typescript
// app/api/notes/files/route.ts
export const runtime = "edge";
export const preferredRegion = "auto"; // Deploy to all regions

export async function GET(request: Request) {
  // Edge-compatible code only
  // No Node.js APIs (fs, crypto.randomBytes, etc.)

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  // Use Edge-compatible Prisma or fetch from origin
  const response = await fetch(
    `${process.env.API_ORIGIN}/internal/files?type=${type}`
  );
  const data = await response.json();

  return Response.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
```

### Node Runtime Configuration

```typescript
// app/api/notes/files/upload/route.ts
export const runtime = "nodejs";
export const maxDuration = 60; // 60 seconds max

import { S3Client } from "@aws-sdk/client-s3"; // Node-only package

export async function POST(request: Request) {
  const body = await request.json();

  // Node.js-specific operations
  const presignedUrl = await generatePresignedUrl(body);

  return Response.json({ success: true, data: presignedUrl });
}
```

## Streaming Responses

### When to Use Streaming

- ✅ Large file downloads
- ✅ Real-time search results
- ✅ Long-running operations with progress
- ✅ Server-Sent Events (SSE) for live updates

### Streaming Implementation

```typescript
// app/api/notes/export/route.ts
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");

  // Create a ReadableStream
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Stream large dataset in chunks
        const documents = await prisma.structuredDocument.findMany({
          where: { ownerId: userId },
        });

        for (const doc of documents) {
          const chunk = JSON.stringify(doc) + "\n";
          controller.enqueue(new TextEncoder().encode(chunk));

          // Allow other operations to proceed
          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
    },
  });
}
```

### Server-Sent Events for Real-Time Updates

```typescript
// app/api/notes/live-updates/route.ts
export const runtime = "nodejs";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Subscribe to document changes
      const subscription = subscribeToChanges(userId, (change) => {
        const data = `data: ${JSON.stringify(change)}\n\n`;
        controller.enqueue(encoder.encode(data));
      });

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        subscription.unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

## Body Size Limits

### Configuration

```typescript
// next.config.ts
export default {
  api: {
    bodyParser: {
      sizeLimit: "10mb", // Default for API routes
    },
  },

  // Per-route configuration
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};
```

### Custom Body Size Limits

```typescript
// app/api/notes/files/upload/route.ts
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "100mb", // Larger for file uploads
    },
  },
};

export async function POST(request: Request) {
  // Handle large file metadata
  const formData = await request.formData();
  const file = formData.get("file") as File;

  if (file.size > 100 * 1024 * 1024) {
    return Response.json({ error: "File too large" }, { status: 413 });
  }

  // Process upload...
}
```

## Server Actions vs API Routes

### Why API-Heavy Approach?

**Decision:** Use API routes for all data operations (not Server Actions)

**Rationale:**

1. **Client-side flexibility** - Can be called from any client (web, mobile, CLI)
2. **Rate limiting** - Easier to implement per-endpoint rate limits
3. **Monitoring** - Better observability with API-specific metrics
4. **Caching** - Standard HTTP caching works out of the box
5. **Testing** - Simpler to test with standard HTTP clients
6. **Documentation** - OpenAPI/Swagger generation possible

### When to Use Server Actions

Use Server Actions **only** for:

- Form submissions with progressive enhancement
- Simple mutations that don't need client-side calls
- Operations that benefit from direct server component integration

```typescript
// Example: Rare Server Action use case
"use server";

export async function updateDocumentTitle(formData: FormData) {
  const session = await requireAuth();
  const id = formData.get("id") as string;
  const title = formData.get("title") as string;

  await prisma.structuredDocument.update({
    where: { id },
    data: { title },
  });

  revalidatePath("/notes");
}
```

### Consistency Guidelines

| Operation        | Approach                  | Example                   |
| ---------------- | ------------------------- | ------------------------- |
| CRUD operations  | API Routes                | `/api/notes/files`        |
| Search/filtering | API Routes                | `/api/notes/search`       |
| Form submissions | API Routes (preferred)    | POST to API               |
| File uploads     | API Routes                | `/api/notes/files/upload` |
| Simple mutations | Server Actions (optional) | updateDocumentTitle       |

## Next.js Caching Strategy

### Multi-Layer Caching Architecture

```
┌─────────────────────────────────────────┐
│  Client (React Query 5min stale)       │
├─────────────────────────────────────────┤
│  Edge Cache (CDN, 60s)                  │
├─────────────────────────────────────────┤
│  Next.js Data Cache (revalidate)       │
├─────────────────────────────────────────┤
│  Database Query Cache (Prisma)          │
└─────────────────────────────────────────┘
```

### Route Segment Caching

```typescript
// app/notes/[id]/page.tsx
export const revalidate = 300; // 5 minutes
export const dynamic = "force-static";

export async function generateStaticParams() {
  // Pre-render top 100 most viewed documents
  const documents = await prisma.structuredDocument.findMany({
    take: 100,
    orderBy: { views: "desc" },
  });

  return documents.map((doc) => ({
    id: doc.id,
  }));
}
```

### React Query Integration

```typescript
// hooks/useFileTree.ts
import { useQuery } from "@tanstack/react-query";

export function useFileTree() {
  return useQuery({
    queryKey: ["file-tree"],
    queryFn: fetchFileTree,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

// When document changes, invalidate cache
export function useUpdateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateDocument,
    onSuccess: () => {
      // Invalidate file tree cache
      queryClient.invalidateQueries({ queryKey: ["file-tree"] });

      // Also invalidate Next.js cache
      fetch("/api/revalidate?path=/notes").then(() => {
        console.log("Cache revalidated");
      });
    },
  });
}
```

### Cache Invalidation Events

```typescript
// lib/cache/invalidation.ts

export type CacheEvent =
  | "document.created"
  | "document.updated"
  | "document.deleted"
  | "document.moved"
  | "file.uploaded";

export async function invalidateCache(event: CacheEvent, contentId: string) {
  // 1. Invalidate React Query cache (client-side)
  if (typeof window !== "undefined") {
    queryClient.invalidateQueries({
      queryKey: ["document", contentId],
    });
  }

  // 2. Invalidate Next.js cache (server-side)
  await fetch("/api/revalidate", {
    method: "POST",
    body: JSON.stringify({
      tags: [`document-${contentId}`, "file-tree"],
    }),
  });

  // 3. Broadcast to other tabs
  const channel = new BroadcastChannel("cache-invalidation");
  channel.postMessage({ event, contentId });
}
```

### On-Demand Revalidation API

```typescript
// app/api/revalidate/route.ts
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireAuth();
  const { path, tags } = await request.json();

  try {
    if (path) {
      // Revalidate specific path
      revalidatePath(path);
    }

    if (tags) {
      // Revalidate by tag
      for (const tag of tags) {
        revalidateTag(tag);
      }
    }

    return Response.json({ revalidated: true, now: Date.now() });
  } catch (error) {
    return Response.json({ error: "Revalidation failed" }, { status: 500 });
  }
}
```

### Cache Tags Strategy

```typescript
// app/api/notes/files/[id]/route.ts
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const document = await prisma.structuredDocument.findUnique({
    where: { id: params.id },
    // Tag this query for cache invalidation
    cacheStrategy: {
      tags: [`document-${params.id}`, "documents"],
      ttl: 300, // 5 minutes
    },
  });

  return Response.json(document, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      "Cache-Tag": `document-${params.id}`,
    },
  });
}
```

### ISR (Incremental Static Regeneration)

```typescript
// app/notes/public/[slug]/page.tsx

// Regenerate page every 60 seconds
export const revalidate = 60;

export async function generateStaticParams() {
  // Only pre-render public documents
  const publicDocs = await prisma.structuredDocument.findMany({
    where: { isPublished: true },
    select: { slug: true },
  });

  return publicDocs.map((doc) => ({
    slug: doc.slug,
  }));
}

export default async function PublicNotePage({ params }: { params: { slug: string } }) {
  // This will be cached and revalidated every 60s
  const document = await prisma.structuredDocument.findUnique({
    where: { slug: params.slug, isPublished: true },
  });

  if (!document) notFound();

  return <DocumentViewer document={document} />;
}
```

### Cache Warming Strategy

```typescript
// lib/cache/warming.ts

export async function warmCache() {
  // Warm frequently accessed data
  const topDocuments = await prisma.structuredDocument.findMany({
    take: 50,
    orderBy: { views: "desc" },
  });

  // Pre-fetch and cache
  await Promise.all(
    topDocuments.map(async (doc) => {
      await fetch(`${process.env.APP_URL}/api/notes/files/${doc.id}`);
    })
  );
}

// Run on deployment
if (process.env.NODE_ENV === "production") {
  warmCache().then(() => console.log("Cache warmed"));
}
```

## CDN Caching

### Vercel Edge Network

```typescript
// Utilize Vercel's global CDN
export async function GET(request: Request) {
  const data = await getPublicData();

  return Response.json(data, {
    headers: {
      // Cache at CDN for 1 hour
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",

      // Vary by user for personalized content
      Vary: "Cookie",
    },
  });
}
```

### Cache Control Headers Reference

| Header                       | Use Case                      | Example          |
| ---------------------------- | ----------------------------- | ---------------- |
| `public, s-maxage=60`        | Public data, CDN cache        | File tree        |
| `private, max-age=300`       | User-specific, browser cache  | User settings    |
| `no-store`                   | Never cache                   | Real-time data   |
| `stale-while-revalidate=120` | Serve stale, revalidate async | Document content |

## Performance Monitoring

### Cache Hit Rates

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const start = Date.now();
  const response = NextResponse.next();

  response.headers.set("X-Response-Time", `${Date.now() - start}ms`);

  // Log cache hits/misses
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const cacheStatus = response.headers.get("X-Vercel-Cache");

    analytics.track("api_request", {
      path: request.nextUrl.pathname,
      cacheStatus, // HIT, MISS, STALE, etc.
      responseTime: Date.now() - start,
    });
  }

  return response;
}
```

## Next Steps

1. Review [Performance](./13-performance.md) for client-side caching
2. See [API Specification](./04-api-specification.md) for endpoint details
3. Check [Implementation Guide](./11-implementation-guide.md) for setup
