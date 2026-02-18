# Digital Garden Content IDE - Documentation

**Welcome!** This is your starting point for understanding and working with the Content IDE.

---

## 🚀 Quick Links

- **[Current Status](STATUS.md)** - What's happening right now (Sprint 27)
- **[Backlog](work-tracking/BACKLOG.md)** - Upcoming work items
- **[AI Development Guide](../CLAUDE.md)** - For AI assistants (comprehensive dev guide)
- ** Table of Contents**
  - See TOC below
---

## Table of Contents - Document Guide

docs/notes-feature/
├── 00-START-HERE.md          ← New main entry point (task-oriented)
├── STATUS.md                 ← Single source of truth for current work
├── MILESTONE-PROGRESS.md     ← Historical milestone tracking
│
├── work-tracking/            ← Sprint/epoch management
│   ├── README.md (methodology guide)
│   ├── CURRENT-SPRINT.md (Sprint 27 - active)
│   ├── BACKLOG.md (prioritized work items)
│   ├── epochs/ (strategic planning)
│   └── history/ (completed sprints & epochs 1-4)
│
├── core/ (16 docs)           ← Timeless architecture docs
│   ├── 01-architecture.md
│   ├── 03-database-design.md
│   └── ... (system design)
│
├── features/ (2 docs + subdirs) ← What exists (capability docs)
│   ├── README.md (feature catalog)
│   ├── database/
│   ├── editor/
│   ├── storage/
│   ├── export/
│   └── content-types/
│
├── guides/ (14 docs)         ← How-to references
│   ├── database/ (Prisma, migrations, checklists)
│   ├── editor/ (TipTap, extensions, versioning)
│   ├── ui/ (Liquid Glass, React DND)
│   ├── storage/ (file storage, configs)
│   └── export/ (export architecture)
│
├── patterns/ (6 docs)        ← Architectural patterns
│   ├── ARCHITECTURE-RIGHT-SIDEBAR-REFACTOR.md
│   ├── TOOL-BELT-ARCHITECTURE.md
│   └── ... (best practices)
│
├── troubleshooting/ (3 docs) ← Problem-solution guides
│   ├── DRAG-AND-DROP-TROUBLESHOOTING.md
│   └── ERROR-HANDLING-GUIDE.md
│
├── reference/ (7 docs)       ← Quick lookups
│   ├── ADDING-NEW-CONTENT-TYPES.md
│   └── AI-HANDOFF-GUIDE.md
│
└── archive/                  ← Historical content
    ├── milestones/ (M1-M11 archived - 40+ docs)
    └── deprecated/ (old status files)
    


## I want to...

### 📖 Understand the System

**New to the project?** Start here:
1. [Architecture Overview](core/01-architecture.md) - System design and component hierarchy
2. [Technology Stack](core/02-technology-stack.md) - Libraries, rationale, and decisions
3. [Database Design](core/03-database-design.md) - ContentNode v2.0 schema

**Understand a specific feature?**
→ [Feature Catalog](features/README.md) - Browse by capability (database, editor, storage, export, content types)

### 🛠️ Build a Feature

**Create new content:**
→ [Adding New Content Types](reference/ADDING-NEW-CONTENT-TYPES.md) - Step-by-step guide for new payload types

**Work with the API:**
→ [API Specification](core/04-api-specification.md) - All 20+ REST endpoints with request/response examples

**Build UI components:**
→ [UI Components Guide](core/06-ui-components.md) - Component specifications and patterns
→ [Liquid Glass Design System](guides/ui/LIQUID-GLASS-DESIGN-SYSTEM.md) - Glassmorphism design strategy

### 🗄️ Work with the Database

**Make schema changes:**
→ [Database Change Checklist](guides/database/DATABASE-CHANGE-CHECKLIST.md) - **MANDATORY** before any schema change

**Understand workflows:**
→ [Prisma Database Guide](guides/database/PRISMA-DATABASE-GUIDE.md) - Comprehensive reference
→ [Prisma Migration Guide](guides/database/PRISMA-MIGRATION-GUIDE.md) - Migration and drift resolution

**Quick reference:**
```bash
# Development workflow (RECOMMENDED)
npx prisma db push        # Push schema changes (no migration file)
npx prisma generate       # Regenerate client

# Production workflow
npx prisma migrate dev --name migration_name  # Create migration
npx prisma migrate deploy                     # Deploy to production
```

### ✏️ Customize the Editor

**Extend TipTap:**
→ [TipTap Schema Evolution Guide](guides/editor/TIPTAP-SCHEMA-EVOLUTION-GUIDE.md) - Handle schema changes safely
→ [TipTap Extension Example](guides/editor/TIPTAP-EXTENSION-EXAMPLE.md) - Build custom extensions
→ [Versioning Quick Reference](guides/editor/VERSIONING-QUICK-REFERENCE.md) - One-page cheat sheet

**Existing extensions:**
→ [TipTap Extensions Feature Doc](features/editor/tiptap-extensions.md) - Wiki-links, callouts, slash commands

### 🎨 Style the UI

**Design system:**
→ [Liquid Glass Design System](guides/ui/LIQUID-GLASS-DESIGN-SYSTEM.md) - Token system, surfaces, intents, motion

**Component patterns:**
→ [Right Sidebar Pattern](patterns/ARCHITECTURE-RIGHT-SIDEBAR-REFACTOR.md) - Component architecture best practices
→ [React DND Integration](guides/ui/REACT-DND-INTEGRATION-GUIDE.md) - Drag-and-drop with react-arborist

### 🐛 Fix a Bug

**Troubleshooting guides:**
→ [Drag-and-Drop Issues](troubleshooting/DRAG-AND-DROP-TROUBLESHOOTING.md) - File tree drag-and-drop debugging
→ [Error Handling Guide](troubleshooting/ERROR-HANDLING-GUIDE.md) - Validation, monitoring, discrepancy detection

**Known issues:**
→ [STATUS.md](STATUS.md#-known-issues--blockers) - Current blockers and limitations

### ☁️ Configure Storage

**Setup cloud storage:**
→ [File Storage Core](guides/storage/07-file-storage.md) - Multi-cloud architecture (R2, S3, Vercel Blob)
→ [Storage Config Examples](guides/storage/STORAGE-CONFIG-EXAMPLES.md) - Configuration examples
→ [ONLYOFFICE Setup](guides/storage/ONLYOFFICE-SETUP-GUIDE.md) - Self-hosted document server

**Feature documentation:**
→ [Multi-Cloud Architecture](features/storage/multi-cloud-architecture.md) - How it works
→ [Two-Phase Upload](features/storage/two-phase-upload.md) - Presigned URL workflow

### 📤 Export & Import

**Export content:**
→ [Format Conversion](features/export/format-conversion.md) - Markdown, HTML, JSON, text
→ [Metadata Sidecars](features/export/metadata-sidecars.md) - `.meta.json` system for re-import
→ [Bulk Export](features/export/bulk-export.md) - ZIP archives with folder hierarchy

### 🔍 Search & Navigate

**Search system:**
→ [Full-Text Search](features/search-tags/search-system.md) - Search with filters
→ [Tag System](features/search-tags/tag-system.md) - Tags with colors and usage counts
→ [Backlinks](features/search-tags/backlinks.md) - Wiki-link navigation

---

## 📊 Development Tracking

### Current Work (Sprint/Epoch Model)

We use a **sprint/epoch** development model:
- **Sprints**: 2-week iterations with specific deliverables
- **Epochs**: 8-12 week strategic periods with thematic goals

**Active Now:**
- **Sprint 27** (Feb 18 - Mar 3, 2026): FolderPayload implementation
- **Epoch 5** (Feb-Mar 2026): Advanced Content Types

**See**:
- [Current Sprint](work-tracking/CURRENT-SPRINT.md) - Sprint 27 details
- [Active Epoch](work-tracking/epochs/epoch-5-advanced-content-types.md) - Epoch 5 plan
- [Backlog](work-tracking/BACKLOG.md) - Prioritized work items

### Historical Context

**Completed Epochs:**
- [Epoch 1: Foundation](work-tracking/history/epoch-1-foundation.md) - Database, API, UI (Oct-Dec 2025)
- [Epoch 2: Content Experience](work-tracking/history/epoch-2-content-experience.md) - Editor, navigation (Dec 2025-Jan 2026)
- [Epoch 3: Media & Storage](work-tracking/history/epoch-3-media-storage.md) - File management, multi-cloud (Jan-Feb 2026)
- [Epoch 4: Export & Extensibility](work-tracking/history/epoch-4-export-extensibility.md) - Data portability (Feb 2026)

**Archived Milestones:**
Older milestone-based documentation (M1-M8) has been archived for historical reference:
- [M1-M5 Archive](archive/milestones/M1-M5/) - Foundation, API, UI, File Tree, Editor
- [M6 Archive](archive/milestones/M6/) - Search, Tags, Extensions
- [M7 Archive](archive/milestones/M7/) - Storage, Media Viewers, Office Docs
- [M8 Archive](archive/milestones/M8/) - Export System

---

## 📚 Complete Documentation Index

### Core Architecture & Design (Timeless)

**System Design:**
- [01 - Architecture](core/01-architecture.md) - System overview, component hierarchy, data flow
- [02 - Technology Stack](core/02-technology-stack.md) - Library evaluations and decisions
- [03 - Database Design](core/03-database-design.md) - ContentNode v2.0 schema
- [04 - API Specification](core/04-api-specification.md) - REST API routes and contracts
- [05 - Security Model](core/05-security-model.md) - Authentication, authorization, validation
- [06 - UI Components](core/06-ui-components.md) - Component specs and interaction patterns

### Features (What Exists)

**Organized by capability:**
- [Database](features/database/) - ContentNode system, typed payloads
- [Editor](features/editor/) - TipTap extensions, wiki-links, callouts
- [Storage](features/storage/) - Multi-cloud, two-phase upload, providers
- [Export](features/export/) - Format conversion, metadata sidecars, bulk export
- [Content Types](features/content-types/) - Notes, files, external links, folders
- [Search & Tags](features/search-tags/) - Full-text search, tags, backlinks
- [UI Components](features/ui/) - File tree, panel layout, context menus

**See**: [Feature Catalog](features/README.md)

### Implementation Guides (How-To)

**By Topic:**
- [Database Guides](guides/database/) - Prisma workflows, migrations, checklists
- [Editor Guides](guides/editor/) - TipTap extensions, schema evolution, versioning
- [UI Guides](guides/ui/) - Liquid Glass design, React DND integration
- [Storage Guides](guides/storage/) - File storage, config examples, ONLYOFFICE

### Patterns (Architectural)

**Best practices and patterns:**
- [Right Sidebar Architecture](patterns/ARCHITECTURE-RIGHT-SIDEBAR-REFACTOR.md)
- [Tool Belt Architecture](patterns/TOOL-BELT-ARCHITECTURE.md)
- [Export Markdown Solution](patterns/EXPORT-MARKDOWN-SOLUTION.md)
- [Type Safety Improvements](patterns/TYPE-SAFETY-IMPROVEMENTS.md)
- [Tree Update Flow](patterns/TREE-UPDATE-FLOW.md)
- [URL Identifier Strategy](patterns/URL-IDENTIFIER-STRATEGY.md)

### Troubleshooting & Maintenance

**Problem → Solution:**
- [Drag-and-Drop Issues](troubleshooting/DRAG-AND-DROP-TROUBLESHOOTING.md)
- [Error Handling Guide](troubleshooting/ERROR-HANDLING-GUIDE.md)
- [Documentation Contradictions](troubleshooting/DOCUMENTATION-CONTRADICTIONS-REPORT.md)

### Reference (Quick Lookups)

**Fast answers:**
- [Adding New Content Types](reference/ADDING-NEW-CONTENT-TYPES.md)
- [AI Handoff Guide](reference/AI-HANDOFF-GUIDE.md)
- [Documentation Quick Reference](reference/DOCUMENTATION-QUICK-REFERENCE.md)

---

## 🎯 For Specific Audiences

### For New Contributors
1. Read [Architecture](core/01-architecture.md) to understand the system
2. Browse [Feature Catalog](features/README.md) to see what exists
3. Check [Current Sprint](work-tracking/CURRENT-SPRINT.md) to see active work
4. Review [Development Workflow](../CLAUDE.md#development-workflow) for standards

### For AI Assistants
1. **Primary Guide**: [CLAUDE.md](../CLAUDE.md) - Comprehensive AI development guide
2. **Current Work**: [Current Sprint](work-tracking/CURRENT-SPRINT.md) - Active tasks
3. **Roadmap**: [STATUS.md](STATUS.md) - What's next
4. **Handoff**: [AI Handoff Guide](reference/AI-HANDOFF-GUIDE.md) - Context transfer

### For Maintenance
1. **Status Tracking**: [STATUS.md](STATUS.md) - Single source of truth
2. **Known Issues**: [STATUS.md](STATUS.md#-known-issues--blockers)
3. **Backlog**: [Backlog](work-tracking/BACKLOG.md) - Prioritized work items
4. **Epochs**: [work-tracking/epochs/](work-tracking/epochs/) - Strategic planning

---

## 🚦 Getting Started Checklist

**First-time setup:**
- [ ] Read [Architecture Overview](core/01-architecture.md)
- [ ] Review [Technology Stack](core/02-technology-stack.md)
- [ ] Understand [Database Design](core/03-database-design.md)
- [ ] Browse [Feature Catalog](features/README.md)
- [ ] Check [Current Sprint](work-tracking/CURRENT-SPRINT.md)

**Before making changes:**
- [ ] Read relevant feature documentation
- [ ] Review [Development Workflow](../CLAUDE.md#development-workflow)
- [ ] For database changes: follow [Database Change Checklist](guides/database/DATABASE-CHANGE-CHECKLIST.md)
- [ ] For new content types: follow [Adding New Content Types](reference/ADDING-NEW-CONTENT-TYPES.md)

---

**Documentation Version**: 3.0 (Sprint/Epoch Model)
**Last Updated**: Feb 18, 2026
**Next Review**: Mar 3, 2026
