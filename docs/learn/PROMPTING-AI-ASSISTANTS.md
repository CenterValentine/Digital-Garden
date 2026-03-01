# Prompting AI Assistants for Documentation Updates

**Purpose:** Learn when and how to add explicit documentation reminders to AI prompts

**Last Updated:** Feb 19, 2026

---

## When AI Handles Documentation Automatically

The AI assistant reads [CLAUDE.md](/CLAUDE.md) which contains comprehensive instructions for updating documentation during sprint work. For normal sprint tasks, **no explicit reminders are needed**.

**AI will automatically update:**
- `STATUS.md` when completing work items
- `CURRENT-SPRINT.md` for detailed sprint tracking
- `BACKLOG.md` when backlogging work
- Recent Completions section when features ship

---

## When You SHOULD Add Explicit Reminders

Even though CLAUDE.md has instructions, there are cases where explicit reminders prevent confusion:

### ⚠️ One-Off Tasks
Tasks not part of sprint tracking (bug fixes, experiments, refactors)

**Why:** AI might not recognize these as "work items" requiring documentation updates

**Example:**
```
Fix the SSL certificate error in external link fetcher.
**Also update STATUS.md Known Limitations if this resolves the issue.**
```

### ⚠️ Bug Fixes
Quick fixes that might not trigger sprint update logic

**Why:** Bug fixes often feel "outside" the sprint flow even if they're important

**Example:**
```
Fix the race condition in file upload finalization.
**Add to Recent Completions if significant (affects UX).**
```

### ⚠️ Documentation-Only Changes
Changes that only touch docs, not code

**Why:** Less obvious that STATUS.md needs updating

**Example:**
```
Update the PRISMA-MIGRATION-GUIDE with the new drift resolution workflow.
**Don't update STATUS.md (documentation maintenance, not feature work).**
```

### ⚠️ Experimental Work
Research, prototypes, or exploratory tasks

**Why:** Unclear if/when this should be tracked in sprint system

**Example:**
```
Research alternative PDF export libraries (Puppeteer vs PDF-lib).
**This is exploratory - don't update sprint tracking yet.
Document findings in a new guide under guides/export/**
```

### ⚠️ Cleanup/Refactoring
Architectural changes that don't ship new features

**Why:** Impact on sprint goals may be unclear

**Example:**
```
Refactor the storage provider factory to use dependency injection.
**Update STATUS.md Technical Debt section when complete.**
```

---

## Example Prompts

### ❌ **Bad** (Vague, No Context)
```
Fix the thing in the editor
```
**Problems:**
- No context for what "thing" means
- No indication of documentation impact
- No sprint/backlog guidance

### ✅ **Good** (Clear Task, AI Handles Documentation)
```
Implement the Table view component from Sprint 28 backlog (FP-004).
Include sortable columns and filter controls per the spec.
```
**Why it works:**
- References sprint backlog item (FP-004)
- AI recognizes this as sprint work
- CLAUDE.md instructions kick in automatically
- AI will update STATUS.md, CURRENT-SPRINT.md

### ✅ **Good** (One-Off Task, Explicit Reminder)
```
Fix the SSL certificate error in external link fetcher.
**Also update STATUS.md Known Limitations if this resolves the issue.**
```
**Why it works:**
- Clear what needs fixing
- Explicit documentation reminder
- Conditional ("if this resolves") gives AI judgment call

### 🌟 **Excellent** (Clear Expectations, Scoped Documentation)
```
Research alternative PDF export libraries. This is exploratory work.

**Documentation updates:**
- **Don't update sprint tracking yet** (not committed work)
- Document findings in a new guide: `guides/export/PDF-LIBRARY-COMPARISON.md`
- Include pros/cons, performance benchmarks, and recommendation
```
**Why it's excellent:**
- Clear scope (research, not implementation)
- Explicit "don't update sprint" prevents premature tracking
- Specific documentation output (new guide)
- Outlines what the guide should contain

### 🌟 **Excellent** (Multi-Part Task, Clear Documentation Flow)
```
Implement ExcalidrawPayload schema and stub viewer (EX-001, EX-002 from Sprint 28).

**Implementation:**
1. Add Prisma schema for ExcalidrawPayload
2. Create stub viewer component with "Coming Soon" placeholder
3. Add "New → Excalidraw" context menu item

**Documentation updates:**
- Update STATUS.md when both items complete (not incrementally)
- Mark EX-001, EX-002 as ✅ in CURRENT-SPRINT.md
- Add to Recent Completions: "Excalidraw content type foundation"
```
**Why it's excellent:**
- References specific backlog items (EX-001, EX-002)
- Clear implementation steps
- Explicit documentation workflow (when to update, what to mark)
- Prevents partial updates (waits for both items to complete)

---

## Reminder Template

When in doubt, use this template:

```
[Your task description]

Documentation updates:
- Update STATUS.md if [condition]
- Add to Recent Completions if [significance criteria]
- Update BACKLOG.md if this creates new work items
- [Or: Don't update sprint tracking - this is [reason]]
```

---

## Best Practices

### ✅ Do:
- **Reference backlog items** by ID (FP-004, EX-001) when applicable
- **Be explicit about scope** (is this sprint work, experimental, or cleanup?)
- **Specify documentation output** if you want a new guide or reference doc
- **Trust CLAUDE.md** for normal sprint work (don't over-specify)

### ❌ Don't:
- **Over-remind on sprint work** (AI already knows from CLAUDE.md)
- **Leave scope ambiguous** for non-sprint tasks
- **Forget to specify "don't update"** for exploratory work
- **Mix multiple unrelated tasks** in one prompt (breaks documentation flow)

---

## When to Reference This Guide

Use this guide when you're about to prompt an AI assistant and you're unsure:
- "Should I add a documentation reminder?"
- "Is this task obvious enough for AI to track automatically?"
- "How do I structure a prompt for exploratory work?"

**General rule:** If the task is in the sprint backlog → trust CLAUDE.md. If it's outside the sprint flow → add explicit reminders.

---

## Related Documentation

- [CLAUDE.md](/CLAUDE.md) - Complete AI development guide (lines 887-1021 cover documentation)
- [STATUS-MAINTENANCE-GUIDE.md](../notes-feature/guides/STATUS-MAINTENANCE-GUIDE.md) - How to update STATUS.md
- [SPRINT-BACKLOG-GUIDE.md](../notes-feature/work-tracking/SPRINT-BACKLOG-GUIDE.md) - Sprint workflow

---

**Created:** Feb 19, 2026
**Last Updated:** Feb 19, 2026
**Version:** 1.0
