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
npx prisma generate   # Generate Prisma client (outputs to lib/database/generated/prisma)
npx prisma migrate dev --name migration_name  # Create and apply migration
npx prisma studio     # Open Prisma Studio GUI (http://localhost:5555)

# Design System
pnpm build:tokens # Generate CSS variables from design tokens (style-dictionary)
```

**Important:** The build script runs three operations in sequence:
1. `prisma generate` - Generates client in `lib/database/generated/prisma`
2. `pnpm build:tokens` - Generates CSS variables in `app/globals.css`
3. `next build` - Builds the Next.js application

## Content IDE Architecture

The Content IDE is an Obsidian-inspired knowledge management system with a panel-based layout, file tree navigation, rich text editing, and multi-cloud storage support.

**Current Status:** See [STATUS.md](docs/notes-feature/STATUS.md) for real-time status.
- ✅ Epoch 1-4: Foundation complete (Database, API, UI, Editor, Storage, Export - Oct 2025-Feb 2026)
- 🎯 **Active: Sprint 27** (Feb 18 - Mar 3, 2026) - FolderPayload implementation (5 view modes)
- 🚀 **Active: Epoch 5** - Advanced Content Types (Feb-Mar 2026)
  - ✅ ExternalPayload with Open Graph preview (complete)
  - ✅ ContentRole visibility system (complete)
  - ⏳ FolderPayload: List, Grid, Kanban, Table, Timeline views (in progress)
  - 📋 Next: New payload types (Excalidraw, Mermaid, Canvas, etc.)
- 📋 Epoch 6-7: Collaboration & AI Integration (planned)

**Sprint/Epoch Model:** We use a sprint/epoch development model (2-week sprints within 8-12 week strategic epochs).

### Database: ContentNode v2.0 (Hybrid Type-Safe Polymorphism)

**Core Pattern:**
A single `ContentNode` table acts as a universal container for all content types. Each leaf node has exactly one typed payload relation, while folders have no payload.

**Typed Payloads:**
- `NotePayload` - Rich text content (TipTap JSON + markdown)
- `FilePayload` - Binary files with storage metadata (images, PDFs, etc.)
- `HtmlPayload` - Rendered HTML content
- `CodePayload` - Code snippets with syntax highlighting
- `ExternalPayload` - External URL bookmarks with Open Graph preview (Phase 2)

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
- Factory pattern in `lib/infrastructure/storage/factory.ts`
- Individual providers in `lib/infrastructure/storage/r2-provider.ts`, `s3-provider.ts`, `vercel-provider.ts`
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

### Export & Backup System

**Location:** `lib/domain/export/`

**Core Pattern:** TipTap-to-multi-format converter with metadata preservation via sidecar files.

**Supported Formats:**
- **Markdown** - Obsidian-compatible with wiki-links `[[Note]]`, callouts `> [!type]`, YAML frontmatter
- **HTML** - Standalone with embedded CSS, light/dark themes, syntax highlighting
- **JSON** - Lossless TipTap export for re-import (no data loss)
- **Plain Text** - Simple text extraction for search indexing
- **PDF/DOCX** - Stub implementations ready for integration

**Metadata Sidecar System:**
- Preserves semantic information lost in format conversion
- Stores: content ID, tags with colors, wiki-links with target IDs, callout types, timestamps
- Format: `.meta.json` files alongside exports
- Enables accurate re-import with full context restoration

**Bulk Export Features:**
- Export entire vault or filtered subset as ZIP archive
- Preserves folder hierarchy
- Auto-generated README in exports
- Configurable file naming (slug/title/ID)
- Batch processing for performance

**Key Files:**
- `lib/domain/export/converters/` - Format-specific converters
- `lib/domain/export/metadata.ts` - Metadata sidecar generation
- `lib/domain/export/bulk-export.ts` - ZIP archive creation

**Documentation:** `EXPORT-SYSTEM-IMPLEMENTATION.md`, `EXPORT-BACKUP-ARCHITECTURE.md`, `EXPORT-MARKDOWN-SOLUTION.md`

### External Link/Bookmark System (Phase 2)

**Location:** `lib/domain/content/`, `components/content/external/`

**Core Pattern:** Bookmark external URLs with optional Open Graph metadata preview, similar to iMessage/WhatsApp/Slack link previews.

**Key Features:**
- **ExternalPayload** - Stores URL, subtype (website/application), and cached preview metadata
- **Open Graph Fetcher** - Fetches `og:title`, `og:description`, `og:image`, `og:site_name` from external sites
- **Security Controls** - HTTPS-only by default, domain allowlist, "Allow All Domains" override, SSL error handling
- **Smart URL Handling** - Auto-prepends `https://`, allows www redirects (example.com ↔ www.example.com)
- **Preview States** - Full preview (image + metadata), partial preview (metadata only with placeholder), error state
- **Settings Integration** - User-configurable allowlist, preview toggle, HTTP allowance (dev only)

**Open Graph Fetcher (`lib/domain/content/open-graph-fetcher.ts`):**
- Fetches HTML from external URLs with timeout (5s) and size limits (256KB)
- Parses `<meta property="og:*">` tags via regex
- Falls back to standard `<meta name="title">` and `<title>` tags
- Blocks cross-domain redirects (except www variants)
- Handles SSL certificate errors with helpful dev-mode bypass instructions
- Returns `null` on failure (no metadata, timeout, network error)

**Security & Validation:**
- `validateExternalUrl()` - HTTPS-only enforcement (bypass via `allowHttp` setting)
- `isHostnameAllowed()` - Wildcard domain matching (`*.github.io`, `google.com`)
- Default allowlist: 50+ popular domains (Google, GitHub, social media, dev resources, news)
- `allowAllDomains` override for power users (bypasses allowlist entirely)

**UI Components:**
- **ExternalLinkDialog** - Create/edit external links with name and URL fields
- **ExternalLinkViewer** - Display preview card with OG metadata, URL card, action buttons
- **ExternalViewer** - Wrapper for MainPanelContent integration
- **Placeholder Image** - Gradient background with subtle pattern when no OG image available

**API Endpoint:**
```
POST /api/content/external/preview       # Fetch Open Graph metadata
  - Validates user settings (previewsEnabled, allowlist)
  - Fetches OG data with security checks
  - Returns cached metadata or error
```

**Context Menu Integration:**
- "New → External → Website" creates external link
- "New → External → Application" creates external link with subtype
- Edit external link via inline rename (triggers dialog, not text edit)

**Settings Schema (`lib/features/settings/validation.ts`):**
```typescript
external: {
  previewsEnabled: boolean          // Master toggle (default: false)
  allowAllDomains: boolean          // Bypass allowlist (default: false)
  allowlistedHosts: string[]        // Wildcard-supported domains
  allowHttp: boolean                // Allow HTTP URLs (default: false, dev only)
}
```

**Key Implementation Details:**
- Double-click prevention with `useRef` for save button (prevents duplicate toasts)
- Deep merge strategy for partial settings updates
- URL change detection with `useEffect` to refresh preview on edit
- Event-driven architecture: `content-updated` event dispatches preview refetch
- SSL bypass: `NODE_TLS_REJECT_UNAUTHORIZED=0` in `.env.local` for dev (NEVER in production)

**Known Limitations:**
- No iframe embedding (security risk, performance concern)
- No link mutation/workflow integration (simple bookmark only)
- Some sites don't provide OG metadata (shows placeholder)
- SSL certificate errors require dev-mode bypass (some sites have misconfigured certs)

**Documentation:** See plan file at `~/.claude/plans/declarative-seeking-ocean.md` for Phase 2 implementation details

### Authentication System

**Provider:** Custom OAuth implementation with Google Sign-In

**Core Components:**
- `lib/infrastructure/auth/oauth.ts` - Google OAuth token verification
- `lib/infrastructure/auth/types.ts` - User, Account, Session types
- `lib/infrastructure/auth/index.ts` - Barrel export with organized API
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

### API Architecture (20+ Endpoints)

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
GET /api/content/backlinks?contentId={id}      # Get backlinks for a note
GET /api/content/tags                          # List all tags with usage counts
GET /api/content/tags/content/[id]             # Get tags for specific content
POST /api/content/tags                         # Create new tag
```

**Export & Backup:**
```
POST /api/content/export/[id]                  # Single document export (markdown/HTML/JSON/text)
POST /api/content/export/vault                 # Bulk vault export as ZIP
GET  /api/content/export/health                # Export system health check
```

**External Links (Phase 2):**
```
POST /api/content/external/preview             # Fetch Open Graph metadata for URL
  - Security: HTTPS-only, domain allowlist, timeout/size limits
  - Returns: { success, data: { url, metadata, fetchedAt } }
```

**Type Definitions:** `lib/domain/content/api-types.ts`

### Admin Panel

**Location:** `app/api/admin/` with utilities in `lib/domain/admin/`

**Features:**
- User management (list, role changes, deletion)
- Content moderation (view all content, delete)
- Audit logging (track all admin actions with IP/user agent)
- System statistics (user counts, content metrics)

**Access Control:**
- Owner role required for all admin endpoints
- Role hierarchy: owner > admin > member > guest
- Verified via `requireRole("owner")` middleware

**Audit Logging:**
- All admin actions automatically logged to `AuditLog` table
- Tracks: action type, target user/content, IP address, user agent
- Utility: `logAuditAction()` in `lib/domain/admin/audit.ts`

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

**Location:** `lib/design/system/`

**Three Token Categories:**
- **`surfaces.ts`** - Glass-0/1/2 blur levels for glassmorphism effects
- **`intents.ts`** - Semantic colors (primary, danger, success, warning, info)
- **`motion.ts`** - Conservative animation rules

**Generation:** CSS variables generated via `style-dictionary` (run `pnpm build:tokens`)

**Usage Pattern:**
```tsx
import { getSurfaceStyles } from "@/lib/design/system";

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

**Zustand Stores:** All in `state/` (renamed from `stores/`)

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

**Search State** (`search-store.ts`):
- Search query and filters
- Search results caching
- Filter state (tags, content type, date range)
- Recent searches tracking

**Settings State** (`settings-store.ts`):
- User preferences
- Storage provider configuration
- Export settings
- Editor preferences

**Upload Settings** (`upload-settings-store.ts`):
- Upload preferences (folder destination, naming)
- Default file type handling
- Auto-upload behavior

**Left Panel State** (`left-panel-view-store.ts`, `left-panel-collapse-store.ts`):
- Active view (tree/search/tags)
- Collapse/expand state per section
- View history and navigation

**Pattern:**
```tsx
import { usePanelStore } from "@/state/panel-store";
import { useContentStore } from "@/state/content-store";

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

### Menu Positioning Pattern (Portal + Boundary Detection)

**Problem:** Context menus and dropdowns can clip at viewport edges.

**Solution:** Use positioning engine with portal rendering in `lib/core/menu-positioning.ts`:

```typescript
import { calculateMenuPosition } from "@/lib/core/menu-positioning";

// 1. Portal rendering (bypasses parent overflow)
const menuContent = <div ref={menuRef}>...</div>;
return createPortal(menuContent, document.body);

// 2. Two-phase rendering (measure then position)
const menuStyle = !menuPosition
  ? { visibility: "hidden" as const } // Phase 1: Hidden to measure
  : { left: `${menuPosition.x}px`, top: `${menuPosition.y}px` }; // Phase 2: Positioned

// 3. Boundary-aware calculation
useEffect(() => {
  const menuRect = menuRef.current.getBoundingClientRect();
  const calculatedPosition = calculateMenuPosition({
    triggerPosition: { x: clickX, y: clickY },
    menuDimensions: { width: menuRect.width, height: menuRect.height },
    preferredPlacementX: "right", // Will flip to "left" if clipping
    preferredPlacementY: "bottom", // Will flip to "top" if clipping
  });
  setMenuPosition(calculatedPosition);
}, [isOpen]);
```

**Strategy:**
- **Flip**: Automatically reverse direction when hitting viewport edge (bottom→top, right→left)
- **Shift**: Micro-adjust position if flipping isn't enough
- **Max-height**: Enable scrolling when menu exceeds available space

**When to Use:**
- Context menus (right-click)
- Dropdown menus (button-triggered)
- Tooltips, popovers, flyouts
- Any menu that might appear near viewport edges

**Examples:**
- `components/content/context-menu/ContextMenu.tsx` - Right-click context menu
- `components/content/headers/LeftSidebarHeaderActions.tsx` - "+" dropdown menu

### Type-Safe API Calls

```tsx
import type { ContentTreeItem } from "@/lib/domain/content/api-types";

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

1. Modify token files in `lib/design/system/`
2. Run `pnpm build:tokens` to regenerate CSS variables
3. Restart dev server to see changes

### Testing Server Components

**Method:** Disable JavaScript in browser DevTools

**Verify:**
- Layout, borders, and headers render correctly
- Skeleton states appear before hydration
- No layout shift during progressive enhancement

### Zustand Store Patterns

**Location:** All stores in `state/`

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

**Location:** `lib/domain/editor/`

**Core Extensions** (`extensions-client.ts`):
- `getEditorExtensions()` - Full client-side extensions (includes React components)
- `getServerExtensions()` - Server-safe extensions (API routes, markdown conversion)
- `getViewerExtensions()` - Read-only display mode

**Custom Extensions** (in `extensions/` subdirectory):
- **WikiLink** (`wiki-link.ts`) - `[[Note Title]]` or `[[slug|Display]]` syntax
  - Autocomplete with `wiki-link-suggestion.tsx`
  - Click navigation to linked notes
  - Renders as blue underlined link
- **Callout** (`callout.ts`) - Obsidian-style callouts `> [!note]`, `> [!warning]`, etc.
  - 6 types: note, tip, warning, danger, info, success
  - Colored borders and icons
  - Collapsible with `> [!note]-` syntax
- **SlashCommands** (in `commands/slash-commands.tsx`) - `/` menu for quick insertion
  - Headings, code blocks, tables, callouts, task lists, etc.
  - Keyboard navigation
  - Custom command menu UI
- **TaskListInputRule** (`task-list.ts`) - Auto-format `- [ ]` to task list
- **BulletListBackspace** (`bullet-list.ts`) - Obsidian-style behavior
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
import { getEditorExtensions } from "@/lib/domain/editor";

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
- Client output: `lib/database/generated/prisma`

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

**Start Here:** `docs/notes-feature/00-START-HERE.md` - Task-oriented documentation index

**Current Work (Sprint/Epoch):**
- `STATUS.md` - Single source of truth for current status
- `work-tracking/CURRENT-SPRINT.md` - Sprint 27 details
- `work-tracking/BACKLOG.md` - Prioritized work items
- `work-tracking/epochs/epoch-5-advanced-content-types.md` - Active epoch plan

**Core Architecture (Timeless):**
- `core/01-architecture.md` - System architecture overview
- `core/03-database-design.md` - Complete Prisma v2.0 schema
- `core/04-api-specification.md` - All 20+ REST endpoints
- `core/05-security-model.md` - Authentication and authorization
- `core/06-ui-components.md` - Component specifications

**Features (What Exists):**
- `features/README.md` - Feature catalog by capability
- `features/database/` - ContentNode system, typed payloads
- `features/editor/` - TipTap extensions, wiki-links, callouts
- `features/storage/` - Multi-cloud, two-phase upload
- `features/export/` - Format conversion, metadata sidecars
- `features/content-types/` - Notes, files, external links, folders

**Implementation Guides:**
- `guides/database/` - Prisma workflows, migrations, checklists
- `guides/editor/` - TipTap extensions, schema evolution
- `guides/ui/` - Liquid Glass design, React DND integration
- `guides/storage/` - File storage, config examples

**Patterns & Troubleshooting:**
- `patterns/` - Architectural patterns and best practices
- `troubleshooting/` - Problem-solution guides
- `reference/` - Quick lookup references

**Historical Context:**
- `work-tracking/history/epoch-1-foundation.md` - Database, API, UI (Oct-Dec 2025)
- `work-tracking/history/epoch-2-content-experience.md` - Editor, navigation (Dec 2025-Jan 2026)
- `work-tracking/history/epoch-3-media-storage.md` - File management, multi-cloud (Jan-Feb 2026)
- `work-tracking/history/epoch-4-export-extensibility.md` - Data portability (Feb 2026)

**Archived Milestones:**
- `archive/milestones/M1-M5/` - Foundation, API, UI, File Tree, Editor
- `archive/milestones/M6/` - Search, Tags, Extensions
- `archive/milestones/M7/` - Storage, Media Viewers, Office Docs
- `archive/milestones/M8/` - Export System

**Documentation Organization:**
- Reorganized from 92 milestone-based docs → ~60 capability-based docs
- Sprint/epoch model replaces milestone-centric tracking
- Features documented by capability (what exists) not timeline (when built)
- Clear entry points for different tasks and audiences

## Critical Files Reference

**Quick Navigation:**
- **Docs:** `docs/notes-feature/00-START-HERE.md` - Task-oriented documentation index
- **Current Work:** `docs/notes-feature/STATUS.md` - Single source of truth for status
- **Database:** `prisma/schema.prisma` - ContentNode v2.0 schema
- **API Routes:** `app/api/content/` - 20+ REST endpoints
- **Components:** `components/content/` - UI components (tree, editor, panels, external)
- **State Stores:** `state/` - 15 Zustand stores (renamed from `stores/`)
- **Design System:** `lib/design/system/` - Liquid Glass tokens
- **Editor Extensions:** `lib/domain/editor/` - TipTap custom extensions
- **Export System:** `lib/domain/export/` - Multi-format converters
- **External Links:** `lib/domain/content/` - Open Graph fetcher, validation
- **Type Definitions:** `lib/domain/content/api-types.ts` - API interfaces

**Key Directories:**
```
Digital-Garden/
├── docs/notes-feature/          # All documentation (start here)
├── app/api/content/             # API routes
├── app/(authenticated)/content/ # Content UI routes
├── components/content/          # UI components
├── lib/                         # Organized by conceptual layer (see below)
├── state/                       # State management (renamed from stores/)
├── prisma/                      # Database schema + seed
└── archive/                     # Archived apps (not in build)
```

**lib/ Directory Structure (Conceptual Layers):**
```
lib/
├── core/                        # Foundational utilities
│   ├── utils.ts                 # Tailwind cn(), 91+ imports
│   ├── deep-merge.ts            # Recursive object merging
│   ├── glass-utils.ts           # Glassmorphism utilities
│   ├── hover-effects.ts         # CVA hover variants
│   └── menu-positioning.ts      # Viewport-aware positioning
├── database/                    # Database client and generated code
│   ├── client.ts                # Prisma singleton (renamed from prisma.ts)
│   └── generated/prisma/        # Generated Prisma client (output path)
├── domain/                      # Business logic modules
│   ├── admin/                   # Admin panel utilities
│   ├── content/                 # ContentNode v2.0 utilities (31 imports)
│   │   ├── open-graph-fetcher.ts    # Open Graph metadata fetcher
│   │   └── external-validation.ts   # URL validation for external links
│   ├── editor/                  # TipTap extensions (2 imports)
│   │   ├── index.ts             # Barrel export
│   │   ├── extensions-client.ts # Client-side extensions
│   │   ├── extensions-server.ts # Server-side extensions
│   │   ├── extensions/          # Individual extension files
│   │   └── commands/            # Slash commands
│   ├── export/                  # Multi-format export system
│   │   ├── converters/          # Format-specific converters
│   │   ├── metadata.ts          # Metadata sidecar generation
│   │   └── bulk-export.ts       # ZIP archive creation
│   └── search/                  # Search filters (4 imports)
├── infrastructure/              # External service integrations
│   ├── auth/                    # OAuth, sessions, middleware (55 imports)
│   │   └── index.ts             # Barrel export
│   ├── crypto/                  # Encryption utilities
│   ├── media/                   # File processing (2 imports)
│   └── storage/                 # Multi-cloud abstraction (8 imports)
├── features/                    # Feature-specific modules
│   ├── navigation/              # Branch builder + navigation
│   ├── office/                  # Blank document generator
│   └── settings/                # User settings CRUD
│       └── index.ts             # Barrel export
└── design/                      # Design system
    ├── system/                  # Liquid Glass design tokens (23 imports)
    └── integrations/            # Third-party UI utilities (48 imports)
```

## Development Workflow

**Before Implementing:**
1. Check `docs/notes-feature/STATUS.md` for current sprint/epoch status
2. Read `docs/notes-feature/work-tracking/CURRENT-SPRINT.md` for active work items
3. Review relevant feature docs in `docs/notes-feature/features/`
4. Check architecture docs in `docs/notes-feature/core/`
5. Understand the ContentNode v2.0 polymorph pattern
6. Review existing similar implementations for patterns

**Maintaining STATUS.md (Critical for Sprint/Epoch Tracking):**

AI assistants MUST update `docs/notes-feature/STATUS.md` when work is completed or status changes. This is the **single source of truth** for current development status.

**When to Update:**
- ✅ After completing a work item or feature
- ✅ When starting new work (move from Planned → In Progress)
- ✅ When encountering blockers
- ✅ At the end of a sprint (archive to history)
- ✅ When significant progress is made (update percentages)

**What to Update:**

1. **Frontmatter** (always update `last_updated`):
```yaml
---
last_updated: 2026-02-19  # ← Update to current date
current_epoch: 5
current_sprint: 27
---
```

2. **Current Work Section**:
```markdown
**Progress**: 25% complete (Day 3 of 14)  # ← Update progress

**Work Items**:
- ✅ Completed: List view component      # ← Change 🟡 to ✅
- 🟡 In Progress: Grid view component (70% complete)  # ← Update %
- ⚪ Planned: Kanban view component      # ← Keep until started
```

3. **Recent Completions** (add new entries at the top):
```markdown
**Feb 19, 2026**: List View Component Complete
- ✅ Sort controls (name, date, type)
- ✅ File type icons
- ✅ Context menu integration
- ✅ Keyboard navigation

**Feb 16, 2026**: M9 Phase 2 Complete  # ← Keep last 30 days only
```

4. **Known Issues & Blockers** (add/remove as needed):
```markdown
### Active Blockers
- **Grid layout issues** (High priority)
  - Problem: Responsive grid breaks on mobile
  - Mitigation: Investigating CSS Grid vs Flexbox approach
  - ETA: Feb 20, 2026
```

**What NOT to Change:**
- ❌ Don't modify historical epoch sections
- ❌ Don't remove "Recent Completions" less than 30 days old
- ❌ Don't change sprint duration or goals mid-sprint
- ❌ Don't update CURRENT-SPRINT.md from STATUS.md (they sync separately)

**Update Pattern:**
```bash
# 1. Read current STATUS.md
# 2. Update relevant sections (frontmatter, work items, completions)
# 3. Keep format consistent (emojis: ✅ 🟡 ⚪)
# 4. Add to Recent Completions (top of list)
# 5. Preserve all other content unchanged
```

**Example Update** (after completing work):
```markdown
# Before
**Work Items**:
- 🟡 In Progress: List view component (60% complete)

# After
**Work Items**:
- ✅ Completed: List view component

## Recent Completions (add new entry)
**Feb 19, 2026**: List View Component Complete
- ✅ Sort controls implemented
- ✅ File type icons rendered
- ✅ Context menu integrated
```

**Sync with CURRENT-SPRINT.md:**
- STATUS.md shows **summary** of current work
- CURRENT-SPRINT.md shows **detailed** work item tracking
- Update BOTH when work items change status
- CURRENT-SPRINT.md has daily standup notes; STATUS.md does not

**Backlog Management (Sprint Workflow):**

When a sprint ends or work items aren't completed, AI assistants must properly backlog incomplete work:

**When to Backlog:**
- ✅ Sprint completes with core goals met but advanced features incomplete
- ✅ Scope reduction mid-sprint (simpler solution found)
- ✅ Work items no longer align with sprint goals
- ⚠️ **Don't backlog** if core sprint goal unmet (carry forward as high priority)

**How to Backlog (4-Step Process):**

1. **Update CURRENT-SPRINT.md**:
   - Mark completed items with ✅ in "Completed Work Items" section
   - Move incomplete items to "Backlogged to Sprint X" section
   - Add context explaining why work was backlogged (e.g., "Core views delivered, advanced features deferred as nice-to-have")
   - Update sprint status to "complete" if core goals met
   - Document in retrospective (what went well, what could improve)

2. **Update BACKLOG.md**:
   - Add backlogged items to **top** of next sprint section
   - Include "Backlogged from Sprint X" subsection with context
   - Preserve original story point estimates
   - Use labels: `advanced feature`, `enhancement`, `nice-to-have`, `blocked`

3. **Update STATUS.md**:
   - Add completed work to "Recent Completions" (top of list)
   - Update "Active Sprint" section to show "✅ COMPLETE" status
   - List backlogged items under sprint summary with ⚪ emoji
   - Update frontmatter `last_updated` date

4. **Document Retrospective**:
   - Explain why work was backlogged (over-commitment, scope change, etc.)
   - Identify what went well vs what could improve
   - Create action items for next sprint planning

**Philosophy**: Ship working core features over incomplete comprehensive features. It's better to deliver 3 working folder views than 5 half-baked views.

**Example** (Sprint 27):
- **Core Goal**: Implement folder views ✅ Achieved
- **Completed**: List, Grid, Kanban views (11 pts)
- **Backlogged**: Table, Timeline, Persistence, Switcher (12 pts) → Sprint 28
- **Decision**: Mark sprint COMPLETE, backlog advanced features

**See Full Guide**: `docs/notes-feature/work-tracking/SPRINT-BACKLOG-GUIDE.md`

**Code Standards:**
- TypeScript strict mode, no `any` types
- Use inline SVG for server component icons (not `lucide-react`)
- `lucide-react` is okay in client components only
- Use `lib/design/system/` tokens for styling
- Follow server/client component split strictly
- Test that server components render without JavaScript
- Import from barrel exports when available (`lib/domain/editor`, `lib/infrastructure/auth`, `lib/features/settings`)
- Update documentation as you implement (including STATUS.md for work items)

**Editor Extension Guidelines:**
- Client-only extensions go in `getEditorExtensions()` (React components, DOM manipulation)
- Server-safe extensions go in `getServerExtensions()` (markdown parsing, API routes)
- Custom extensions follow TipTap v3 patterns (Node, Mark, Extension)
- Use input rules for markdown shortcuts (e.g., `- [ ]` → task list)
- Use keyboard shortcuts sparingly (Cmd+B, Cmd+I, Cmd+K only)
- Avoid conflicting with browser shortcuts

**Current Status & Next Steps:**
- See `docs/notes-feature/STATUS.md` for real-time status and known limitations
- ✅ **Sprint 27 COMPLETE** (Feb 18, 2026 - Completed early)
  - ✅ Core folder views: List, Grid, Kanban (shipped)
  - 📦 Advanced features backlogged to Sprint 28: Table, Timeline, Persistence, Switcher
  - Keyboard shortcuts for view switching
- 🚀 **Epoch 5** (Feb-Mar 2026): Advanced Content Types
  - ⏳ FolderPayload with 5 views (Sprint 27 - active)
  - 📋 New payload types (Sprint 28 - planned): Excalidraw, Mermaid, Canvas, Whiteboard, PDF
- 📋 **Epoch 6-7** (Planned): Collaboration & AI Integration
- **Known Limitations:**
  - PDF/DOCX Export: Stub implementations (need Puppeteer/docx library)
  - External Links: Some SSL certificate errors (dev bypass available)
  - Outline Panel: Active heading detection needs intersection observer
  - Editor: Scroll-to-heading needs editor ref implementation
