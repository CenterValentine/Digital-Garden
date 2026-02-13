# Feature Catalog

**Capability-based documentation** organized by domain, independent of implementation timeline.

## Purpose

This directory contains documentation for **what exists** in the Content IDE, organized by capability rather than when it was built. Each feature doc is:

- **Timeless**: Updated as features evolve, not tied to milestones
- **Comprehensive**: Complete reference for how the feature works
- **User-focused**: Describes capability from user perspective
- **Developer-friendly**: Includes architecture and implementation details

## Features by Domain

### Database
- [ContentNode System](database/content-node-system.md) - Polymorphic content architecture
- [Typed Payloads](database/typed-payloads.md) - Type-safe payload relations

### Editor
- [TipTap Extensions](editor/tiptap-extensions.md) - Custom editor extensions
- [Wiki-Links](editor/wiki-links.md) - Bidirectional link system
- [Callouts](editor/callouts.md) - Obsidian-style callout blocks

### Storage
- [Multi-Cloud Architecture](storage/multi-cloud-architecture.md) - R2, S3, Vercel Blob
- [Two-Phase Upload](storage/two-phase-upload.md) - Presigned URL workflow
- [Provider Configuration](storage/provider-configuration.md) - Storage setup guide

### Export
- [Format Conversion](export/format-conversion.md) - Markdown, HTML, JSON, text
- [Metadata Sidecars](export/metadata-sidecars.md) - `.meta.json` system
- [Bulk Export](export/bulk-export.md) - ZIP archives with hierarchy

### Content Types
- [Notes](content-types/notes.md) - Rich text content with TipTap
- [Files](content-types/files.md) - Binary files with viewers
- [External Links](content-types/external-links.md) - Bookmarks with Open Graph
- [Folders](content-types/folders.md) - Folders with view modes _(coming soon)_
- [Code Snippets](content-types/code.md) - Syntax-highlighted code
- [HTML Content](content-types/html.md) - Rendered HTML pages

### Search & Tags
- [Full-Text Search](search-tags/search-system.md) - Search with filters
- [Tag System](search-tags/tag-system.md) - Tags with colors and counts
- [Backlinks](search-tags/backlinks.md) - Wiki-link navigation

### UI Components
- [File Tree](ui/file-tree.md) - react-arborist with drag-and-drop
- [Panel Layout](ui/panel-layout.md) - Resizable 3-panel layout
- [Context Menus](ui/context-menus.md) - Right-click actions

## Quick Reference

**Most Recent Features**:
- External Links with Open Graph (Feb 2026)
- ContentRole Visibility Control (Feb 2026)
- Multi-Format Export (Feb 2026)
- Office Document Viewers (Feb 2026)

**Coming Soon**:
- Folder View Modes (Sprint 27 - Active)
- New Payload Types (Sprint 28 - Planned)
- Real-Time Collaboration (Epoch 6 - Planned)

## Contributing

When adding a new feature:
1. Create doc in appropriate domain directory
2. Follow template: Overview → User Experience → Architecture → API → Implementation
3. Add entry to this README
4. Cross-reference from related docs

---

**See Also**:
- [Core Architecture](../core/) - System design and specifications
- [Implementation Guides](../guides/) - How-to references
- [Patterns](../patterns/) - Architectural patterns
