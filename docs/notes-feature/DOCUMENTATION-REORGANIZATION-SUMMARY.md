# Documentation Reorganization Summary

**Date**: February 18, 2026
**Version**: 3.0 (Sprint/Epoch Model)

## Overview

The Digital Garden documentation has been reorganized from a milestone-centric structure (92 files) to a capability-based structure (~60 active files) with sprint/epoch tracking.

## Key Changes

### 1. New Sprint/Epoch Development Model

**Replaces**: Milestone-based tracking (M1-M11)

**Introduces**:
- **Sprints**: 2-week iterations with specific deliverables
- **Epochs**: 8-12 week strategic periods with thematic goals
- **Velocity tracking**: Data-driven planning with story points
- **Regular retrospectives**: Continuous improvement cycles

**Active**:
- Sprint 27 (Feb 18 - Mar 3, 2026): FolderPayload implementation
- Epoch 5 (Feb-Mar 2026): Advanced Content Types

### 2. Documentation Structure

**Before** (Milestone-centric):
```
docs/notes-feature/
├── 00-index.md
├── M1-FOUNDATION-README.md
├── M2-CORE-API-README.md
├── M3-UI-FOUNDATION-LIQUID-GLASS.md
├── ... (37 milestone files)
├── IMPLEMENTATION-STATUS.md
├── CURRENT-STATE.md
└── ... (55 other files)
```

**After** (Capability-based):
```
docs/notes-feature/
├── 00-START-HERE.md (task-oriented index)
├── STATUS.md (single source of truth)
├── MILESTONE-PROGRESS.md (historical tracking)
│
├── work-tracking/ (sprint/epoch management)
├── core/ (timeless architecture)
├── features/ (what exists)
├── guides/ (how-to)
├── patterns/ (best practices)
├── troubleshooting/ (problem-solution)
├── reference/ (quick lookups)
└── archive/ (historical content)
```

### 3. File Count Reduction

| Category | Before | After | Change |
|----------|--------|-------|--------|
| Root files | 92 | 3 | -97% |
| Active docs | 92 | ~60 | -35% |
| Archived | 0 | 45+ | New |
| Total | 92 | ~105 | +14% (includes archives) |

**Key**: Reduced active docs by 35%, archived historical content for reference

### 4. New Entry Points

**Primary**: [00-START-HERE.md](00-START-HERE.md)
- Task-oriented "I want to..." navigation
- Clear paths for different use cases
- Directory structure overview

**Current Work**: [STATUS.md](STATUS.md)
- Active sprint and epoch
- Work items and progress
- Recent completions (last 30 days)
- Known blockers

**AI Assistants**: [CLAUDE.md](../CLAUDE.md)
- Comprehensive development guide
- Updated documentation paths
- STATUS.md maintenance instructions

## Directory Structure

### work-tracking/

**Purpose**: Sprint and epoch management

**Contents**:
- `README.md` - Sprint/epoch methodology
- `CURRENT-SPRINT.md` - Active sprint (Sprint 27)
- `BACKLOG.md` - Prioritized work items
- `epochs/` - Planned epochs
- `history/` - Completed sprints & epochs 1-4

**Use**: Track current work, plan future sprints, review past epochs

### core/

**Purpose**: Timeless architecture documentation

**Contents** (16 docs):
- 01-17 numbered architecture docs
- System design, database, API, security, UI

**Use**: Understand system architecture and design decisions

### features/

**Purpose**: Capability documentation (what exists)

**Structure**:
```
features/
├── README.md (feature catalog)
├── database/ (ContentNode, typed payloads)
├── editor/ (TipTap extensions, wiki-links)
├── storage/ (multi-cloud, two-phase upload)
├── export/ (format conversion, metadata sidecars)
├── content-types/ (notes, files, external links, folders)
├── search-tags/ (search, tags, backlinks)
└── ui/ (file tree, panels, context menus)
```

**Use**: Learn about existing capabilities (not when they were built)

### guides/

**Purpose**: How-to references for common tasks

**Structure**:
```
guides/
├── database/ (Prisma, migrations, checklists)
├── editor/ (TipTap, extensions, versioning)
├── ui/ (Liquid Glass, React DND)
├── storage/ (file storage, configs)
└── export/ (export architecture)
```

**Use**: Implement features, make schema changes, customize UI

### patterns/

**Purpose**: Architectural patterns and best practices

**Contents** (6 docs):
- Component architecture patterns
- Tool belt architecture
- Export solutions
- Type safety improvements
- Tree update flow
- URL strategies

**Use**: Follow established patterns when building features

### troubleshooting/

**Purpose**: Problem-solution guides

**Contents** (3 docs):
- Drag-and-drop issues
- Error handling
- Documentation contradictions

**Use**: Debug issues, handle errors

### reference/

**Purpose**: Quick lookup references

**Contents** (7 docs):
- Adding new content types
- AI handoff guide
- Documentation quick reference
- Metadata schemas
- Schema evolution summary

**Use**: Quick answers to specific questions

### archive/

**Purpose**: Historical content preservation

**Structure**:
```
archive/
├── milestones/
│   ├── M1-M5/ (foundation, API, UI, file tree, editor)
│   ├── M6/ (search, tags, extensions)
│   ├── M7/ (storage, media viewers, office docs)
│   ├── M8/ (export system)
│   └── M9-M11/ (future milestones)
├── deprecated/ (old status files, outdated docs)
└── sessions/ (completed session logs)
```

**Use**: Historical context, understand evolution of features

## Documentation Maintenance

### STATUS.md

**Single source of truth** for current work

**Update when**:
- ✅ Completing a work item
- ✅ Starting new work
- ✅ Making significant progress
- ✅ Encountering blockers

**See**: [STATUS-MAINTENANCE-GUIDE.md](STATUS-MAINTENANCE-GUIDE.md)

### CURRENT-SPRINT.md

**Detailed sprint tracking**

**Update when**:
- Daily standup notes
- Work item status changes
- Blockers encountered
- Sprint retrospective

**See**: [work-tracking/README.md](work-tracking/README.md)

### Feature Documentation

**Update when**:
- Adding new capabilities
- Changing existing features
- Deprecating features

**Location**: `features/{domain}/{feature}.md`

## Migration from Milestones

### Epoch Mapping

| Epoch | Duration | Milestones | Theme |
|-------|----------|------------|-------|
| Epoch 1 | Oct-Dec 2025 | M1-M3 | Foundation |
| Epoch 2 | Dec 2025-Jan 2026 | M4-M6 | Content Experience |
| Epoch 3 | Jan-Feb 2026 | M7 | Media & Storage |
| Epoch 4 | Feb 2026 | M8-M9 Phase 2 | Export & Extensibility |
| Epoch 5 | Feb-Mar 2026 | M9 Phase 2+ | Advanced Content Types |

### Finding Old Content

**Milestone docs**: `archive/milestones/M{number}/`

**Example**: M7 storage architecture → `archive/milestones/M7/M7-STORAGE-ARCHITECTURE-V2.md`

**Better**: Check feature docs first → `features/storage/multi-cloud-architecture.md`

## Benefits

### For Developers

**Before**:
- 92 files to navigate
- Unclear which doc is "current"
- Milestone-centric (when built) vs capability-centric (what exists)

**After**:
- Task-oriented navigation ("I want to...")
- Single STATUS.md for current work
- Features organized by capability

### For AI Assistants

**Before**:
- Multiple conflicting status files
- Milestone-specific context scattered
- Unclear documentation paths

**After**:
- CLAUDE.md with updated paths
- STATUS.md maintenance instructions
- Clear current work in CURRENT-SPRINT.md

### For Project Management

**Before**:
- Milestone-based planning (inflexible)
- No velocity tracking
- Irregular retrospectives

**After**:
- Sprint/epoch model (agile)
- Velocity-based planning
- Regular retrospectives (every 2 weeks)

## Next Steps

### Short-Term

- [ ] Complete remaining feature docs (5-10 more features)
- [ ] Add cross-references between related docs
- [ ] Validate all internal links

### Medium-Term

- [ ] Sprint retrospective template
- [ ] Automated link checking (CI/CD)
- [ ] Documentation contribution guide

### Long-Term

- [ ] Auto-update STATUS.md from CURRENT-SPRINT.md
- [ ] Auto-archive completions >30 days
- [ ] Documentation analytics (most viewed, outdated)

## Questions & Support

**Find something wrong?**
- Check [troubleshooting/DOCUMENTATION-CONTRADICTIONS-REPORT.md](troubleshooting/DOCUMENTATION-CONTRADICTIONS-REPORT.md)
- Open an issue or PR

**Need help navigating?**
- Start at [00-START-HERE.md](00-START-HERE.md)
- Check [reference/DOCUMENTATION-QUICK-REFERENCE.md](reference/DOCUMENTATION-QUICK-REFERENCE.md)

**For AI assistants**:
- See [CLAUDE.md](../CLAUDE.md) → Development Workflow

---

**Reorganization Date**: Feb 18, 2026
**Version**: 3.0 (Sprint/Epoch Model)
**Total Time**: ~4 hours
**Files Reorganized**: 92 → ~105 (60 active + 45 archived)
