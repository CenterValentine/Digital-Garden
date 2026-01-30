# Notes Feature Documentation Index

**Version:** 2.3
**Last Updated:** January 27, 2026
**Status:** Active Development (M7 Office Documents Complete)

## Overview

This documentation suite provides comprehensive specifications for implementing an Obsidian-inspired notes IDE feature within the Digital Garden application. The feature combines document management, real-time editing, multi-cloud storage, and a hybrid file system supporting markdown notes, code files, office documents, media, AI chat and more.

## Purpose

The notes feature transforms the application into a powerful knowledge management system with:

- **Resizable panel-based layout** inspired by modern IDEs
- **Tab-based document interface** with unsaved changes tracking
- **Command palette** with keyboard shortcuts (Cmd/Ctrl+K)
- **Drag-and-drop file organization** with react-arborist
- **Custom icon system** for folders and files with color personalization
- **Hybrid file system** supporting multiple content types
- **Multi-cloud storage** (Cloudflare R2, AWS S3, Vercel Blob)
- **Rich markdown editing** using Novel/TipTap
- **Export/Import** in multiple formats (Markdown, PDF, HTML, ZIP)
- **Real-time collaboration** foundations (future enhancement)

## Documentation Structure

### Core Architecture & Design

**[V2 Architecture Overview](./V2-ARCHITECTURE-OVERVIEW.md)** - Start here for v2.0 architecture understanding

1. **[Architecture](./01-architecture.md)**
   - System architecture overview
   - Component hierarchy
   - Data flow diagrams
   - State management patterns
   - Integration with existing application

2. **[Technology Stack](./02-technology-stack.md)**
   - Library evaluations and comparisons
   - Technology decisions (straightforward and options-based)
   - Bundle size analysis
   - License compatibility
   - Integration complexity assessments

3. **[Database Design](./03-database-design.md)**
   - ContentNode + Typed Payloads architecture
   - Complete Prisma schema
   - Migrations and constraints
   - Indexing strategy
   - Query optimization

### Implementation Specifications

4. **[API Specification](./04-api-specification.md)**
   - ContentNode + Typed Payloads architecture
   - Complete REST API routes
   - Request/response payloads
   - Two-phase upload workflow
   - Type derivation rules
   - Error handling patterns
   - Rate limiting
   - Webhook integrations

5. **[Security Model](./05-security-model.md)**
   - Authentication flows
   - Authorization and role-based access control
   - Row-level security
   - File upload validation
   - XSS and CSRF prevention
   - Audit logging

6. **[UI Components](./06-ui-components.md)**
   - Component specifications
   - Props and interfaces
   - Styling with design system
   - Accessibility requirements
   - Interaction patterns

**[Liquid Glass Design System](./LIQUID-GLASS-DESIGN-SYSTEM.md)** - Design system strategy for `/notes/**`

- Dual-library approach (Glass-UI + DiceUI vs shadcn/Radix)
- Unified design tokens (surfaces, intents, motion)
- DS facade for consistent API
- Metaphor budget and conservative constraints
- Component priority rules

7. **[File Storage](./07-file-storage.md)**
   - Multi-cloud storage architecture
   - Cloudflare R2 configuration
   - AWS S3 configuration
   - Vercel Blob configuration
   - Presigned URL generation
   - Storage provider switching

8. **[Content Types](./08-content-types.md)**
   - Supported MIME types
   - CRUD capability matrix
   - Viewer components per type
   - Editor components per type
   - Fallback strategies

9. **[Settings System](./09-settings-system.md)**
   - Settings data model
   - User preferences storage
   - Admin/owner settings
   - Command palette integration
   - Default configurations

### Integration & Extensions

10. **[Resume Integration](./10-resume-integration.md)**
    - Leveraging existing PDF generation
    - PDF viewer implementation
    - Shared utilities and patterns
    - Admin editing workflow
    - Future collaboration features

11. **[Implementation Guide](./11-implementation-guide.md)**
    - Step-by-step roadmap
    - Phase 1: Foundation (panels, tabs, file tree)
    - Phase 2: Content handling (viewers, editors)
    - Phase 3: Storage integration
    - Phase 4: Advanced features (search, backlinks)
    - Migration from MVP

### Current Development

- **[CURRENT-STATE.md](./CURRENT-STATE.md)** - Active work tracking (M7 file management starting)
- **[IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md)** - Milestone progress tracking (M1-M6 complete)
- **[DOCUMENTATION-QUICK-REFERENCE.md](./DOCUMENTATION-QUICK-REFERENCE.md)** - Quick navigation guide
- **[DOCUMENTATION-CONTRADICTIONS-REPORT.md](./DOCUMENTATION-CONTRADICTIONS-REPORT.md)** - Quality assurance report

**Milestone Implementation Guides (Reference):**

- **[M1: Foundation README](./M1-FOUNDATION-README.md)** - Database schema, seed script, core utilities
- **[M2: Core API README](./M2-CORE-API-README.md)** - REST API routes, file upload, storage management
- **[M3: UI Foundation with Liquid Glass](./M3-UI-FOUNDATION-LIQUID-GLASS.md)** - Panel layout, design system, Glass-UI integration
- **[M3: Setup Guide](./M3-SETUP-GUIDE.md)** - Step-by-step setup and testing for M3
- **[M4: File Tree Implementation](./M4-FILE-TREE-IMPLEMENTATION.md)** - Server/client architecture, Suspense, react-arborist
- **[M5: Editor Test Plan](./M5-EDITOR-TEST-PLAN.md)** - TipTap editor integration testing
- **[M6: Final Scope](./M6-FINAL-SCOPE.md)** - Search, backlinks, editor extensions scope
- **[M6: Extension Recommendations](./M6-EXTENSION-RECOMMENDATIONS.md)** - Custom TipTap extensions guide
- **[M6: Tags Implementation](./M6-TAGS-IMPLEMENTATION.md)** - Complete tags system specification (7,000+ lines)
- **[M6: Outline Panel Test Plan](./M6-OUTLINE-PANEL-TEST-PLAN.md)** - Outline feature testing
- **[M6: Editor Extensions Test Plan](./M6-EDITOR-EXTENSIONS-TEST-PLAN.md)** - Extension testing guide
- **[M7: Drag-Drop Upload](./M7-DRAG-DROP-UPLOAD.md)** - File upload with drag-and-drop implementation
- **[M7: Storage Architecture](./M7-STORAGE-ARCHITECTURE-V2.md)** - Storage provider abstraction design
- **[M7: Office Documents Implementation](./M7-OFFICE-DOCUMENTS-IMPLEMENTATION.md)** - Multi-tier Office document viewing (Google Docs, ONLYOFFICE, Microsoft Viewer) ✅ Complete
- **[M7: Media Viewers Implementation](./M7-MEDIA-VIEWERS-IMPLEMENTATION.md)** - Enhanced image, PDF, video, and audio viewers with keyboard shortcuts ✅ Complete

**Export & Backup System:**

- **[Export & Backup Architecture](./EXPORT-BACKUP-ARCHITECTURE.md)** - Complete multi-format export system design
- **[Export System Implementation](./EXPORT-SYSTEM-IMPLEMENTATION.md)** - Implementation summary and file locations
- **[Export Markdown Solution](./EXPORT-MARKDOWN-SOLUTION.md)** - Markdown compatibility with metadata sidecars
- **[Versioning Quick Reference](./VERSIONING-QUICK-REFERENCE.md)** - ⭐ One-page cheat sheet for schema versioning
- **[TipTap Schema Evolution Guide](./TIPTAP-SCHEMA-EVOLUTION-GUIDE.md)** - Comprehensive guide for handling TipTap changes
- **[TipTap Extension Example](./TIPTAP-EXTENSION-EXAMPLE.md)** - Step-by-step extension development walkthrough
- **[Schema Evolution Summary](./SCHEMA-EVOLUTION-SUMMARY.md)** - Executive summary of protection system
- **[Error Handling Guide](./ERROR-HANDLING-GUIDE.md)** - Validation, monitoring, and discrepancy detection

**Architecture & Patterns:**

- **[Architecture: Right Sidebar Refactor](./ARCHITECTURE-RIGHT-SIDEBAR-REFACTOR.md)** - Component architecture patterns
- **[Tool Belt Architecture](./TOOL-BELT-ARCHITECTURE.md)** - Context-aware action system for file viewers (M7+)
- **[React DND Integration Guide](./REACT-DND-INTEGRATION-GUIDE.md)** - ⭐ Critical reference for drag-and-drop with react-arborist
- **[Type Safety Improvements](./TYPE-SAFETY-IMPROVEMENTS.md)** - TypeScript types for API routes
- **[Tree Update Flow](./TREE-UPDATE-FLOW.md)** - Drag-and-drop tree updates explained
- **[Storage Config Examples](./STORAGE-CONFIG-EXAMPLES.md)** - How to use storage provider configs
- **[Component Registry Notes](./COMPONENT-REGISTRY-NOTES.md)** - Glass-UI/DiceUI investigation and alternatives
- **[Adding New Content Types](./ADDING-NEW-CONTENT-TYPES.md)** - Content type extension guide
- **[URL Identifier Strategy](./URL-IDENTIFIER-STRATEGY.md)** - URL vs slug routing decisions

**Session Logs (Archived):**

Completed milestone session logs moved to `archive/sessions/`:
- M4 session logs (13 files: bugfixes, completion summaries, test plans)
- M6 session logs (completion summaries, session notes)
- See `archive/sessions/` for historical implementation details

### Quality Assurance

12. **[Testing Strategy](./12-testing-strategy.md)**
    - Unit testing approach
    - Integration testing
    - End-to-end testing scenarios
    - Accessibility testing
    - Performance testing
    - Browser compatibility

13. **[Performance](./13-performance.md)**
    - Optimization strategies
    - Code splitting and lazy loading
    - Virtualization for large trees
    - Caching strategies
    - Monitoring and metrics
    - Bundle size management
    - Memory monitoring and leak detection

14. **[Settings Architecture Planning](./14-settings-architecture-planning.md)**
    - Unified settings system
    - Command palette integration
    - Account system integration
    - Settings API design

15. **[Runtime and Caching](./15-runtime-and-caching.md)**
    - Edge vs Node runtime selection
    - Streaming responses and SSE
    - Next.js caching strategy
    - ISR and CDN caching
    - Cache invalidation

16. **[Advanced Security](./16-advanced-security.md)**
    - Virus and malware scanning
    - SVG/iframe/code sandboxing
    - Abuse controls and rate limiting
    - ZIP bomb detection
    - Account suspension system

17. **[Export and Import](./17-export-import.md)**
    - Export formats (Markdown, HTML, PDF, JSON, ZIP)
    - Single note, folder, and workspace export
    - Import markdown files and ZIP archives
    - Metadata export for migration
    - Security validation

## Quick Start

### For Active Development (AI & Human Developers)

**Start here for current work:**
1. **[CURRENT-STATE.md](./CURRENT-STATE.md)** - What's being worked on right now, next tasks, recent changes
2. **[IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md)** - Overall milestone progress (M1-M6 complete, M7 active)
3. **[CLAUDE.md](../../CLAUDE.md)** - Development commands, patterns, architecture overview
4. **[DOCUMENTATION-QUICK-REFERENCE.md](./DOCUMENTATION-QUICK-REFERENCE.md)** - Fast navigation guide

### For New Contributors

**Start here to understand the system:**
1. **[Architecture](./01-architecture.md)** - System design and component hierarchy
2. **[Technology Stack](./02-technology-stack.md)** - Library decisions and rationale
3. **[Database Design](./03-database-design.md)** - ContentNode v2.0 schema
4. **[Implementation Guide](./11-implementation-guide.md)** - Step-by-step development roadmap

### Troubleshooting & Maintenance

**[DRAG-AND-DROP-TROUBLESHOOTING.md](./DRAG-AND-DROP-TROUBLESHOOTING.md)** - Comprehensive guide to debugging file tree drag-and-drop issues
   - Database corruption detection and cleanup
   - React-arborist index mismatch resolution
   - Soft-delete filtering patterns
   - Drop zone positioning logic
   - Testing checklist and prevention strategies

## Key Principles

### 1. Hybrid Document System

The feature extends the existing `StructuredDocument` model to support both text-based content (markdown, code) and binary files (images, PDFs, videos) through a new `FileMetadata` table.

### 2. Multi-Cloud First

Users can choose their preferred storage provider (R2, S3, Vercel Blob) with seamless switching and per-document storage selection.

### 3. Progressive Enhancement

Core functionality works without JavaScript, with enhanced features for modern browsers. File viewing degrades gracefully for unsupported types.

### 4. Accessibility by Default

All components meet WCAG 2.1 AA standards with keyboard navigation, screen reader support, and proper ARIA attributes.

### 5. Security First

Row-level security, role-based permissions, file validation, and XSS prevention are built into every layer.

## Integration Points

### Existing Features

- **Authentication:** Leverages existing `lib/auth/middleware.ts` patterns
- **Database:** Extends current Prisma schema without breaking changes
- **Design System:** Uses existing `lib/design-system` tokens and components
- **Navigation:** Integrates with existing category/document tree structure

### New Dependencies

**Chosen Libraries:**

- `novel` + `@tiptap/react` - Rich text editing
- `shiki` - Code syntax highlighting
- `@react-pdf-viewer/core` - PDF viewing with plugins
- `allotment` - Panel layout (3.2KB gzipped)
- `react-arborist` - File tree with virtualization + drag-and-drop
- `zustand` - State management (3KB gzipped)
  - _Note: Jotai considered as future alternative for Suspense support_
- `cmdk` - Command palette (already integrated)
- `lucide-react` - Icon system (already integrated)
- `file-saver` - Single file exports (2KB)
- `jszip` - ZIP archive creation (55KB)
- `puppeteer` - PDF generation (already in resume feature)
- `@tiptap/extension-markdown` - Markdown conversion for TipTap
- `@uiw/react-codemirror` (Phase 2) - Markdown editor for toggle mode
- `@codemirror/lang-markdown` (Phase 2) - Markdown syntax highlighting
- `@tanstack/react-query` - Data fetching and caching

## Addressed Requirements

This documentation resolves all 32 identified gaps from the original scope document:

1. ✅ Library evaluation with criteria and recommendations
2. ✅ Panel layout implementation details
3. ✅ File type handling matrix
4. ✅ Settings architecture with data model
5. ✅ Storage solution configuration
6. ✅ Novel/TipTap integration with schema changes
7. ✅ Icon system (Lucide with file type mapping + custom icon/color per document)
8. ✅ Database philosophy evolution
9. ✅ Complete API routes specification
10. ✅ Security implementation details
11. ✅ Command palette functionality
12. ✅ Tab management specifications
13. ✅ Right sidebar features (backlinks, outline, metadata)
14. ✅ SideChatBar specifications
15. ✅ Status bar details
16. ✅ File tree navigation
17. ✅ Archive file handling
18. ✅ Media player features
19. ✅ Performance optimization
20. ✅ Testing strategy
21. ✅ Accessibility (a11y)
22. ✅ Error handling & user feedback
23. ✅ Migration path from MVP
24. ✅ Open source reference integration
25. ✅ Extensibility & plugin system
26. ✅ Drag-and-drop file reorganization (tree-level)
27. ✅ Custom icons and colors for documents/folders
28. ✅ Export system (Markdown, PDF, HTML, ZIP)
29. ✅ Import system (Markdown files, ZIP archives)
30. ✅ Soft delete and trash management
31. ✅ Markdown file upload with conversion to editable notes
32. ✅ Markdown/WYSIWYG toggle mode (Phase 2 enhancement)

## Contributing to This Documentation

When updating these documents:

1. Maintain the established structure and formatting
2. Include mermaid diagrams for complex flows
3. Provide code examples for implementations
4. Update the version and last updated date
5. Cross-reference related documents
6. Add migration notes for breaking changes

## Version History

| Version | Date       | Author | Changes                                                                                                                  |
| ------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| 1.0     | 2026-01-10 | System | Initial comprehensive documentation suite                                                                                |
| 1.1     | 2026-01-12 | System | Added drag-and-drop, custom icons, export/import features                                                                |
| 2.0     | 2026-01-12 | System | Database v2.0 refactor (ContentNode + Typed Payloads), API v2.0, complete terminology migration from docType/contentData |
| 2.1     | 2026-01-13 | System | Documentation cleanup: consolidated summaries into V2-ARCHITECTURE-OVERVIEW.md, removed deprecated files                 |
| 2.2     | 2026-01-20 | System | Added CURRENT-STATE.md for active work tracking, archived M4/M6 session logs to archive/sessions/, updated index structure |
| 2.3     | 2026-01-27 | System | Added conventional versioning documentation for TipTap schema evolution, including quick reference card and comprehensive guides |

## Next Steps

Begin implementation by following the **[Implementation Guide](./11-implementation-guide.md)** which provides a phased approach to building this feature.
