# Sprint Backlog Guide

**How to handle incomplete work and backlog management in sprint-based development**

## Philosophy: Ship Working Software

**Core Principle**: It's better to ship working core features than to pursue perfection on everything.

When a sprint ends or work items aren't completed:
- ✅ Mark completed work as ✅ in STATUS.md "Recent Completions"
- ✅ Move incomplete work to BACKLOG.md with clear context
- ✅ Update sprint status to "complete" if core goals met
- ✅ Celebrate shipped working software

**Don't:**
- ❌ Mark sprint as "incomplete" if core goals achieved
- ❌ Rush to finish everything at the expense of quality
- ❌ Feel pressured to complete 100% of committed points

## When to Backlog Work

### Scenario 1: Sprint Completes Early (Core Goals Met)

**Example**: Sprint 27 - Folder Views
- **Committed**: 23 story points (5 views + extras)
- **Core Goal**: Implement folder views
- **Completed**: List, Grid, Kanban views (11 pts)
- **Not Completed**: Table, Timeline, Persistence, Switcher (12 pts)

**Decision**: ✅ **Backlog** advanced features, mark sprint COMPLETE
- Core goal achieved (working folder views)
- Advanced features are nice-to-have, not blockers
- Better to ship 3 working views than 5 half-baked views

### Scenario 2: Sprint Ends Without Core Goals

**Example**: Hypothetical Sprint 30 - Authentication System
- **Committed**: 20 story points
- **Core Goal**: Implement user authentication
- **Completed**: Login UI (3 pts)
- **Not Completed**: OAuth backend, session management, password reset (17 pts)

**Decision**: ⚠️ **Incomplete Sprint**, carry forward work
- Core goal NOT achieved (auth system non-functional)
- Move all incomplete work to next sprint as high priority
- Don't mark sprint as complete

### Scenario 3: Scope Reduction Mid-Sprint

**Example**: Discovered a simpler solution that achieves the same goal
- **Original Scope**: Build custom search engine (13 pts)
- **New Scope**: Integrate existing library (5 pts)

**Decision**: ✅ **Backlog** original work, ship simplified solution
- Core goal achieved with less effort
- No need to complete original complex approach
- Document decision in sprint retrospective

## How to Backlog Work Items

### 1. Update CURRENT-SPRINT.md

**Before:**
```markdown
### Planned (2 items, 8 points)
- [ ] **FP-004**: Table view component (3 pts)
- [ ] **FP-005**: Timeline view component (5 pts)
```

**After:**
```markdown
### ✅ Completed (1 item, 3 points)
- [x] **FP-001**: List view component (3 pts) - ✅ COMPLETE

### 📦 Backlogged to Sprint 28 (2 items, 8 points)
**Reason**: Core views delivered, advanced features deferred as nice-to-have

- [ ] **FP-004**: Table view component (3 pts) - Advanced feature
- [ ] **FP-005**: Timeline view component (5 pts) - Advanced feature
```

### 2. Update BACKLOG.md

Add backlogged items to the **top** of the next sprint section with context:

```markdown
## Sprint 28: Advanced Folder Views + Payload Stubs

### Backlogged from Sprint 27 (2 items, 8 points)
**Context**: Core folder views (List, Grid, Kanban) shipped in Sprint 27. These advanced features deferred as nice-to-have.

- [ ] **FP-004**: Table view component (3 pts) - Advanced folder view
  - Sortable columns (name, type, size, date)
  - Column resize and reorder

- [ ] **FP-005**: Timeline view component (5 pts) - Advanced folder view
  - Chronological visualization
  - Date grouping (day, week, month)
```

### 3. Update STATUS.md

**Move completed work to "Recent Completions":**

```markdown
## ✅ Recent Completions (Last 30 Days)

**Feb 18, 2026**: Sprint 27 Core Folder Views Complete
- ✅ List view component (sort controls, file type icons, keyboard navigation)
- ✅ Grid view component (responsive layout, thumbnails, hover effects)
- ✅ Kanban view component (drag-and-drop, status columns)
- ✅ Folder organization system operational
```

**Update "Active Sprint" section:**

```markdown
### Active Sprint: Sprint 27 ✅ COMPLETE
**Duration**: Feb 18 - Mar 3, 2026 (Completed early)
**Goal**: Implement core folder view modes

**Progress**: 100% complete (Core views delivered)

**Completed Work Items**:
- ✅ List view component
- ✅ Grid view component
- ✅ Kanban view component
- ✅ Folder organization system

**Backlogged to Sprint 28** (Nice-to-have features):
- ⚪ Table view component (advanced feature)
- ⚪ Timeline view component (advanced feature)
- ⚪ View preference persistence (enhancement)
- ⚪ View switcher UI (enhancement)
```

### 4. Add Retrospective Notes

Document **why** work was backlogged in sprint retrospective:

```markdown
## Retrospective (Completed Feb 18, 2026)

### What went well:
- ✅ Core folder views (List, Grid, Kanban) delivered on Day 1
- ✅ Effective scope management - recognized advanced features as nice-to-have
- ✅ Shipped working software instead of pursuing perfection

### What could improve:
- ⚠️ Initial sprint planning over-committed (23 pts vs 21 capacity)
- 💡 Consider "MVP + Enhancements" planning approach for future sprints

### Action items:
- 📋 Add backlogged items to Sprint 28 backlog
- 🎯 Use "Core + Nice-to-Have" labels in future sprint planning
```

## Backlog Workflow (AI Assistant Checklist)

When a sprint ends or scope changes:

- [ ] **Step 1**: Review completed work vs sprint goal
  - Did we achieve the core goal?
  - What's the minimum viable deliverable?

- [ ] **Step 2**: Categorize incomplete work
  - **Core blockers**: Carry forward to next sprint (high priority)
  - **Nice-to-have**: Backlog for future sprints (medium priority)
  - **No longer needed**: Archive or delete

- [ ] **Step 3**: Update CURRENT-SPRINT.md
  - Mark completed items with ✅
  - Move backlogged items to "Backlogged to Sprint X" section
  - Add context explaining why work was backlogged

- [ ] **Step 4**: Update BACKLOG.md
  - Add backlogged items to top of next sprint section
  - Include context from current sprint
  - Preserve original story point estimates

- [ ] **Step 5**: Update STATUS.md
  - Add completed work to "Recent Completions"
  - Update "Active Sprint" status (COMPLETE vs in progress)
  - List backlogged items under sprint summary

- [ ] **Step 6**: Document in Retrospective
  - Explain why work was backlogged
  - Identify what went well vs what could improve
  - Create action items for next sprint

## Common Backlog Scenarios

### Scenario A: Feature Works, Polish Needed

**Example**: Search works but lacks autocomplete

**Action**: ✅ Ship working search, backlog autocomplete as enhancement

**Rationale**: Users can search now, autocomplete is additive

### Scenario B: Feature Partially Implemented

**Example**: Authentication login works, but password reset doesn't

**Action**: ⚠️ Depends on blockers
- If reset is critical → Carry forward as high priority
- If reset is nice-to-have → Backlog with clear context

### Scenario C: Discovered Better Approach

**Example**: Built custom pagination, then found library that does it better

**Action**: ✅ Ship library solution, archive custom work

**Rationale**: Achieving the goal is what matters, not the original plan

### Scenario D: External Blocker

**Example**: Waiting for third-party API access

**Action**: 🚫 Mark as blocked, move to backlog with blocker context

**Context Note**: "Blocked pending API key approval from vendor (est. 1 week)"

## Labels for Backlogged Work

Use clear labels to indicate **why** work was backlogged:

- `advanced feature` - More sophisticated than MVP requires
- `enhancement` - Nice-to-have improvement
- `optimization` - Performance or polish
- `nice-to-have` - Non-critical addition
- `blocked` - External dependency preventing completion
- `deferred` - Postponed due to priority shift

## Best Practices

### Do:
- ✅ Ship working core features over incomplete comprehensive features
- ✅ Add context explaining why work was backlogged
- ✅ Celebrate completed work in retrospectives
- ✅ Re-evaluate backlogged work each sprint planning
- ✅ Archive backlog items that are no longer relevant

### Don't:
- ❌ Mark sprints as "failed" if core goals achieved
- ❌ Rush to complete everything at expense of quality
- ❌ Let backlog grow indefinitely without review
- ❌ Backlog work without clear context
- ❌ Commit to backlogged work without re-estimation

## Example: Sprint 27 Backlog Process

**Context**: Sprint 27 aimed to implement 5 folder views but completed 3 core views on Day 1.

**Step-by-Step Process:**

1. **Assess Completion**:
   - ✅ List, Grid, Kanban views complete and working
   - ⏸️ Table, Timeline views not started
   - ⏸️ Persistence and Switcher UI not started
   - **Core Goal**: ✅ Achieved (folder views working)

2. **Categorize Incomplete Work**:
   - Table view: Advanced feature (nice-to-have)
   - Timeline view: Advanced feature (nice-to-have)
   - Persistence: Enhancement (nice-to-have)
   - Switcher UI: Enhancement (nice-to-have)

3. **Update CURRENT-SPRINT.md**:
   - Marked List, Grid, Kanban as ✅ COMPLETE
   - Moved Table, Timeline, Persistence, Switcher to "Backlogged to Sprint 28"
   - Added context: "Core views delivered, advanced features deferred"

4. **Update BACKLOG.md**:
   - Added section "Backlogged from Sprint 27" at top of Sprint 28
   - Included context explaining why they were deferred
   - Preserved original story point estimates

5. **Update STATUS.md**:
   - Added Sprint 27 completion to "Recent Completions"
   - Updated "Active Sprint" to show COMPLETE status
   - Listed backlogged items with ⚪ emoji

6. **Document Retrospective**:
   - What went well: Core views delivered on Day 1
   - What could improve: Over-committed initially
   - Action items: Use "Core + Nice-to-Have" planning

**Outcome**: Sprint 27 marked as ✅ COMPLETE, advanced features safely backlogged for Sprint 28.

## Related Documentation

- [CURRENT-SPRINT.md](CURRENT-SPRINT.md) - Active sprint tracking
- [BACKLOG.md](BACKLOG.md) - Prioritized work items
- [STATUS.md](../STATUS.md) - Single source of truth
- [README.md](README.md) - Sprint/epoch methodology
- [STATUS-MAINTENANCE-GUIDE.md](../STATUS-MAINTENANCE-GUIDE.md) - Maintaining STATUS.md

---

**Created**: Feb 18, 2026
**Last Updated**: Feb 18, 2026
**Version**: 1.0
