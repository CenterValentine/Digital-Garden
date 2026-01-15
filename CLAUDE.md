# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a **pnpm monorepo** using **Turbo** for task orchestration. It contains three applications:

- **`apps/web`** - Digital Garden Notes IDE (primary focus, active development)
- **`apps/web-amino`** - Amino acid learning platform
- **`apps/open-notes`** - Documentation and research repository

**Configuration Files:**
- `pnpm-workspace.yaml` - Workspace package definitions (`apps/*`, `packages/*`)
- `turbo.json` - Task orchestration and caching configuration
- `tsconfig.base.json` - Shared TypeScript configuration

## Development Commands

### Root Level (Turbo)

```bash
# Default target is web-amino (set in root package.json)
pnpm dev          # Run development server
pnpm build        # Build application
pnpm typecheck    # Run TypeScript type checking
pnpm lint         # Run ESLint
```

### Notes IDE (apps/web)

```bash
# Navigate to the web app
cd apps/web

# Development
pnpm dev          # Start Next.js dev server
pnpm build        # Generate Prisma client + design tokens + build Next.js
pnpm start        # Start production server
pnpm lint         # Run ESLint

# Database operations
pnpm db:seed      # Seed database with ContentNode v2.0 test data
prisma generate   # Generate Prisma client (outputs to lib/generated/prisma)
prisma migrate dev --name migration_name  # Create and apply migration
prisma studio     # Open Prisma Studio GUI

# Design System
pnpm build:tokens # Generate CSS variables from design tokens (style-dictionary)
```

## Notes IDE Architecture (apps/web)

The Notes IDE is an Obsidian-inspired knowledge management system with a panel-based layout, file tree navigation, rich text editing, and multi-cloud storage support.

**Current Status:**
- ✅ M1: Database schema v2.0, utilities, seed script
- ✅ M2: All 14 API routes with type-safe interfaces
- ✅ M3: Panel layout, design system integration, server/client architecture
- ✅ M4: File tree with react-arborist, drag-and-drop, context menu (complete)
- ✅ M5: TipTap editor with markdown, syntax highlighting, auto-save (complete)
- 🔄 M6: Search, backlinks, wiki-links, slash commands, callouts (in progress)

### Database: ContentNode v2.0 (Hybrid Type-Safe Polymorphism)

**Core Pattern:**
A single `ContentNode` table acts as a universal container for all content types. Each leaf node has exactly one typed payload relation, while folders have no payload.

**Typed Payloads:**
- `NotePayload` - Rich text content (TipTap JSON + markdown)
- `FilePayload` - Binary files with storage metadata (images, PDFs, etc.)
- `HtmlPayload` - Rendered HTML content
- `CodePayload` - Code snippets with syntax highlighting

**Key Features:**
- Hierarchical structure via `parentId` with `displayOrder` for ordering
- Soft delete with audit trail (`deletedAt`, `deletedBy`)
- Custom icons and colors per node (`customIcon`, `iconColor`)
- Category grouping and publication status
- Full-text search via `searchText` field

**Schema Location:** `apps/web/prisma/schema.prisma`

### API Architecture (14 Endpoints)

All endpoints are in `apps/web/app/api/notes/`:

**Content CRUD:**
```
GET/POST     /api/notes/content              # List/create content
GET/PATCH/DELETE /api/notes/content/[id]     # Individual content operations
GET          /api/notes/content/tree         # Hierarchical tree structure
POST         /api/notes/content/move         # Drag-and-drop reordering
```

**Two-Phase File Upload:**
```
POST /api/notes/content/upload/initiate      # Get presigned URL
POST /api/notes/content/upload/finalize      # Confirm upload completion
```

**Storage Configuration:**
```
GET/POST     /api/notes/storage              # List/create storage configs
GET/PATCH/DELETE /api/notes/storage/[id]     # Individual config operations
```

**Type Definitions:** `apps/web/lib/content/api-types.ts`

### UI Architecture: Server/Client Split

**Critical Pattern:** Maximize server-side rendering for instant visual feedback, progressively enhance with client interactivity.

**Server Components** (render immediately without JS):
- Panel headers with icons and titles
- Panel borders and layout structure
- Skeleton loading states
- Layout wrappers

**Client Components** (progressive hydration):
- Interactive file tree (`react-arborist`)
- Resizable panels (`allotment`)
- State management (`zustand`)
- Drag-and-drop handlers

**Loading Pattern:**
```tsx
// Server Component
import { Suspense } from "react";

export function Panel() {
  return (
    <div>
      <Header />  {/* Server: instant render */}
      <Suspense fallback={<Skeleton />}>
        <Content />  {/* Client: progressive */}
      </Suspense>
    </div>
  );
}
```

**Important:** Use inline SVG for icons in server components, NOT `lucide-react` (client-only).

### Design System: Liquid Glass

**Location:** `apps/web/lib/design-system/`

**Three Token Categories:**
- **`surfaces.ts`** - Glass-0/1/2 blur levels for glassmorphism effects
- **`intents.ts`** - Semantic colors (primary, danger, success, warning, info)
- **`motion.ts`** - Conservative animation rules

**Generation:** CSS variables generated via `style-dictionary` (run `pnpm build:tokens`)

**Usage Pattern:**
```tsx
import { getSurfaceStyles } from "@/lib/design-system";

const glass0 = getSurfaceStyles("glass-0");

<div
  className="border-r border-white/10"
  style={{
    background: glass0.background,
    backdropFilter: glass0.backdropFilter,
  }}
>
```

**Strategy:**
- `/notes/**` routes: Glass-UI + DiceUI (shadcn-compatible registries)
- Rest of app: shadcn/ui with matching tokens
- Both share same surface/intent/motion token system

### State Management

**Zustand Stores:** All in `apps/web/stores/`

**Panel State** (`panel-store.ts`):
- Panel widths (left: 200px, right: 300px defaults)
- Panel visibility toggles
- localStorage persistence
- Version-based migration (current: v3)
- Width constraints: 200px - 600px

**Content State** (`content-store.ts`):
- Selected content ID
- Multi-selection support
- Tree node selection state
- URL + localStorage persistence

**Tree State** (`tree-state-store.ts`):
- Expanded/collapsed node tracking
- Selection persistence across reloads

**Context Menu State** (`context-menu-store.ts`):
- Right-click context menu positioning
- 13 file tree actions (create, rename, delete, copy, cut, paste, etc.)

**Editor Stats** (`editor-stats-store.ts`):
- Word count, character count, reading time
- Updates in real-time from TipTap CharacterCount extension

**Pattern:**
```tsx
import { usePanelStore } from "@/stores/panel-store";
import { useContentStore } from "@/stores/content-store";

const { leftWidth, setLeftWidth, isLeftVisible } = usePanelStore();
const { selectedContentId, setSelectedContentId } = useContentStore();
```

## Key Patterns & Conventions

### Type-Safe API Calls

```tsx
import type { ContentTreeItem } from "@/lib/content/api-types";

const response = await fetch("/api/notes/content/tree");
const tree: ContentTreeItem[] = await response.json();
```

### Database Workflows

**Making Schema Changes:**
1. Edit `apps/web/prisma/schema.prisma`
2. Run `prisma migrate dev --name descriptive_migration_name`
3. Run `prisma generate` to update client types
4. Update seed script if needed: `pnpm db:seed`

**Seeding Database:**
```bash
cd apps/web
pnpm db:seed  # Creates test ContentNode hierarchy with all payload types
```

### Design Token Changes

1. Modify token files in `apps/web/lib/design-system/`
2. Run `pnpm build:tokens` to regenerate CSS variables
3. Restart dev server to see changes

### Testing Server Components

**Method:** Disable JavaScript in browser DevTools

**Verify:**
- Layout, borders, and headers render correctly
- Skeleton states appear before hydration
- No layout shift during progressive enhancement

### TipTap Editor Extensions

**Location:** `apps/web/lib/editor/`

**Core Extensions** (`extensions.ts`):
- `getEditorExtensions()` - Full client-side extensions (includes React components)
- `getServerExtensions()` - Server-safe extensions (API routes, markdown conversion)
- `getViewerExtensions()` - Read-only display mode

**Custom Extensions:**
- **WikiLink** (`wiki-link-node.ts`) - `[[Note Title]]` or `[[slug|Display]]` syntax
  - Autocomplete with `wiki-link-suggestion.tsx`
  - Click navigation to linked notes
  - Renders as blue underlined link
- **Callout** (`callout-extension.ts`) - Obsidian-style callouts `> [!note]`, `> [!warning]`, etc.
  - 6 types: note, tip, warning, danger, info, success
  - Colored borders and icons
  - Collapsible with `> [!note]-` syntax
- **SlashCommands** (`slash-commands.tsx`) - `/` menu for quick insertion
  - Headings, code blocks, tables, callouts, task lists, etc.
  - Keyboard navigation
  - Custom command menu UI
- **TaskListInputRule** (`task-list-input-rule.ts`) - Auto-format `- [ ]` to task list
- **BulletListBackspace** (`bullet-list-backspace.ts`) - Obsidian-style behavior
  - Backspace in empty bullet item → plain text "-"

**Editor Features:**
- Markdown shortcuts: `#` → H1, `##` → H2, `-` → bullet, `1.` → ordered, `> ` → blockquote
- Syntax highlighting: 50+ languages via lowlight
- Auto-save: 2-second debounce with visual indicator (yellow → green)
- External links: `[text](url)` opens in new tab
- Tables: Create, edit, add/delete rows/columns
- Character count: Words, characters, reading time in status bar

**Usage Pattern:**
```tsx
import { getEditorExtensions } from "@/lib/editor/extensions";

const editor = useEditor({
  extensions: getEditorExtensions({
    onWikiLinkClick: (targetTitle) => navigateTo(targetTitle),
    fetchNotesForWikiLink: async (query) => searchNotes(query),
  }),
  content: tiptapJson,
});
```

## Technology Stack

**Core Framework:**
- Next.js 16.0.8 (App Router with React Server Components)
- React 19.2.1
- TypeScript 5.9.3 (strict mode)

**Database:**
- PostgreSQL with Prisma 7.2.0
- Client output: `apps/web/lib/generated/prisma`

**UI & State:**
- Tailwind CSS 4.1.16 with custom design tokens
- Radix UI primitives (unstyled, accessible)
- Zustand 5.0.2 (client state with localStorage)
- Allotment 1.20.3 (resizable panel layout, 3.2KB gzipped)
- react-arborist 3.4.0 (virtualized file tree with drag-and-drop)

**Rich Text:**
- TipTap 3.15.3 (core + starter-kit + 13+ extensions)
- Markdown input rules (headings, lists, blockquotes)
- Custom extensions: Wiki-links, Callouts, Slash commands, Task lists
- Syntax highlighting with lowlight (50+ languages)
- Auto-save with debouncing (2s)

**Build System:**
- Turbo 2.6.0 (monorepo task orchestration)
- style-dictionary 5.1.1 (design token → CSS variables)

## Documentation

**Primary Reference:** `apps/web/docs/notes-feature/`

**Essential Docs:**
- **`00-index.md`** - Master documentation index (30+ linked documents)
- **`HANDOFF.MD`** - AI handoff guide with current implementation state
- **`IMPLEMENTATION-STATUS.md`** - Milestone tracking and progress
- **`01-architecture.md`** - System architecture overview (16.7 KB)
- **`03-database-design.md`** - Complete Prisma v2.0 schema (50.3 KB)
- **`04-api-specification.md`** - All 14 REST endpoints (38.9 KB)
- **`LIQUID-GLASS-DESIGN-SYSTEM.md`** - Design system strategy (18.1 KB)

**Milestone Guides:**
- `M1-FOUNDATION-README.md` - Database & utilities
- `M2-CORE-API-README.md` - API routes
- `M3-UI-FOUNDATION-LIQUID-GLASS.md` - Panel layout
- `M3-SETUP-GUIDE.md` - Step-by-step setup
- `M4-FILE-TREE-IMPLEMENTATION.md` - File tree (complete)
- `M5-EDITOR-TEST-PLAN.md` - TipTap editor testing
- `M6-FINAL-SCOPE.md` - Search, backlinks, editor extensions (in progress)
- `M6-EXTENSION-RECOMMENDATIONS.md` - Editor extension guide

**Architecture Decisions:**
- Server-first rendering for instant visual feedback
- Type-safe polymorph pattern for diverse content types
- Multi-cloud storage support (Cloudflare R2, AWS S3, Vercel Blob)
- Progressive enhancement with JavaScript
- Accessibility-first component design (WCAG 2.1 AA)

## Critical Files Reference

**Configuration:**
- `turbo.json` - Task orchestration
- `pnpm-workspace.yaml` - Workspace packages
- `tsconfig.base.json` - Shared TypeScript config
- `apps/web/prisma/schema.prisma` - Database schema v2.0

**Core Implementation (apps/web):**

```
apps/web/
├── docs/notes-feature/          # 📚 All documentation (READ THESE FIRST)
│   ├── 00-index.md              # Master index
│   ├── HANDOFF.MD               # AI handoff guide
│   ├── IMPLEMENTATION-STATUS.md # Current progress
│   ├── M4-FILE-TREE-IMPLEMENTATION.md
│   ├── M5-EDITOR-TEST-PLAN.md
│   └── M6-FINAL-SCOPE.md
├── app/
│   ├── (authenticated)/notes/   # Notes routes
│   │   ├── layout.tsx           # Server layout wrapper
│   │   ├── page.tsx             # Main notes page
│   │   └── loading.tsx          # Loading skeleton states
│   └── api/notes/               # API routes (14+ endpoints)
│       ├── content/             # Content CRUD
│       ├── storage/             # Storage configs
│       ├── backlinks/           # Backlinks API (M6)
│       └── search/              # Search API (M6)
├── components/notes/
│   ├── ResizablePanels.tsx      # Client panels (Allotment)
│   ├── FileTree.tsx             # React Arborist tree
│   ├── FileNode.tsx             # Individual tree nodes
│   ├── SearchPanel.tsx          # Search UI (M6)
│   ├── BacklinksPanel.tsx       # Backlinks UI (M6)
│   ├── headers/                 # Server-rendered panel headers
│   ├── content/                 # Client-rendered panel content
│   ├── editor/                  # Editor components
│   │   ├── MarkdownEditor.tsx   # TipTap wrapper
│   │   └── TableBubbleMenu.tsx  # Table controls
│   ├── context-menu/            # Right-click menu system
│   └── skeletons/               # Loading skeletons
├── lib/
│   ├── content/                 # Content utilities and types
│   │   ├── types.ts             # Core type system
│   │   ├── api-types.ts         # API request/response types
│   │   ├── markdown.ts          # Markdown conversion
│   │   ├── search-text.ts       # Search extraction
│   │   ├── slug.ts              # Slug generation
│   │   └── outline-extractor.ts # Heading extraction (M6)
│   ├── design-system/           # Liquid Glass design tokens
│   │   ├── surfaces.ts          # Glass-0/1/2
│   │   ├── intents.ts           # Semantic colors
│   │   └── motion.ts            # Animation rules
│   ├── editor/                  # TipTap extensions
│   │   ├── extensions.ts        # Main extensions config
│   │   ├── extensions-server.ts # Server-safe extensions
│   │   ├── wiki-link-node.ts    # [[WikiLink]] extension
│   │   ├── wiki-link-suggestion.tsx # Autocomplete
│   │   ├── callout-extension.ts # Obsidian callouts
│   │   ├── slash-commands.tsx   # / command menu
│   │   ├── task-list-input-rule.ts # - [ ] auto-format
│   │   └── bullet-list-backspace.ts # Obsidian-style backspace
│   └── generated/prisma/        # Generated Prisma client
├── stores/
│   ├── panel-store.ts           # Panel widths/visibility
│   ├── content-store.ts         # Selection state
│   ├── tree-state-store.ts      # Tree expansion state
│   ├── context-menu-store.ts    # Context menu state
│   └── editor-stats-store.ts    # Word count, reading time
└── prisma/
    ├── schema.prisma            # Database schema v2.0
    └── seed.ts                  # Database seed script
```

## Development Workflow

**Before Implementing:**
1. Check `apps/web/docs/notes-feature/IMPLEMENTATION-STATUS.md` for current milestone status
2. Read relevant milestone documentation (e.g., `M4-FILE-TREE-IMPLEMENTATION.md`)
3. Review architecture docs (`01-architecture.md`, `03-database-design.md`)
4. Understand the ContentNode v2.0 polymorph pattern
5. Review existing similar implementations for patterns

**Code Standards:**
- TypeScript strict mode, no `any` types
- Use inline SVG for server component icons (not `lucide-react`)
- `lucide-react` is okay in client components only
- Use `lib/design-system/` tokens for styling
- Follow server/client component split strictly
- Test that server components render without JavaScript
- Update documentation as you implement

**Editor Extension Guidelines:**
- Client-only extensions go in `getEditorExtensions()` (React components, DOM manipulation)
- Server-safe extensions go in `getServerExtensions()` (markdown parsing, API routes)
- Custom extensions follow TipTap v3 patterns (Node, Mark, Extension)
- Use input rules for markdown shortcuts (e.g., `- [ ]` → task list)
- Use keyboard shortcuts sparingly (Cmd+B, Cmd+I, Cmd+K only)
- Avoid conflicting with browser shortcuts

**Current Development Focus (M6):**
1. ✅ Wiki-link extension with autocomplete
2. ✅ Callout extension (Obsidian-style)
3. ✅ Slash commands menu
4. 🔄 Search panel and API
5. 🔄 Backlinks panel and real-time extraction
6. 📋 Outline panel (heading extraction)
7. 📋 Tags system (dedicated table)
