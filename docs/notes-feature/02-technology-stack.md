# Technology Stack

**Version:** 1.0  
**Last Updated:** January 10, 2026

## Overview

This document evaluates and recommends libraries for the notes feature implementation. Decisions are categorized as either **straightforward** (clear choice) or **options-based** (requires team discussion).

## Evaluation Criteria

All libraries are assessed against these criteria:

1. **Performance:** Benchmarks, render speed, memory usage
2. **Bundle Size:** Impact on application size (gzipped)
3. **Maintenance:** Update frequency, issue resolution time
4. **Community:** GitHub stars, npm downloads, Stack Overflow activity
5. **License:** Compatibility with project (MIT preferred)
6. **Integration:** Ease of integration with Next.js 16+ and React 19+
7. **TypeScript:** Type definitions quality and completeness
8. **Accessibility:** WCAG 2.1 AA compliance out-of-the-box

## Straightforward Decisions

### Command Palette: cmdk ✅

**Chosen:** `cmdk` v1.1.1

**Rationale:**

- Already integrated in codebase (`components/client/ui/command.tsx`)
- Lightweight: 14KB gzipped
- Excellent keyboard navigation
- Accessible by default (ARIA compliant)
- Used by Vercel, Raycast, Linear
- MIT license

**Usage:**

```typescript
import { Command, CommandInput, CommandList, CommandItem } from '@/components/client/ui/command';

<Command>
  <CommandInput placeholder="Type a command..." />
  <CommandList>
    <CommandItem onSelect={() => createNewNote()}>
      New Note
    </CommandItem>
  </CommandList>
</Command>
```

### Icon Library: Lucide React ✅

**Chosen:** `lucide-react` v0.562.0

**Rationale:**

- Already in use across the application
- 1000+ icons covering all file types
- Tree-shakeable (only imports used icons)
- Consistent design language
- Regular updates (weekly releases)
- MIT license

**File Type Icon Mapping:**

```typescript
import {
  FileText,
  FileCode,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  File,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  "text/markdown": FileText,
  "application/javascript": FileCode,
  "image/*": FileImage,
  "video/*": FileVideo,
  "audio/*": FileAudio,
  "application/zip": FileArchive,
  default: File,
};
```

### Markdown Editor: Novel + TipTap ✅

**Chosen:** `novel` (latest) + `@tiptap/react` v2.x

**Rationale:**

- Specified in requirements
- WYSIWYG editing with markdown shortcuts
- Extensible via TipTap extensions
- Slash commands, bubble menu, floating menu
- Image upload, embeds, code blocks
- Collaborative editing ready (Y.js integration)
- Used by Vercel, Cal.com

**Configuration:**

```typescript
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";

const editor = useEditor({
  extensions: [
    StarterKit,
    Image,
    CodeBlockLowlight.configure({
      lowlight: createLowlight(all),
    }),
  ],
  content: initialContent,
  editorProps: {
    attributes: {
      class: "prose prose-sm sm:prose lg:prose-lg focus:outline-none",
    },
  },
});
```

### Markdown Conversion: TipTap Markdown Extension ✅

**Chosen:** `@tiptap/extension-markdown` v2.x

**Rationale:**

- Official TipTap extension for bidirectional markdown conversion
- Enables markdown shortcuts in WYSIWYG editor (e.g., **bold**, ## headings)
- Serializes TipTap JSON back to CommonMark-compatible markdown
- Lightweight: ~20KB
- Maintained by TipTap core team
- MIT license

**Usage:**

```typescript
import { Markdown } from "@tiptap/extension-markdown";
import { Editor } from "@tiptap/react";

const editor = useEditor({
  extensions: [
    StarterKit,
    Markdown.configure({
      html: false, // Strip HTML for security
      transformPastedText: true, // Auto-convert pasted markdown
      transformCopiedText: true, // Copy as markdown
    }),
  ],
});

// Convert markdown to TipTap JSON
editor.commands.setContent(markdownString);

// Serialize TipTap JSON to markdown
const markdown = editor.storage.markdown.getMarkdown();
```

**Upload Flow:**

1. User uploads .md file
2. Parse markdown using TipTap markdown extension
3. Convert to TipTap JSON (stored as NotePayload.tiptapJson)
4. User edits in WYSIWYG mode
5. Export back to .md using markdown serializer

**Phase 2 Enhancement (Toggle Mode):**

- Add `@uiw/react-codemirror` for raw markdown editing
- `@codemirror/lang-markdown` for syntax highlighting
- Lazy load only when user toggles to markdown view
- Additional bundle: +40KB (lazy loaded)

### Code Syntax Highlighting: Shiki ✅

**Chosen:** `shiki` v1.x

**Rationale:**

- Modern replacement for Prism/Highlight.js
- Uses VS Code themes and grammars
- Server-side rendering capable
- 200+ languages supported
- Zero runtime overhead (pre-rendered)
- MIT license

**Usage:**

```typescript
import { codeToHtml } from "shiki";

const html = await codeToHtml(code, {
  lang: "typescript",
  theme: "github-dark",
});
```

### PDF Generation: Puppeteer ✅

**Chosen:** `puppeteer` (already in use)

**Rationale:**

- Already implemented in resume feature
- HTML → PDF conversion on server
- Full Chrome rendering engine
- Handles complex layouts perfectly
- Used by millions (Google-maintained)

**Current Implementation:**

```typescript
// app/api/resume/export-pdf/route.ts
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(htmlTemplate);
const pdf = await page.pdf({ format: "A4" });
```

## Options-Based Decisions

### Panel Layout Library

Three strong contenders, each with different trade-offs:

#### Option 1: Allotment (Recommended)

**Package:** `allotment` v1.20.x  
**Bundle Size:** 45KB gzipped  
**Stars:** 3.7K

**Pros:**

- VS Code's panel splitter (battle-tested)
- Excellent keyboard support
- Nested splits supported
- Typescript-first
- Accessible (ARIA labels)
- Smooth animations

**Cons:**

- Slightly larger bundle than alternatives
- Less flexible than react-mosaic for complex layouts

**Usage:**

```typescript
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';

<Allotment>
  <Allotment.Pane minSize={200}>
    <LeftSidebar />
  </Allotment.Pane>
  <Allotment.Pane>
    <MainPanel />
  </Allotment.Pane>
  <Allotment.Pane minSize={250}>
    <RightSidebar />
  </Allotment.Pane>
</Allotment>
```

**Recommendation:** ⭐ Choose this for simplicity and reliability

#### Option 2: react-mosaic-component

**Package:** `react-mosaic-component` v6.1.x  
**Bundle Size:** 38KB gzipped  
**Stars:** 4.2K

**Pros:**

- Most flexible (infinite nesting)
- Drag-and-drop panel rearrangement
- Multiple layout algorithms
- Used by Palantir products

**Cons:**

- More complex API
- Steeper learning curve
- Heavier on state management

**Usage:**

```typescript
import { Mosaic } from 'react-mosaic-component';

<Mosaic<string>
  renderTile={(id) => <PanelContent id={id} />}
  initialValue={{
    direction: 'row',
    first: 'sidebar',
    second: {
      direction: 'row',
      first: 'editor',
      second: 'outline',
    },
  }}
/>
```

**Recommendation:** Consider if you need complex, user-rearrangeable layouts

#### Option 3: flexlayout-react

**Package:** `flexlayout-react` v0.7.x  
**Bundle Size:** 42KB gzipped  
**Stars:** 923

**Pros:**

- Tabbed docking system
- JSON-based layout config
- Drag to dock anywhere
- Maximizing/minimizing panels

**Cons:**

- Smaller community
- Occasional bugs in edge cases
- Complex state management

**Recommendation:** Skip unless you need advanced docking

### File Tree Virtualization

#### Option 1: @tanstack/react-virtual (Recommended)

**Package:** `@tanstack/react-virtual` v3.x  
**Bundle Size:** 12KB gzipped  
**Stars:** 23K (TanStack monorepo)

**Pros:**

- Lightweight and fast
- Framework-agnostic core
- Excellent docs
- Dynamic height support
- Horizontal and vertical virtualization

**Cons:**

- Requires manual tree flattening
- More setup than react-arborist

**Usage:**

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

const flatTree = useMemo(() => flattenTree(tree, expandedIds), [tree, expandedIds]);

const virtualizer = useVirtualizer({
  count: flatTree.length,
  getScrollElement: () => containerRef.current,
  estimateSize: () => 32,
});

return (
  <div ref={containerRef} style={{ height: '100%', overflow: 'auto' }}>
    <div style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtualItem) => (
        <TreeNode
          key={virtualItem.key}
          node={flatTree[virtualItem.index]}
          style={{ height: virtualItem.size }}
        />
      ))}
    </div>
  </div>
);
```

**Recommendation:** Consider if you need maximum flexibility and minimal bundle size

#### Option 2: react-arborist ⭐ (CHOSEN)

**Package:** `react-arborist` v3.x  
**Bundle Size:** 55KB gzipped  
**Stars:** 2.8K

**Pros:**

- **Built for trees** (minimal setup)
- **Drag-and-drop built-in** ✅
- **Multi-select** (Shift/Cmd+Click)
- **Keyboard navigation** (Space to grab, arrows to move)
- **Search/filter included**
- **Virtualization built-in**
- **Custom node rendering** (for icon customization)

**Cons:**

- Heavier bundle than TanStack Virtual alone
- More opinionated API (but appropriate for file trees)

**Usage with Drag-and-Drop:**

```typescript
import { Tree } from 'react-arborist';

<Tree
  data={fileTree}
  // Drag-and-drop for file organization
  onMove={async ({ dragIds, parentId, index }) => {
    await moveDocuments(dragIds, parentId, index);
  }}
  // Custom icon rendering per node
  renderNode={({ node, style, dragHandle }) => (
    <div style={style} ref={dragHandle}>
      {getCustomIcon(node.data.icon || node.data.docType)}
      <span>{node.data.title}</span>
    </div>
  )}
  // Multi-select support
  selection={selectedIds}
  onSelect={(nodes) => setSelectedIds(nodes.map(n => n.id))}
  // Virtualization
  height={800}
  width="100%"
  // Search/filter
  searchTerm={searchTerm}
  searchMatch={(node, term) =>
    node.data.title.toLowerCase().includes(term.toLowerCase())
  }
/>
```

**Recommendation:** ⭐ **Chosen for notes feature** - Essential drag-and-drop for file organization outweighs bundle size. Includes virtualization, multi-select, keyboard navigation, and search out-of-the-box.

### State Management for Panels/Tabs

#### Option 1: Zustand ⭐ (CHOSEN)

**Package:** `zustand` v4.x  
**Bundle Size:** 3KB gzipped  
**Stars:** 44K

**Pros:**

- **Minimal API surface** (easy to learn)
- **No Provider needed** (less boilerplate)
- **Excellent DevTools** (Redux DevTools compatible)
- **Middleware for persistence** (localStorage/sessionStorage)
- **TypeScript-first** (great type inference)
- **2KB smaller** than Jotai

**Cons:**

- Less "React-like" than Jotai
- No built-in suspense support (use React Query for async instead)

**Usage:**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PanelStore {
  leftWidth: number;
  rightWidth: number;
  leftSidebarPosition: 'left' | 'right';
  rightSidebarPosition: 'left' | 'right';
  chatFullScreen: boolean;
  openTabs: Tab[];
  activeTabId: string | null;

  setLeftWidth: (width: number) => void;
  toggleChat: () => void;
  addTab: (tab: Tab) => void;
  closeTab: (id: string) => void;
}

// No Provider needed - use anywhere
export const usePanelStore = create<PanelStore>()(
  persist(
    (set, get) => ({
      leftWidth: 300,
      rightWidth: 250,
      leftSidebarPosition: 'left',
      rightSidebarPosition: 'right',
      chatFullScreen: false,
      openTabs: [],
      activeTabId: null,

      setLeftWidth: (width) => set({ leftWidth: width }),
      toggleChat: () => set(state => ({ chatFullScreen: !state.chatFullScreen })),
      addTab: (tab) => set(state => ({
        openTabs: [...state.openTabs, tab],
        activeTabId: tab.id,
      })),
      closeTab: (id) => set(state => ({
        openTabs: state.openTabs.filter(t => t.id !== id),
        activeTabId: state.openTabs[0]?.id || null,
      })),
    }),
    { name: 'panel-layout' }
  )
);

// Usage in components
function FileTree() {
  const leftWidth = usePanelStore(state => state.leftWidth);
  const setLeftWidth = usePanelStore(state => state.setLeftWidth);

  return <div style={{ width: leftWidth }}>...</div>;
}
```

**Recommendation:** ⭐ **Chosen for notes feature** - Panel layout state is synchronous and benefits from Zustand's simplicity and excellent persistence middleware.

#### Option 2: Jotai (Alternative for Future)

**Package:** `jotai` v2.x  
**Bundle Size:** 5KB gzipped  
**Stars:** 17K

**Pros:**

- Atomic state model
- **Suspense support** ✅
- More React-like (hooks-based)
- Great for derived state
- Fine-grained reactivity

**Cons:**

- Slightly larger than Zustand
- Requires Provider
- More setup for simple use cases

**Usage:**

```typescript
import { atom, useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// Atoms for each piece of state
export const leftWidthAtom = atomWithStorage('leftWidth', 300);
export const openTabsAtom = atomWithStorage<Tab[]>('openTabs', []);

// Suspense-compatible async atom (future feature)
export const documentAtom = atom(async (get) => {
  const id = get(activeTabIdAtom);
  if (!id) return null;
  const response = await fetch(`/api/content/files/${id}`);
  return response.json(); // Suspends automatically
});

// Usage requires Provider
function App() {
  return (
    <Provider>
      <Suspense fallback={<Loading />}>
        <NotesApp />
      </Suspense>
    </Provider>
  );
}
```

**Future Consideration:** If we add real-time collaborative editing or need Suspense-based data fetching at the state level, Jotai's atomic model could be beneficial. For now, React Query handles async data better.

**Note:** Jotai excels when:

- You need Suspense for state (not just data fetching)
- You have complex derived state calculations
- You want atomic granularity for large state trees
- Real-time collaboration requires fine-grained updates

### PDF Viewing Library

#### Option 1: @react-pdf-viewer/core (Recommended)

**Package:** `@react-pdf-viewer/core` v3.x + plugins  
**Bundle Size:** 180KB gzipped (core + essential plugins)  
**Stars:** 2K

**Pros:**

- Feature-complete (zoom, search, thumbnails)
- Plugin system for modularity
- Touch gestures
- Print support
- Annotations (via plugin)

**Cons:**

- Large bundle (but splittable)
- Commercial license for some plugins

**Usage:**

```typescript
import { Viewer, Worker } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import '@react-pdf-viewer/core/lib/styles/index.css';

const defaultLayoutPluginInstance = defaultLayoutPlugin();

<Worker workerUrl="https://unpkg.com/pdfjs-dist@3.x/build/pdf.worker.min.js">
  <Viewer
    fileUrl="/path/to/file.pdf"
    plugins={[defaultLayoutPluginInstance]}
  />
</Worker>
```

**Recommendation:** ⭐ Choose for full-featured PDF viewing

#### Option 2: react-pdf

**Package:** `react-pdf` v7.x  
**Bundle Size:** 120KB gzipped  
**Stars:** 9K

**Pros:**

- Smaller bundle
- Simpler API
- MIT license
- Mobile-friendly

**Cons:**

- Fewer features (no annotations)
- Manual zoom implementation
- Less polished UI

**Recommendation:** Choose if bundle size is critical

### Media Player

#### Option 1: Native HTML5 (Recommended)

**Bundle Size:** 0KB (native)

**Pros:**

- Zero dependencies
- Built-in accessibility
- HLS/DASH support (modern browsers)
- Mobile-optimized

**Cons:**

- Limited customization
- Inconsistent UI across browsers

**Usage:**

```typescript
<video
  controls
  preload="metadata"
  className="w-full max-h-[600px]"
>
  <source src={videoUrl} type="video/mp4" />
  <track kind="captions" src={captionsUrl} srclang="en" label="English" />
  Your browser doesn't support video playback.
</video>
```

**Recommendation:** ⭐ Start with native, upgrade later if needed

#### Option 2: react-player

**Package:** `react-player` v2.x  
**Bundle Size:** 65KB gzipped  
**Stars:** 9K

**Pros:**

- Supports YouTube, Vimeo, Twitch, etc.
- Consistent API across providers
- Playlist support

**Cons:**

- Larger bundle
- Overkill for local files

**Recommendation:** Use only if you need streaming platform embeds

## Complete Dependency List

### Straightforward (Install Immediately)

```json
{
  "dependencies": {
    "cmdk": "^1.1.1",
    "lucide-react": "^0.562.0",
    "novel": "latest",
    "@tiptap/react": "^2.2.0",
    "@tiptap/starter-kit": "^2.2.0",
    "@tiptap/extension-image": "^2.2.0",
    "@tiptap/extension-code-block-lowlight": "^2.2.0",
    "shiki": "^1.0.0"
  },
  "devDependencies": {
    "puppeteer": "^21.0.0"
  }
}
```

### Options-Based (Decide & Install)

**Recommended Choices:**

```json
{
  "dependencies": {
    "allotment": "^1.20.0",
    "@tanstack/react-virtual": "^3.0.0",
    "zustand": "^4.5.0",
    "@react-pdf-viewer/core": "^3.12.0",
    "@react-pdf-viewer/default-layout": "^3.12.0",
    "pdfjs-dist": "^3.11.0"
  }
}
```

**Alternative Choices (if team prefers):**

```json
{
  "dependencies": {
    "react-mosaic-component": "^6.1.0",
    "react-arborist": "^3.4.0",
    "jotai": "^2.6.0",
    "react-pdf": "^7.7.0",
    "react-player": "^2.14.0"
  }
}
```

## Bundle Size Impact Analysis

### Current Application (apps/web)

- **Total Bundle:** ~650KB gzipped
- **Largest Chunk:** 280KB (React + Next.js core)

### Notes Feature Addition (Recommended Stack)

- **Panel Layout (Allotment):** +45KB
- **Virtualization (TanStack):** +12KB
- **State (Zustand):** +3KB
- **Markdown (Novel + TipTap + Markdown Extension):** +200KB
- **Markdown Editor Toggle (Phase 2, lazy-loaded):** +40KB
- **Code Highlighting (Shiki):** +40KB (cached)
- **PDF Viewer:** +180KB (lazy-loaded)
- **Total Added:** ~480KB (base), ~520KB (with toggle mode)

### Optimization Strategies

1. **Code Splitting:** Lazy load PDF viewer, video player (+150KB saved initially)
2. **Tree Shaking:** Import only used Lucide icons (+20KB saved)
3. **Shiki SSR:** Pre-render code blocks (+40KB saved at runtime)
4. **Compression:** Brotli compression (30% smaller than gzip)

**Estimated Final Impact:** +280KB initial load, +180KB on-demand

## License Compliance Matrix

| Library                 | License    | Commercial Use | Attribution Required |
| ----------------------- | ---------- | -------------- | -------------------- |
| cmdk                    | MIT        | ✅ Yes         | ❌ No                |
| lucide-react            | ISC        | ✅ Yes         | ❌ No                |
| novel                   | Apache 2.0 | ✅ Yes         | ❌ No                |
| @tiptap/react           | MIT        | ✅ Yes         | ❌ No                |
| shiki                   | MIT        | ✅ Yes         | ❌ No                |
| allotment               | MIT        | ✅ Yes         | ❌ No                |
| @tanstack/react-virtual | MIT        | ✅ Yes         | ❌ No                |
| zustand                 | MIT        | ✅ Yes         | ❌ No                |
| @react-pdf-viewer/core  | Apache 2.0 | ✅ Yes         | ❌ No                |
| pdfjs-dist              | Apache 2.0 | ✅ Yes         | ❌ No                |

**Verdict:** ✅ All licenses compatible with commercial use

## Migration Notes

### From MVP to Full Feature

Current MVP uses basic textarea. Migration path:

1. **Phase 1:** Introduce Novel/TipTap alongside textarea
2. **Phase 2:** Migrate existing content (markdown → TipTap JSON)
3. **Phase 3:** Remove textarea, full TipTap
4. **Phase 4:** Add advanced features (collaboration, embeds)

**Migration Script:**

```typescript
// Convert markdown to TipTap JSON using TipTap markdown extension
import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/extension-markdown";
import StarterKit from "@tiptap/starter-kit";

const editor = new Editor({
  extensions: [StarterKit, Markdown],
  content: "", // Empty initially
});

// Convert markdown
editor.commands.setContent(markdownContent);
const tiptapJson = editor.getJSON();

// Clean up
editor.destroy();
```

## Next Steps

1. **Team Decision:** Review options-based libraries, choose preferred
2. **Install Dependencies:** Run `pnpm add` for chosen libraries
3. **Configure:** Set up TipTap extensions, Shiki themes
4. **Review:** [UI Components](./06-ui-components.md) for implementation details
5. **Build:** Follow [Implementation Guide](./11-implementation-guide.md)
