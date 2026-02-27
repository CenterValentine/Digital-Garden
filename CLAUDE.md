# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**Next.js 16 application** — Digital Garden Content IDE, an Obsidian-inspired knowledge management system with panel-based layout, rich text editing, and multi-cloud storage.

**Archived apps** in `/archive` (not in build): `web-amino` (amino acid learning), `open-notes` (documentation).

## Development Commands

```bash
pnpm dev              # Start dev server (http://localhost:3000)
pnpm build            # prisma generate → build:tokens → next build
pnpm start            # Production server
pnpm lint             # ESLint
pnpm build:tokens     # Regenerate CSS variables from design tokens
pnpm db:seed          # Seed database with test ContentNode data
npx prisma generate   # Regenerate Prisma client (lib/database/generated/prisma)
npx prisma db push    # Push schema changes in dev (no migration file)
npx prisma studio     # Database GUI (http://localhost:5555)
```

**No test runner is configured.** Verification is manual: `pnpm build` must pass, then smoke-test in browser.

**Build pipeline:** `pnpm build` runs three steps sequentially: `prisma generate` → `pnpm build:tokens` (style-dictionary) → `next build`.

**Vercel build** uses `--webpack` flag explicitly. Local dev uses Next.js default (Turbopack).

## Environment Setup

```bash
cp .env.example .env.local    # Then edit with your values
npx prisma generate           # Generate Prisma client
npx prisma migrate reset --force  # Dev only! Creates tables + seeds
pnpm dev
```

**Required:** `DATABASE_URL` (PostgreSQL), `STORAGE_ENCRYPTION_KEY` (32-byte hex)
**Optional:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, storage provider credentials (R2/S3/Vercel Blob)

## Architecture

### Core Data Model: ContentNode v2.0

Single `ContentNode` table as universal container. Each leaf node has exactly one typed payload relation; folders have no payload.

**Payloads:** `NotePayload` (TipTap JSON), `FilePayload` (binary + storage metadata), `HtmlPayload`, `CodePayload`, `ExternalPayload` (URL + Open Graph metadata)

**Key columns:** `parentId` (hierarchy), `displayOrder` (ordering), `deletedAt`/`deletedBy` (soft delete), `customIcon`/`iconColor`, `searchText` (full-text search)

**Schema:** `prisma/schema.prisma`

### UI Architecture: Server/Client Split

**Critical pattern:** Server components for instant visual feedback, client components for interactivity.

- **Server components:** Panel headers, borders, layout structure, skeleton states. Use inline SVG for icons (NOT `lucide-react`).
- **Client components:** File tree (`react-arborist`), resizable panels (`allotment`), state (`zustand`), drag-and-drop.

```tsx
// Server Component pattern
<div>
  <Header />  {/* Server: instant render */}
  <Suspense fallback={<Skeleton />}>
    <Content />  {/* Client: progressive hydration */}
  </Suspense>
</div>
```

### Panel Layout

Three-panel layout managed by `ResizablePanels.tsx` using Allotment:
- **Left sidebar:** File tree, search, tags (`LeftSidebar.tsx`)
- **Main panel:** Content editor/viewer with toolbar (`MainPanel.tsx` → `MainPanelContent.tsx`)
- **Right sidebar:** Backlinks, outline, tags tabs (`RightSidebar.tsx`)

Both sidebars follow the same pattern:
```
Sidebar Wrapper (Client) — manages shared state
  ├─ SidebarHeader (Client) ← receives props
  └─ SidebarContent (Client) ← receives props
```

### Tool Surfaces System (Sprint 29)

Declarative registry mapping tools to UI surfaces with content-type filtering.

**Location:** `lib/domain/tools/`

- `types.ts` — `ContentType`, `ToolSurface` ("toolbar" | "toolbelt" | "sidebar-tab"), `ToolDefinition`, `ToolInstance`
- `registry.ts` — Static `TOOL_REGISTRY` array + `queryTools({ surface, contentType })` filter
- `context.tsx` — `ToolSurfaceProvider` wraps MainPanelContent; `useRegisterToolHandler()` for child components

**Surfaces:**
- **toolbar** — ContentToolbar buttons (export, copy link). Rendered in `components/content/toolbar/ContentToolbar.tsx`.
- **toolbelt** — BubbleMenu formatting buttons (bold, italic, etc.). BubbleMenu reads from registry at module level (no hooks — prevents TipTap plugin lifecycle interference).
- **sidebar-tab** — Right sidebar tabs (backlinks, outline, tags, chat). Filtered by content type via Zustand store.

**Key constraint:** `useContext` only sees PARENT providers. The component rendering `ToolSurfaceProvider` passes handlers via a `handlers` prop, not `useRegisterToolHandler`.

**BubbleMenu fix:** All buttons must have `onMouseDown={e => e.preventDefault()}` to prevent browser focus theft from the ProseMirror editor.

### State Management (Zustand)

All stores in `state/`. Pattern: `create<T>()(persist((set, get) => ({...}), { name, version }))`.

**Key stores:**
- `panel-store.ts` — Panel widths, visibility, localStorage persistence (v3)
- `content-store.ts` — Selected content ID/type, multi-selection, URL + localStorage sync
- `tree-state-store.ts` — Expanded/collapsed nodes
- `context-menu-store.ts` — Right-click menu positioning + 13 actions
- `editor-stats-store.ts` — Word/char count, reading time
- `outline-store.ts` — Heading hierarchy from TipTap JSON
- `search-store.ts` — Query, filters, results cache
- `settings-store.ts` — User preferences
- `navigation-history-store.ts` — Back/forward navigation
- `right-panel-collapse-store.ts` — Right sidebar collapse state
- `left-panel-view-store.ts` / `left-panel-collapse-store.ts` — Left sidebar view/collapse
- `upload-settings-store.ts` — Upload preferences
- `file-tree-filter-store.ts` — File tree filtering
- `debug-view-store.ts` — Dev debug toggles

### TipTap Editor

**Location:** `lib/domain/editor/`

Three extension sets:
- `getEditorExtensions()` — Client-side (includes React components: SlashCommands, WikiLink suggestion, Tag suggestion)
- `getServerExtensions()` — Server-safe (API routes, markdown conversion). **Missing WikiLink and Tag extensions** — server can't parse these node types.
- `getViewerExtensions()` — Read-only display mode

**Custom extensions** (in `extensions/`):
- `wiki-link.ts` — `[[Note Title]]` or `[[slug|Display]]`, autocomplete, click navigation
- `callout.ts` — Obsidian `> [!type] Title` syntax, 6 types (note, tip, warning, danger, info, success)
- `tag.ts` — Inline atomic node with `tagId`, `tagName`, `slug`, `color`. Renders as colored pill.
- `commands/slash-commands.tsx` — `/` menu for quick insertion
- `task-list.ts` — Auto-format `- [ ]` to task list
- `bullet-list.ts` — Obsidian-style backspace behavior

**Auto-save:** 2-second debounce with visual indicator (yellow → green).

### Export System

**Location:** `lib/domain/export/`

**Converters:** Markdown (with wiki-links, callouts, semantic HTML comments for tags), HTML (standalone with embedded CSS), JSON (lossless TipTap JSON), PlainText. PDF/DOCX are stubs.

**Metadata sidecars:** `.meta.json` files preserve tags (ID, color), wiki-link targets, callout structure. Generated on export but **no import consumer exists yet** — round-trip import loses semantic data.

**Markdown tag format:** `<!-- tag:tagId:colorValue -->#tagname<!-- /tag -->` — these render as raw HTML comments when reimported.

### Storage Architecture

Factory pattern in `lib/infrastructure/storage/`. Providers: Cloudflare R2 (primary), AWS S3, Vercel Blob. Two-phase upload: initiate (get presigned URL) → finalize (confirm completion).

### Visualization System

**Location:** `lib/domain/visualization/`

Collaboration hooks for Excalidraw, Mermaid diagrams, and diagrams.net. Security headers configured in `next.config.ts` for iframe embedding.

### Authentication

Custom OAuth with Google Sign-In. `lib/infrastructure/auth/` (barrel export via `index.ts`). Role hierarchy: owner > admin > member > guest. Admin endpoints require `requireRole("owner")`.

## API Routes

All content endpoints under `app/api/content/`:

```
GET/POST     /content/content              # List/create
GET/PATCH/DELETE /content/content/[id]     # CRUD
GET          /content/content/tree         # Hierarchical tree
POST         /content/content/move         # Drag-and-drop reorder
POST         /content/content/preview      # Content preview
POST         /content/content/create-document  # New document
POST         /content/content/duplicate    # Duplicate content
POST         /content/content/upload/initiate   # Presigned URL
POST         /content/content/upload/finalize   # Confirm upload
POST         /content/content/upload/simple     # Simple upload
GET          /content/content/[id]/download     # Download file
GET/PATCH    /content/folder/[id]/view     # Folder view settings
GET          /content/search              # Full-text search
GET          /content/backlinks           # Backlinks for a note
GET/POST     /content/tags                # List/create tags
GET          /content/tags/content/[id]   # Tags for content
GET/POST     /content/storage             # Storage configs
POST         /content/export/[id]         # Single document export
POST         /content/export/vault        # Bulk ZIP export
GET          /content/export/health       # Export health check
POST         /content/external/preview    # Open Graph metadata fetch
```

Other API areas: `app/api/admin/`, `app/api/auth/`, `app/api/google-drive/`, `app/api/onlyoffice/`, `app/api/visualization/`, `app/api/categories/`, `app/api/user/`

**Type definitions:** `lib/domain/content/api-types.ts`

## Directory Structure

```
app/
├── (authenticated)/content/    # Content IDE routes
├── api/                        # API routes (content/, admin/, auth/, google-drive/, etc.)
└── globals.css                 # Global styles + generated design tokens

components/content/
├── editor/                     # TipTap editor + BubbleMenu
├── toolbar/                    # ContentToolbar, ToolDebugPanel (Tool Surfaces)
├── tool-belt/                  # Tool management providers
├── folder-views/               # List, Grid, Kanban view components
├── external/                   # External link viewer + dialog
├── file-tree/                  # Tree node rendering
├── headers/                    # Left/Right sidebar headers
├── context-menu/               # Right-click context menu
├── viewer/                     # File type viewers (image, PDF, code, etc.)
├── dialogs/                    # Modal dialogs
└── skeletons/                  # Loading skeletons

lib/
├── core/                       # utils.ts (cn()), deep-merge, menu-positioning, glass-utils
├── database/                   # client.ts (Prisma singleton), generated/prisma/
├── domain/
│   ├── admin/                  # Admin panel + audit logging
│   ├── content/                # ContentNode utilities, OG fetcher, external validation
│   ├── editor/                 # TipTap extensions (extensions/, commands/)
│   ├── export/                 # Converters, metadata sidecars, bulk export, validation
│   ├── search/                 # Search filters
│   ├── tools/                  # Tool Surfaces registry + context provider
│   └── visualization/          # Excalidraw, Mermaid, diagrams.net collaboration
├── infrastructure/
│   ├── auth/                   # OAuth, sessions, middleware (barrel: index.ts)
│   ├── crypto/                 # Encryption utilities
│   ├── media/                  # File processing
│   └── storage/                # Multi-cloud provider abstraction
├── features/
│   ├── navigation/             # Branch builder
│   ├── office/                 # Blank document generator
│   └── settings/               # User settings CRUD (barrel: index.ts)
└── design/
    ├── system/                 # Liquid Glass tokens (surfaces, intents, motion)
    └── integrations/           # Third-party UI utilities

state/                          # 15 Zustand stores (see State Management above)
prisma/                         # schema.prisma, migrations/, seed.ts
```

## Design System: Liquid Glass

Tokens in `lib/design/system/`: `surfaces.ts` (Glass-0/1/2 blur levels), `intents.ts` (semantic colors), `motion.ts` (animations).

Generated via `pnpm build:tokens` (style-dictionary → CSS variables in `globals.css`).

```tsx
import { getSurfaceStyles } from "@/lib/design/system";
const glass0 = getSurfaceStyles("glass-0");
<div style={{ background: glass0.background, backdropFilter: glass0.backdropFilter }}>
```

## Key Patterns & Conventions

### Code Standards
- TypeScript strict mode, no `any` types
- Inline SVG for server component icons; `lucide-react` OK in client components only
- Import from barrel exports: `lib/domain/editor`, `lib/infrastructure/auth`, `lib/features/settings`, `lib/domain/tools`
- Use `lib/design/system/` tokens for styling
- Always search for existing components before creating new ones

### Database Workflows

**Development:** Edit `prisma/schema.prisma` → `npx prisma db push` → `npx prisma generate`

**Production:** `npx prisma migrate dev --name name --create-only` → review SQL → `npx prisma migrate deploy`

**Rules:** Use `db push` for dev (fast, no data loss). Never `migrate reset` in prod. Always `generate` after schema changes. Use `migrate resolve` to fix drift.

**Checklist:** `docs/notes-feature/DATABASE-CHANGE-CHECKLIST.md` (mandatory for all schema changes)

### Menu Positioning

Portal rendering + boundary detection in `lib/core/menu-positioning.ts`. Two-phase: render hidden to measure, then position. Auto-flips at viewport edges. Used by context menus, dropdowns, tooltips.

### Editor Extension Guidelines
- Client-only extensions → `getEditorExtensions()` (React components, DOM)
- Server-safe extensions → `getServerExtensions()` (API routes, conversion)
- Custom extensions follow TipTap v3 patterns (Node, Mark, Extension)
- Input rules for markdown shortcuts; keyboard shortcuts sparingly (Cmd+B, Cmd+I, Cmd+K only)

## Sprint/Epoch Development Model

2-week sprints within 8-12 week strategic epochs.

**Status tracking:**
- `docs/notes-feature/STATUS.md` — Single source of truth (MUST update when completing work)
- `docs/notes-feature/work-tracking/CURRENT-SPRINT.md` — Detailed sprint tracking
- `docs/notes-feature/work-tracking/BACKLOG.md` — Prioritized backlog

**After completing work:** Update STATUS.md frontmatter `last_updated`, move work items (⚪→🟡→✅), add to "Recent Completions" at top. Update BACKLOG.md when backlogging incomplete sprint items.

**Philosophy:** Ship working core features over incomplete comprehensive features.

## Documentation

**Start here:** `docs/notes-feature/00-START-HERE.md`

**Core architecture:** `docs/notes-feature/core/` (architecture, database, API spec, security, UI components)

**Features:** `docs/notes-feature/features/` (by capability: database, editor, storage, export, content-types)

**Guides:** `docs/notes-feature/guides/` (database, editor, UI, storage workflows)

**History:** `docs/notes-feature/work-tracking/history/` (Epoch 1-4 archives)

## Active Plan Files

Sprint plans are stored in `~/.claude/plans/`:
- `sleepy-jingling-quiche.md` — Sprint 29 (Tool Surfaces, complete) + Sprint 30 (Universal Expandable Editor, planned)
- `breezy-doodling-babbage.md` — Sprint 29 incremental reattempt plan (the version that was actually executed)
