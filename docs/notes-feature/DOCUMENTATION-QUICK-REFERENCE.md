# Documentation Quick Reference Card

**Last Updated:** 2026-01-20
**Version:** 1.0

This is a quick reference guide to navigating the Digital Garden Notes IDE documentation structure.

---

## 📍 Where Do I Start?

### I'm picking up active work (AI or continuing developer)
→ **[CURRENT-STATE.md](CURRENT-STATE.md)** - What's being worked on now, next 5 tasks, recent changes

### I need to understand the overall progress
→ **[IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md)** - M1-M6 completion status, what's next

### I'm new to the codebase
→ **[00-index.md](00-index.md)** - Master documentation index
→ **[CLAUDE.md](../../CLAUDE.md)** - Development commands, patterns, architecture overview

---

## 📁 Documentation Structure at a Glance

```
docs/notes-feature/
│
├── 🎯 START HERE
│   ├── CURRENT-STATE.md              # Active work (updated weekly)
│   ├── IMPLEMENTATION-STATUS.md      # Milestone progress (updated per milestone)
│   └── 00-index.md                   # Master index
│
├── 🏗️ ARCHITECTURE (Permanent Reference)
│   ├── 01-architecture.md            # System design
│   ├── 03-database-design.md         # ContentNode v2.0 schema
│   ├── 04-api-specification.md       # All API routes
│   └── LIQUID-GLASS-DESIGN-SYSTEM.md # Design system strategy
│
├── 📘 MILESTONE GUIDES (How Features Were Built)
│   ├── M1-FOUNDATION-README.md       # Database & utilities
│   ├── M2-CORE-API-README.md         # API routes
│   ├── M3-UI-FOUNDATION-*.md         # Panel layout & design
│   ├── M4-FILE-TREE-IMPLEMENTATION.md # File tree patterns
│   ├── M5-EDITOR-TEST-PLAN.md        # TipTap integration
│   ├── M6-FINAL-SCOPE.md             # Search & knowledge features
│   ├── M6-TAGS-IMPLEMENTATION.md     # Tags system (7,000+ lines)
│   └── M6-EXTENSION-RECOMMENDATIONS.md # Custom editor extensions
│
├── 🔧 PATTERNS & HOW-TOS
│   ├── ARCHITECTURE-RIGHT-SIDEBAR-REFACTOR.md # Component patterns
│   ├── TYPE-SAFETY-IMPROVEMENTS.md   # TypeScript patterns
│   ├── TREE-UPDATE-FLOW.md           # Drag-and-drop explained
│   ├── ADDING-NEW-CONTENT-TYPES.md   # Extend content types
│   └── URL-IDENTIFIER-STRATEGY.md    # Routing decisions
│
└── 📦 ARCHIVE
    └── sessions/                      # Historical session logs
        ├── README.md                  # Archive explanation
        └── M4/M6 session logs         # 13 historical docs
```

---

## 🎯 Common Tasks → Relevant Docs

| I want to... | Read this... |
|--------------|--------------|
| **Know what to work on next** | [CURRENT-STATE.md](CURRENT-STATE.md) → "Next 5 Tasks" |
| **Understand milestone progress** | [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) |
| **Set up development environment** | [CLAUDE.md](../../CLAUDE.md) → "Development Commands" |
| **Understand the database schema** | [03-database-design.md](03-database-design.md) |
| **Add a new API route** | [04-api-specification.md](04-api-specification.md) + [M2-CORE-API-README.md](M2-CORE-API-README.md) |
| **Build a new component** | [ARCHITECTURE-RIGHT-SIDEBAR-REFACTOR.md](ARCHITECTURE-RIGHT-SIDEBAR-REFACTOR.md) |
| **Add a TipTap extension** | [M6-EXTENSION-RECOMMENDATIONS.md](M6-EXTENSION-RECOMMENDATIONS.md) |
| **Implement the tags system** | [M6-TAGS-IMPLEMENTATION.md](M6-TAGS-IMPLEMENTATION.md) |
| **Understand drag-and-drop** | [M4-FILE-TREE-IMPLEMENTATION.md](M4-FILE-TREE-IMPLEMENTATION.md) |
| **Use the design system** | [LIQUID-GLASS-DESIGN-SYSTEM.md](LIQUID-GLASS-DESIGN-SYSTEM.md) |
| **Understand why a decision was made** | `archive/sessions/` + milestone guides |

---

## 📊 Documentation Hierarchy

### 🔴 Living Documents (Update Frequently)
- **CURRENT-STATE.md** - Updated weekly or when switching tasks
- **IMPLEMENTATION-STATUS.md** - Updated when milestones complete

### 🟡 Reference Documents (Update Rarely)
- **Milestone guides (M1-M6)** - Permanent patterns and implementation guides
- **Architecture docs (01-17)** - Core system design (changes with major refactors)
- **CLAUDE.md** - Onboarding guide (changes when patterns evolve)

### 🟢 Historical Documents (Read-Only)
- **archive/sessions/** - Session logs, completion summaries, bug fixes
- Only consulted for historical context or retrospectives

---

## 🚦 Update Guidelines

### When to Update CURRENT-STATE.md
- ✅ When starting work on a new task (mark as in_progress)
- ✅ When completing a task (mark as completed, add new tasks)
- ✅ When discovering a bug (add to "Known Issues")
- ✅ Weekly cleanup (move old changes to milestone docs)
- ✅ When making architectural decisions (add to "Decisions Made")

### When to Update IMPLEMENTATION-STATUS.md
- ✅ When a milestone reaches 100% complete
- ✅ When milestone status changes significantly (50% → 75%)
- ✅ When adding/removing milestone deliverables

### When to Update Milestone Guides
- ✅ When discovering new patterns worth documenting
- ✅ When fixing critical bugs that affect the pattern
- ❌ NOT for day-to-day bug fixes (those go in session logs)

### When to Update CLAUDE.md
- ✅ When adding new development commands
- ✅ When architectural patterns change significantly
- ✅ When technology stack changes (new major libraries)
- ❌ NOT for milestone progress (references IMPLEMENTATION-STATUS.md)

---

## 🔍 Finding Information Fast

### Search Patterns

**Find implementation patterns:**
```bash
grep -r "pattern-name" docs/notes-feature/M*-*.md
```

**Find architectural decisions:**
```bash
grep -r "decision" docs/notes-feature/*ARCHITECTURE*.md
```

**Find why something was done a certain way:**
```bash
# Check session logs in archive
grep -r "why" docs/notes-feature/archive/sessions/
```

**Find what's blocking current work:**
```bash
# Check CURRENT-STATE.md "Blockers" section
grep -A 10 "Blockers" docs/notes-feature/CURRENT-STATE.md
```

---

## 📈 Milestone Progression Flow

```
1. Read M#-PLAN.md (if exists)
   ↓
2. Check CURRENT-STATE.md for active tasks
   ↓
3. Work on implementation
   ↓
4. Update CURRENT-STATE.md (mark tasks complete, add new ones)
   ↓
5. Create session logs (M#-SESSION-*.md) for daily notes
   ↓
6. Milestone reaches 100%
   ↓
7. Update IMPLEMENTATION-STATUS.md
   ↓
8. Archive session logs to archive/sessions/
   ↓
9. Keep M#-IMPLEMENTATION.md as permanent reference
```

---

## 🎨 Documentation Responsibilities

### CURRENT-STATE.md owns:
- Active tasks (next 5)
- Recent changes (last 7 days)
- Known issues (currently blocking)
- This week's decisions
- Session notes (cleaned up weekly)

### IMPLEMENTATION-STATUS.md owns:
- Milestone completion percentages
- Deliverables per milestone
- Statistics (LOC, file counts)
- Known limitations per milestone
- Overall project timeline

### Milestone guides (M1-M6) own:
- Implementation patterns
- Architecture decisions
- "How to build similar features"
- Code examples and templates

### CLAUDE.md owns:
- Development commands
- Architecture overview (high-level)
- Key patterns and conventions
- Technology stack
- Pointers to detailed docs

---

## ⚠️ Common Pitfalls

### ❌ Don't Do This
- Update milestone status in CLAUDE.md (use IMPLEMENTATION-STATUS.md)
- Duplicate architecture info across files (reference instead)
- Keep stale session notes in CURRENT-STATE.md (archive weekly)
- Create new milestone docs without updating 00-index.md

### ✅ Do This Instead
- Reference other docs instead of duplicating
- Update CURRENT-STATE.md weekly
- Archive completed session logs
- Keep docs DRY (Don't Repeat Yourself)

---

## 🔗 Key Links

**Root Documentation:**
- [CLAUDE.md](../../CLAUDE.md) - Onboarding & patterns
- [00-index.md](00-index.md) - Complete documentation index

**Active Development:**
- [CURRENT-STATE.md](CURRENT-STATE.md) - Current work
- [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) - Milestone progress

**Architecture:**
- [01-architecture.md](01-architecture.md) - System design
- [03-database-design.md](03-database-design.md) - Database schema
- [LIQUID-GLASS-DESIGN-SYSTEM.md](LIQUID-GLASS-DESIGN-SYSTEM.md) - Design system

**Current Focus (M6 Tags):**
- [M6-TAGS-IMPLEMENTATION.md](M6-TAGS-IMPLEMENTATION.md) - Complete spec (7,000+ lines)

---

## 📞 Quick Reference Cheat Sheet

```bash
# What am I working on?
cat docs/notes-feature/CURRENT-STATE.md

# What's the overall status?
cat docs/notes-feature/IMPLEMENTATION-STATUS.md

# How do I run the dev server?
cd apps/web && pnpm dev

# How do I reset the database?
cd apps/web && npx prisma migrate reset --force

# Where's the master index?
cat docs/notes-feature/00-index.md

# What commands are available?
cat CLAUDE.md  # From repo root
```

---

**End of Quick Reference** • For complete documentation, see [00-index.md](00-index.md)
