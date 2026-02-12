# Performance Optimization

**Version:** 1.0  
**Last Updated:** January 10, 2026

## Code Splitting

### Route-Level Splitting

```typescript
// app/notes/layout.tsx
const MarkdownEditor = lazy(() => import('@/components/content/MarkdownEditor'));
const PDFViewer = lazy(() => import('@/components/content/PDFViewer'));
const VideoPlayer = lazy(() => import('@/components/content/VideoPlayer'));

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      {children}
    </Suspense>
  );
}
```

### Component-Level Splitting

```typescript
// Load heavy components only when needed
const CodeEditor = lazy(() => import('@monaco-editor/react'));

function EditorPane({ type, content }: EditorPaneProps) {
  if (type === 'code') {
    return (
      <Suspense fallback={<EditorSkeleton />}>
        <CodeEditor value={content} />
      </Suspense>
    );
  }
  // Other types...
}
```

## Virtualization

### File Tree (10,000+ items)

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

export function FileTree({ nodes }: { nodes: TreeNode[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 10, // Render 10 extra items above/below viewport
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <TreeNode
            key={nodes[virtualItem.index].id}
            node={nodes[virtualItem.index]}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

## Caching Strategies

### React Query for API Data

```typescript
import { useQuery } from "@tanstack/react-query";

export function useFileTree() {
  return useQuery({
    queryKey: ["file-tree"],
    queryFn: fetchFileTree,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });
}
```

### SWR for Real-Time Updates

```typescript
import useSWR from "swr";

export function useDocument(id: string) {
  return useSWR(`/api/content/content/${id}`, fetcher, {
    refreshInterval: 30000, // Refresh every 30s
    revalidateOnFocus: true,
    dedupingInterval: 2000,
  });
}
```

### IndexedDB for Offline Cache

```typescript
import { openDB } from "idb";

const db = await openDB("notes-cache", 1, {
  upgrade(db) {
    db.createObjectStore("documents");
    db.createObjectStore("file-metadata");
  },
});

// Cache document locally
await db.put("documents", document, contentId);

// Retrieve from cache
const cachedDoc = await db.get("documents", contentId);
```

## Image Optimization

### Next.js Image Component

```typescript
import Image from 'next/image';

export function ImageViewer({ src }: { src: string }) {
  return (
    <Image
      src={src}
      alt="Image"
      width={1920}
      height={1080}
      placeholder="blur"
      blurDataURL={thumbnailDataUrl}
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
    />
  );
}
```

### Lazy Loading Images

```typescript
export function Gallery({ images }: { images: string[] }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {images.map((src, i) => (
        <Image
          key={src}
          src={src}
          alt={`Image ${i}`}
          loading="lazy"
          width={400}
          height={400}
        />
      ))}
    </div>
  );
}
```

## Bundle Size Optimization

### Tree Shaking

```typescript
// Import only what you need
import { FileText, Folder } from "lucide-react"; // ✅ Good
// import * as Icons from 'lucide-react'; // ❌ Bad
```

### Dynamic Imports

```typescript
// Load heavy libraries only when needed
async function exportToPDF() {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  // Generate PDF...
}
```

## Database Query Optimization

### Efficient Joins

```typescript
// Bad: N+1 query problem
const documents = await prisma.structuredDocument.findMany();
for (const doc of documents) {
  const metadata = await prisma.fileMetadata.findUnique({
    where: { contentId: doc.id },
  });
}

// Good: Single query with join
const documents = await prisma.structuredDocument.findMany({
  include: {
    fileMetadata: true,
  },
});
```

### Pagination

```typescript
// Use cursor-based pagination for large datasets
const documents = await prisma.structuredDocument.findMany({
  take: 50,
  skip: 1,
  cursor: {
    id: lastDocumentId,
  },
  orderBy: {
    updatedAt: "desc",
  },
});
```

## Monitoring

### Performance Metrics

```typescript
// Track Core Web Vitals
export function reportWebVitals(metric: NextWebVitalsMetric) {
  console.log(metric);

  // Send to analytics
  if (metric.label === "web-vital") {
    analytics.track("Web Vital", {
      name: metric.name,
      value: metric.value,
    });
  }
}
```

### Bundle Analyzer

```bash
# Analyze bundle size
pnpm build
pnpm analyze
```

## Performance Budget

| Metric                   | Target  | Max   |
| ------------------------ | ------- | ----- |
| First Contentful Paint   | < 1.5s  | 2s    |
| Largest Contentful Paint | < 2.5s  | 4s    |
| Time to Interactive      | < 3.5s  | 5s    |
| Total Bundle Size        | < 500KB | 750KB |
| Initial JS Bundle        | < 200KB | 300KB |

## Memory Monitoring and Leak Detection

### Client-Side Memory Monitoring

```typescript
// lib/performance/memory-monitor.ts
export class MemoryMonitor {
  private measurements: MemoryMeasurement[] = [];
  private interval: NodeJS.Timeout | null = null;

  start(intervalMs = 30000) {
    if (typeof window === "undefined") return;
    if (!("memory" in performance)) {
      console.warn("Memory API not available");
      return;
    }

    this.interval = setInterval(() => {
      const memory = (performance as any).memory;

      const measurement = {
        timestamp: Date.now(),
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      };

      this.measurements.push(measurement);

      // Keep last 100 measurements
      if (this.measurements.length > 100) {
        this.measurements.shift();
      }

      // Detect potential memory leak
      if (this.detectLeak()) {
        console.warn("Potential memory leak detected");
        this.reportLeak();
      }
    }, intervalMs);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private detectLeak(): boolean {
    if (this.measurements.length < 10) return false;

    // Check if memory is consistently growing
    const recent = this.measurements.slice(-10);
    const older = this.measurements.slice(-20, -10);

    const recentAvg =
      recent.reduce((sum, m) => sum + m.usedJSHeapSize, 0) / recent.length;
    const olderAvg =
      older.reduce((sum, m) => sum + m.usedJSHeapSize, 0) / older.length;

    // If recent average is 20% higher than older average
    return recentAvg > olderAvg * 1.2;
  }

  private reportLeak() {
    const latest = this.measurements[this.measurements.length - 1];

    analytics.track("memory_leak_detected", {
      usedJSHeapSize: latest.usedJSHeapSize,
      totalJSHeapSize: latest.totalJSHeapSize,
      measurements: this.measurements.slice(-10),
    });
  }

  getStats() {
    if (this.measurements.length === 0) return null;

    const latest = this.measurements[this.measurements.length - 1];
    const usedMB = Math.round(latest.usedJSHeapSize / 1024 / 1024);
    const totalMB = Math.round(latest.totalJSHeapSize / 1024 / 1024);
    const limitMB = Math.round(latest.jsHeapSizeLimit / 1024 / 1024);

    return {
      usedMB,
      totalMB,
      limitMB,
      usagePercent: Math.round(
        (latest.usedJSHeapSize / latest.jsHeapSizeLimit) * 100
      ),
    };
  }
}

// Initialize in app
const memoryMonitor = new MemoryMonitor();

if (process.env.NODE_ENV === "development") {
  memoryMonitor.start(30000); // Every 30 seconds
}
```

### Server-Side Memory Monitoring

```typescript
// lib/performance/server-memory.ts
export function startServerMemoryMonitoring() {
  if (process.env.NODE_ENV !== "production") return;

  const checkInterval = 60000; // 1 minute
  const alertThreshold = 500 * 1024 * 1024; // 500MB

  setInterval(() => {
    const usage = process.memoryUsage();

    const stats = {
      rss: Math.round(usage.rss / 1024 / 1024),
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024),
      timestamp: Date.now(),
    };

    // Log memory stats
    logger.info(stats, "Server memory usage");

    // Send to monitoring
    analytics.track("server_memory", stats);

    // Alert on high memory
    if (usage.heapUsed > alertThreshold) {
      logger.warn(
        {
          ...stats,
          threshold: Math.round(alertThreshold / 1024 / 1024),
        },
        "High server memory usage"
      );

      // Trigger garbage collection if available
      if (global.gc) {
        logger.info("Triggering garbage collection");
        global.gc();
      }
    }
  }, checkInterval);
}

// Start monitoring
startServerMemoryMonitoring();
```

### React Component Memory Profiling

```typescript
// hooks/useMemoryProfile.ts
export function useMemoryProfile(componentName: string) {
  useEffect(() => {
    const startMemory = (performance as any).memory?.usedJSHeapSize;

    return () => {
      if (startMemory) {
        const endMemory = (performance as any).memory?.usedJSHeapSize;
        const diff = endMemory - startMemory;

        if (diff > 1024 * 1024) {
          // More than 1MB
          console.warn(
            `${componentName} may have leaked ${Math.round(diff / 1024 / 1024)}MB`
          );
        }
      }
    };
  }, [componentName]);
}

// Usage in components
export function FileTree() {
  useMemoryProfile("FileTree");

  // Component implementation
}
```

### Memory Leak Prevention Patterns

```typescript
// 1. Clean up event listeners
export function DocumentEditor() {
  useEffect(() => {
    const handler = () => console.log('keydown');
    document.addEventListener('keydown', handler);

    // MUST clean up
    return () => document.removeEventListener('keydown', handler);
  }, []);
}

// 2. Cancel pending requests
export function useDocumentFetch(id: string) {
  useEffect(() => {
    const abortController = new AbortController();

    fetch(`/api/content/files/${id}`, {
      signal: abortController.signal,
    });

    // MUST abort on unmount
    return () => abortController.abort();
  }, [id]);
}

// 3. Clear intervals/timeouts
export function AutoSave({ content }: { content: string }) {
  useEffect(() => {
    const interval = setInterval(() => {
      saveContent(content);
    }, 30000);

    // MUST clear interval
    return () => clearInterval(interval);
  }, [content]);
}

// 4. Unsubscribe from observables
export function LiveUpdates() {
  useEffect(() => {
    const subscription = documentChanges$.subscribe(handleChange);

    // MUST unsubscribe
    return () => subscription.unsubscribe();
  }, []);
}

// 5. Release object URLs
export function ImagePreview({ file }: { file: File }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);

    // MUST revoke object URL
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return <img src={url} alt="Preview" />;
}
```

### Memory Budget Monitoring

```typescript
// lib/performance/memory-budget.ts
export class MemoryBudget {
  private budget = {
    // Component budgets (in MB)
    FileTree: 10,
    DocumentEditor: 20,
    PDFViewer: 30,
    ImageGallery: 40,
  };

  checkBudget(componentName: keyof typeof this.budget): boolean {
    if (typeof window === "undefined") return true;
    if (!("memory" in performance)) return true;

    const memory = (performance as any).memory;
    const usedMB = memory.usedJSHeapSize / 1024 / 1024;
    const budgetMB = this.budget[componentName];

    if (usedMB > budgetMB) {
      console.warn(
        `${componentName} exceeded budget: ${usedMB}MB > ${budgetMB}MB`
      );

      analytics.track("memory_budget_exceeded", {
        component: componentName,
        usedMB,
        budgetMB,
      });

      return false;
    }

    return true;
  }
}

// Usage
const memoryBudget = new MemoryBudget();

export function FileTree() {
  useEffect(() => {
    memoryBudget.checkBudget("FileTree");
  }, []);

  // Component implementation
}
```

### Chrome DevTools Memory Profiling

**Steps to detect memory leaks:**

1. Open Chrome DevTools → Memory tab
2. Take heap snapshot before action
3. Perform action (e.g., open/close document)
4. Take heap snapshot after action
5. Compare snapshots to find retained objects

**Common leak patterns to look for:**

- Detached DOM nodes
- Event listeners not removed
- Closures holding references
- Timers not cleared
- Large cached data not pruned

### Automated Memory Testing

```typescript
// tests/memory.test.ts
describe("Memory Leaks", () => {
  it("should not leak memory when opening/closing documents", async () => {
    const initialMemory = (performance as any).memory.usedJSHeapSize;

    // Perform actions multiple times
    for (let i = 0; i < 10; i++) {
      await openDocument("test-id");
      await closeDocument("test-id");
    }

    // Force garbage collection
    if (global.gc) global.gc();

    const finalMemory = (performance as any).memory.usedJSHeapSize;
    const diff = finalMemory - initialMemory;

    // Should not grow more than 5MB
    expect(diff).toBeLessThan(5 * 1024 * 1024);
  });
});
```

## Next Steps

1. Review [Architecture](./01-architecture.md) for optimization points
2. See [Testing Strategy](./12-testing-strategy.md) for performance tests
3. Follow [Implementation Guide](./11-implementation-guide.md) for best practices
