# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a **Next.js 16 application** - Digital Garden Content IDE, an Obsidian-inspired knowledge management system.

**Archived Applications** (in `/archive`, not actively developed):
- `archive/web-amino` - Amino acid learning platform
- `archive/open-notes` - Documentation and research repository

**Configuration Files:**
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `next.config.ts` - Next.js configuration
- `prisma/schema.prisma` - Database schema

## Environment Setup

**Required Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string (Neon, local Postgres, or Prisma Postgres)
- `STORAGE_ENCRYPTION_KEY` - 32-byte hex key for encrypting storage credentials
- Optional: Google OAuth credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- Optional: Storage provider credentials (R2, S3, or Vercel Blob)

**First-Time Setup:**
```bash
# 1. Install dependencies
pnpm install

# 2. Set up environment variables
cp .env.example .env.local  # Copy and edit with your database URL

# 3. Generate Prisma client
npx prisma generate

# 4. Run migrations and seed database
npx prisma migrate reset --force  # Development only!

# 5. Start development server
pnpm dev
```

## Development Commands

```bash
# Development
pnpm dev          # Start Next.js dev server (http://localhost:3000)
pnpm build        # Generate Prisma client + design tokens + build Next.js
pnpm start        # Start production server
pnpm lint         # Run ESLint

# Database operations
pnpm db:seed      # Seed database with ContentNode v2.0 test data
npx prisma generate   # Generate Prisma client (outputs to lib/generated/prisma)
npx prisma migrate dev --name migration_name  # Create and apply migration
npx prisma studio     # Open Prisma Studio GUI (http://localhost:5555)

# Design System
pnpm build:tokens # Generate CSS variables from design tokens (style-dictionary)
```

**Important:** The build script runs three operations in sequence:
1. `prisma generate` - Generates client in `lib/generated/prisma`
2. `pnpm build:tokens` - Generates CSS variables in `app/globals.css`
3. `next build` - Builds the Next.js application

## Content IDE Architecture

The Content IDE is an Obsidian-inspired knowledge management system with a panel-based layout, file tree navigation, rich text editing, and multi-cloud storage support.

**Current Status:** See [IMPLEMENTATION-STATUS.md](docs/notes-feature/IMPLEMENTATION-STATUS.md) for detailed progress.
- ✅ M1-M6: Database, API, UI foundation, file tree, editor, search, tags (complete)
- 🚀 M7: File management & media (active)

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

**Schema Location:** `prisma/schema.prisma`

### Storage Architecture: Multi-Cloud Provider System

**Core Pattern:** Provider abstraction layer supports multiple cloud storage backends with encrypted credential storage.

**Supported Providers:**
- **Cloudflare R2** - Primary (S3-compatible, no egress fees)
- **AWS S3** - Traditional cloud storage
- **Vercel Blob** - Vercel-native storage

**Provider Implementation:**
- Factory pattern in `lib/storage/factory.ts`
- Individual providers in `lib/storage/r2-provider.ts`, `s3-provider.ts`, `vercel-provider.ts`
- Unified interface for upload, download, delete operations
- Presigned URLs for secure file access
- Credential encryption with `STORAGE_ENCRYPTION_KEY`

**Prefix Strategy (same bucket):**
```
bucket/
├── uploads/{userId}/{uuid}.{ext}           # Original files
├── uploads/{userId}/{uuid}-thumb-150.{ext} # Small thumbnails
├── uploads/{userId}/{uuid}-thumb-300.{ext} # Large thumbnails
└── backups/{userId}/{uuid}/{timestamp}     # Versioned backups
```

**Configuration:** `StorageProviderConfig` model splits metadata (bucket, region) from encrypted credentials (access keys)

### Authentication System

**Provider:** Custom OAuth implementation with Google Sign-In

**Core Components:**
- `lib/auth/oauth.ts` - Google OAuth token verification
- `lib/auth/types.ts` - User, Account, Session types
- Database models: `User`, `Account`, `Session`

**Authentication Flow:**
1. User signs in with Google OAuth
2. Backend verifies ID token with `google-auth-library`
3. Creates/updates User and Account records
4. Issues session token
5. Subsequent requests authenticated via session

**Environment Variables:**
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret

**Note:** Google Drive integration planned but not yet implemented (see M7+ roadmap)

### API Architecture (14+ Endpoints)

All endpoints are in `app/api/content/`:

**Content CRUD:**
```
GET/POST     /api/content/content              # List/create content
GET/PATCH/DELETE /api/content/content/[id]     # Individual content operations
GET          /api/content/content/tree         # Hierarchical tree structure
POST         /api/content/content/move         # Drag-and-drop reordering
```

**Two-Phase File Upload:**
```
POST /api/content/content/upload/initiate      # Get presigned URL
POST /api/content/content/upload/finalize      # Confirm upload completion
```

**Storage Configuration:**
```
GET/POST     /api/content/storage              # List/create storage configs
GET/PATCH/DELETE /api/content/storage/[id]     # Individual config operations
```

**Search, Backlinks & Tags:**
```
GET /api/content/search                        # Full-text search with filters
GET /api/content/backlinks                     # Get backlinks for a note
GET /api/content/tags                          # List all tags with usage counts
GET /api/content/tags/content/[id]             # Get tags for specific content
POST /api/content/tags                         # Create new tag
```

**Type Definitions:** `lib/content/api-types.ts`

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

**Location:** `lib/design-system/`

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
- `/content/**` routes: Glass-UI + DiceUI (shadcn-compatible registries)
- Rest of app: shadcn/ui with matching tokens
- Both share same surface/intent/motion token system

### State Management

**Zustand Stores:** All in `stores/`

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

**Outline State** (`outline-store.ts`):
- Hierarchical heading structure extracted from TipTap JSON
- Active heading tracking
- Click-to-scroll support

**Pattern:**
```tsx
import { usePanelStore } from "@/stores/panel-store";
import { useContentStore } from "@/stores/content-store";

const { leftWidth, setLeftWidth, isLeftVisible } = usePanelStore();
const { selectedContentId, setSelectedContentId } = useContentStore();
```

## Key Patterns & Conventions

### Critical: Check Existing Components Before Implementing

**ALWAYS search for existing implementations before adding UI elements:**

```bash
# Check for similar components
glob "**/*Sidebar*.tsx"
glob "**/*Header*.tsx"
glob "**/*Panel*.tsx"

# Search for existing patterns
grep -r "useState.*Tab" components
grep -r "lucide-react" components/content/headers
```

**Component Architecture Pattern (Both Sidebars):**
```
Sidebar Wrapper (Client Component)
  ├─ State Management: activeTab, triggers, etc.
  ├─ SidebarHeader (Client Component) ← receives props
  └─ SidebarContent (Client Component) ← receives props
```

**Key Rules:**
1. **Wrapper is CLIENT** - Manages shared state between header and content
2. **Prop Drilling** - Pass state down explicitly (no hidden stores)
3. **Inline SVG** - Use inline SVG icons (not `lucide-react`) for server/client flexibility
4. **Consistency** - Match patterns from similar components (Left vs Right Sidebar)

**Why This Matters:**
- Architectural consistency > Individual optimizations
- Easier to maintain and refactor
- Prevents duplicate implementations
- Clear data flow

**See:** `docs/notes-feature/ARCHITECTURE-RIGHT-SIDEBAR-REFACTOR.md`

### Type-Safe API Calls

```tsx
import type { ContentTreeItem } from "@/lib/content/api-types";

const response = await fetch("/api/content/content/tree");
if (!response.ok) {
  throw new Error(`API error: ${response.status}`);
}
const tree: ContentTreeItem[] = await response.json();
```

**Error Handling Pattern:**
- Always check `response.ok` before parsing JSON
- API routes return consistent error format: `{ error: string, details?: any }`
- Use try-catch for network errors
- Display user-friendly error messages via toast or inline UI

### Database Workflows

**🚨 BEFORE ANY DATABASE CHANGE:**
- [DATABASE-CHANGE-CHECKLIST.md](docs/notes-feature/DATABASE-CHANGE-CHECKLIST.md) - **MANDATORY checklist for all schema changes** 👈 **USE THIS!**

**📘 Complete Guides:**
- [PRISMA-DATABASE-GUIDE.md](docs/notes-feature/PRISMA-DATABASE-GUIDE.md) - Comprehensive database management reference
- [PRISMA-MIGRATION-GUIDE.md](docs/notes-feature/PRISMA-MIGRATION-GUIDE.md) - Migration drift resolution & workflows

**Quick Reference - Making Schema Changes (RECOMMENDED):**

**Development Workflow (Use This!):**
```bash
# From repository root
# 1. Edit prisma/schema.prisma
# 2. Push changes directly (no migration file, no data loss)
npx prisma db push
# 3. Regenerate client
npx prisma generate
```

**Production Workflow (When Ready for Prod):**
```bash
# From repository root
# 1. Create migration file
npx prisma migrate dev --name descriptive_migration_name --create-only
# 2. Review SQL in prisma/migrations/
# 3. Deploy to production
npx prisma migrate deploy
```

**Critical Rules:**
- ✅ Use `db push` for development (fast, no data loss)
- ✅ Use `migrate dev` only for production-ready changes
- ✅ Always run `prisma generate` after schema changes
- ✅ Use `migrate resolve` to fix drift (not `migrate reset`)
- ❌ Never use `migrate reset` in production (deletes all data!)
- ❌ Never use `migrate dev` when drift is detected (use `db push`)

**Seeding Database:**
```bash
# From repository root
pnpm db:seed  # Creates test ContentNode hierarchy with all payload types
```

**Troubleshooting:**
```bash
# Prisma client not found after schema change?
npx prisma generate
# Then restart TypeScript server in IDE

# Migration drift detected?
npx prisma db push  # Use this instead of migrate dev
# See PRISMA-MIGRATION-GUIDE.md for details

# Database connection issues?
npx prisma studio  # Open database GUI to debug
```

### Design Token Changes

1. Modify token files in `lib/design-system/`
2. Run `pnpm build:tokens` to regenerate CSS variables
3. Restart dev server to see changes

### Testing Server Components

**Method:** Disable JavaScript in browser DevTools

**Verify:**
- Layout, borders, and headers render correctly
- Skeleton states appear before hydration
- No layout shift during progressive enhancement

### Zustand Store Patterns

**Location:** All stores in `stores/`

**Standard Pattern:**
```tsx
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MyStore {
  // State
  value: string;
  // Actions
  setValue: (value: string) => void;
}

export const useMyStore = create<MyStore>()(
  persist(
    (set) => ({
      value: '',
      setValue: (value) => set({ value }),
    }),
    {
      name: 'my-store',
      version: 1,
    }
  )
);
```

**Key Principles:**
- Use `persist` middleware for localStorage sync
- Version your stores (enables migrations)
- Actions are functions that call `set()`
- No nested objects in state (keep flat for better re-renders)
- Store migrations handled in `migrate` function when version changes

### TipTap Editor Extensions

**Location:** `lib/editor/`

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
- Client output: `lib/generated/prisma`

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

**Start Here:** `docs/notes-feature/00-index.md` - Master documentation index

**Critical Architecture:**
- `IMPLEMENTATION-STATUS.md` - Current progress and milestone tracking
- `01-architecture.md` - System architecture overview
- `03-database-design.md` - Complete Prisma v2.0 schema
- `04-api-specification.md` - All 14+ REST endpoints
- `LIQUID-GLASS-DESIGN-SYSTEM.md` - Design system strategy
- `ARCHITECTURE-RIGHT-SIDEBAR-REFACTOR.md` - Component architecture patterns

**Implementation Guides:**
- `M1-FOUNDATION-README.md` - Database & utilities setup
- `M2-CORE-API-README.md` - API routes implementation
- `M3-UI-FOUNDATION-LIQUID-GLASS.md` - Panel layout & design system
- `M4-FILE-TREE-IMPLEMENTATION.md` - File tree with drag-and-drop
- `M5-EDITOR-TEST-PLAN.md` - TipTap editor integration
- `M6-FINAL-SCOPE.md` - Search, backlinks, editor extensions
- `M6-EXTENSION-RECOMMENDATIONS.md` - Custom TipTap extensions
- `M7-STORAGE-ARCHITECTURE-V2.md` - Multi-cloud storage system architecture
- `M7-DRAG-DROP-UPLOAD.md` - File upload with drag-and-drop
- `M7-MEDIA-VIEWERS-IMPLEMENTATION.md` - Image/video/audio viewers
- `M7-OFFICE-DOCUMENTS-IMPLEMENTATION.md` - PDF, Word, Excel support

**Additional docs:** See `00-index.md` for complete catalog of 30+ documents.

## Critical Files Reference

**Quick Navigation:**
- **Docs:** `docs/notes-feature/` - Start with 00-index.md
- **Database:** `prisma/schema.prisma` - ContentNode v2.0 schema
- **API Routes:** `app/api/content/` - 14+ REST endpoints
- **Components:** `components/content/` - UI components (tree, editor, panels)
- **State Stores:** `stores/` - Zustand stores (8+ stores)
- **Design System:** `lib/design-system/` - Liquid Glass tokens
- **Editor Extensions:** `lib/editor/` - TipTap custom extensions
- **Type Definitions:** `lib/content/api-types.ts` - API interfaces

**Key Directories:**
```
Digital-Garden/
├── docs/notes-feature/          # All documentation (start here)
├── app/api/content/             # API routes
├── app/(authenticated)/content/ # Content UI routes
├── components/content/          # UI components
├── lib/content/                 # Content utilities
├── lib/design-system/           # Design tokens
├── lib/editor/                  # TipTap extensions
├── stores/                      # State management
├── prisma/                      # Database schema + seed
└── archive/                     # Archived apps (not in build)
```

## Development Workflow

**Before Implementing:**
1. Check `docs/notes-feature/IMPLEMENTATION-STATUS.md` for current milestone status
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

**Known Issues & Next Steps:**
- See `IMPLEMENTATION-STATUS.md` for detailed known limitations per milestone
- ✅ M6 is 100% complete (tags system finished Jan 20, 2026)
- Minor TODOs: scroll-to-heading (needs editor ref), active heading auto-detection (intersection observer)
- 🚀 M7 (File management & media) is now active priority
