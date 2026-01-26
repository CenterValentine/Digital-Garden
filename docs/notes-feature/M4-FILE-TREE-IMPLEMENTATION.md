# M4: File Tree Implementation

**Milestone:** M4 - File Tree with Drag & Drop  
**Architecture:** Server Components + Suspense for Progressive Loading  
**Version:** 2.0  
**Last Updated:** January 12, 2026

## Overview

M4 implements the virtualized file tree with drag-and-drop functionality, using a hybrid server/client component architecture for optimal performance and user experience.

**Key Architecture Decision:**
- **Server Components** for static structure (headers, icons, borders)
- **Client Components** for interactive parts (tree, drag-and-drop)
- **Suspense Boundaries** for progressive loading and skeleton states

---

## Phase 1: Server Component Architecture (Skeleton Structure)

### Strategy: Immediate Visual Feedback

Instead of showing a blank screen while JavaScript loads, we'll show the **structure immediately**:

1. **Layout (Server Component)** - Renders instantly
2. **Panel Headers (Server Component)** - Show immediately with icons
3. **Panel Borders (Server Component)** - Define space immediately
4. **Dynamic Content (Client Component)** - Loads progressively with Suspense

### Component Split

```
PanelLayout (Server)
├── Panel Headers (Server) ✅ Instant
├── Suspense Boundary
│   └── LeftSidebarContent (Client) ⏳ Progressive
├── Suspense Boundary
│   └── MainPanelContent (Client) ⏳ Progressive
└── Suspense Boundary
    └── RightSidebarContent (Client) ⏳ Progressive
```

---

## Implementation Steps

### Step 1: Create Server Component Headers

**File:** `components/notes/headers/LeftSidebarHeader.tsx`

```typescript
/**
 * Left Sidebar Header (Server Component)
 * 
 * Renders immediately to show structure before JS loads.
 */

import { Folder, Plus, MoreHorizontal } from "lucide-react";

export function LeftSidebarHeader() {
  return (
    <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
      <div className="flex items-center gap-2">
        <Folder className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold">Files</h2>
      </div>
      <div className="flex items-center gap-1">
        <button 
          className="rounded p-1 hover:bg-white/10 transition-colors"
          title="New file"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button 
          className="rounded p-1 hover:bg-white/10 transition-colors"
          title="More options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

**File:** `components/notes/headers/RightSidebarHeader.tsx`

```typescript
/**
 * Right Sidebar Header (Server Component)
 */

import { MessageSquare, Link, List, MoreHorizontal } from "lucide-react";

export function RightSidebarHeader() {
  return (
    <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
      <div className="flex items-center gap-2">
        <button 
          className="rounded p-1 hover:bg-white/10 transition-colors"
          title="Outline"
        >
          <List className="h-4 w-4" />
        </button>
        <button 
          className="rounded p-1 hover:bg-white/10 transition-colors"
          title="Backlinks"
        >
          <Link className="h-4 w-4" />
        </button>
        <button 
          className="rounded p-1 hover:bg-white/10 transition-colors"
          title="AI Chat"
        >
          <MessageSquare className="h-4 w-4" />
        </button>
      </div>
      <button 
        className="rounded p-1 hover:bg-white/10 transition-colors"
        title="More options"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
}
```

### Step 2: Create Skeleton Components

**File:** `components/notes/skeletons/FileTreeSkeleton.tsx`

```typescript
/**
 * File Tree Skeleton (Server Component)
 * 
 * Shows while file tree is loading.
 */

export function FileTreeSkeleton() {
  return (
    <div className="animate-pulse space-y-2 p-4">
      {/* Folder skeleton */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded bg-white/10" />
        <div className="h-4 w-32 rounded bg-white/10" />
      </div>
      
      {/* File skeletons */}
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="ml-6 flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-white/5" />
          <div className="h-4 w-40 rounded bg-white/5" />
        </div>
      ))}
      
      {/* Another folder */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded bg-white/10" />
        <div className="h-4 w-28 rounded bg-white/10" />
      </div>
    </div>
  );
}
```

### Step 3: Update Panel Components

**File:** `components/notes/LeftSidebar.tsx` → Split into:

```typescript
// components/notes/LeftSidebar.tsx (Server Component Wrapper)
import { Suspense } from "react";
import { LeftSidebarHeader } from "./headers/LeftSidebarHeader";
import { LeftSidebarContent } from "./content/LeftSidebarContent";
import { FileTreeSkeleton } from "./skeletons/FileTreeSkeleton";

export function LeftSidebar() {
  return (
    <div className="flex h-full flex-col">
      {/* Header - Renders immediately */}
      <LeftSidebarHeader />
      
      {/* Content - Progressive with Suspense */}
      <Suspense fallback={<FileTreeSkeleton />}>
        <LeftSidebarContent />
      </Suspense>
    </div>
  );
}
```

```typescript
// components/notes/content/LeftSidebarContent.tsx (Client Component)
"use client";

import { useEffect, useState } from "react";
import { FileTree } from "../FileTree";

export function LeftSidebarContent() {
  const [treeData, setTreeData] = useState(null);
  
  useEffect(() => {
    // Fetch tree data
    fetch('/api/notes/content/tree')
      .then(res => res.json())
      .then(data => setTreeData(data));
  }, []);
  
  if (!treeData) {
    return <FileTreeSkeleton />;
  }
  
  return <FileTree data={treeData} />;
}
```

### Step 4: Update Layout to Use New Structure

**File:** `app/(authenticated)/notes/layout.tsx`

```typescript
import { PanelLayout } from "@/components/notes/PanelLayout";
import { LeftSidebar } from "@/components/notes/LeftSidebar";
import { RightSidebar } from "@/components/notes/RightSidebar";
import { StatusBar } from "@/components/notes/StatusBar";

export default function NotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PanelLayout
      leftSidebar={<LeftSidebar />}
      mainContent={children}
      rightSidebar={<RightSidebar />}
      statusBar={<StatusBar />}
    />
  );
}
```

---

## Phase 2: File Tree Implementation

### Install react-arborist

```bash
cd apps/web
pnpm add react-arborist
```

### Create FileTree Component

**File:** `components/notes/FileTree.tsx`

```typescript
"use client";

import { Tree } from "react-arborist";
import { FileNode } from "./FileNode";
import { useFileTree } from "@/hooks/useFileTree";

export function FileTree({ data }: { data: any }) {
  const { nodes, onMove, onRename, onCreate, onDelete } = useFileTree(data);
  
  return (
    <div className="h-full">
      <Tree
        data={nodes}
        onMove={onMove}
        onRename={onRename}
        rowHeight={28}
        indent={20}
        overscanCount={10}
      >
        {FileNode}
      </Tree>
    </div>
  );
}
```

---

## Benefits of This Architecture

### 1. **Instant Visual Feedback**
- Headers and borders show immediately
- User sees structure before JavaScript loads
- No "flash of unstyled content"

### 2. **Progressive Enhancement**
- Server components render first (HTML)
- Client components hydrate progressively
- Suspense shows skeletons during load

### 3. **Better Performance**
- Smaller JavaScript bundle (server components don't ship JS)
- Faster initial paint
- Improved Core Web Vitals

### 4. **Graceful Degradation**
- If JavaScript fails, structure still visible
- Headers and navigation remain functional
- Better accessibility

---

## File Structure

```
components/notes/
├── PanelLayout.tsx              # Client (needs Allotment)
├── LeftSidebar.tsx              # Server wrapper
├── RightSidebar.tsx             # Server wrapper
├── MainPanel.tsx                # Server wrapper
├── StatusBar.tsx                # Server
├── headers/
│   ├── LeftSidebarHeader.tsx   # Server
│   ├── RightSidebarHeader.tsx  # Server
│   └── MainPanelHeader.tsx     # Server
├── content/
│   ├── LeftSidebarContent.tsx  # Client
│   ├── RightSidebarContent.tsx # Client
│   └── MainPanelContent.tsx    # Client
├── skeletons/
│   ├── FileTreeSkeleton.tsx    # Server
│   ├── OutlineSkeleton.tsx     # Server
│   └── EditorSkeleton.tsx      # Server
└── FileTree.tsx                 # Client (interactive)
```

---

## Testing Checklist

- [ ] Headers visible before JS loads
- [ ] Skeleton animations smooth
- [ ] File tree loads progressively
- [ ] Drag-and-drop works after hydration
- [ ] No layout shift during loading
- [ ] Console shows proper loading sequence

---

## Next: M5 - Editors & Viewers

After M4 is complete, we'll apply the same pattern to:
- TipTap editor (client component)
- PDF viewer (client component)
- Image viewer (client component)
- All with server-rendered chrome and Suspense boundaries

---

## References

- **React Server Components:** https://nextjs.org/docs/app/building-your-application/rendering/server-components
- **Suspense:** https://react.dev/reference/react/Suspense
- **react-arborist:** https://github.com/brimdata/react-arborist

