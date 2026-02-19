# STATUS.md Maintenance Guide

**For AI assistants and human developers**

## Purpose

`STATUS.md` is the **single source of truth** for current development status. It provides a quick snapshot of:
- Active sprint and epoch
- Current work items and progress
- Recent completions (last 30 days)
- Known blockers and issues
- Upcoming work

## When to Update

### Always Update When:
- ✅ Completing a work item or feature
- ✅ Starting new work (Planned → In Progress)
- ✅ Encountering blockers
- ✅ Making significant progress (>10% change)
- ✅ At end of day (if daily work was done)

### Update at Sprint Milestones:
- 🎯 Sprint start (Day 1)
- 🎯 Sprint mid-point (Day 7)
- 🎯 Sprint end (Day 14)

### Don't Update For:
- ❌ Minor code changes (<5% of work item)
- ❌ Documentation-only changes (unless doc is the work item)
- ❌ Exploratory research (unless it produces deliverable insights)

## What to Update

### 1. Frontmatter (ALWAYS)

```yaml
---
last_updated: 2026-02-19  # ← Current date in YYYY-MM-DD format
current_epoch: 5          # ← Only change when epoch transitions
current_sprint: 27        # ← Only change when sprint transitions
---
```

### 2. Current Work Section

**Progress Calculation:**
```
Progress = (Completed Points / Total Points) * 100
```

**Example:**
```markdown
**Progress**: 30% complete (Day 5 of 14)
# Calculation: 7 points completed / 23 points total = 30%
```

**Work Item Status Emojis:**
- ✅ **Completed** - Work item is done and merged
- 🟡 **In Progress** - Currently being worked on (include % if trackable)
- ⚪ **Planned** - Not started yet
- 🚫 **Blocked** - Cannot proceed (move to Blocked section)

**Update Pattern:**
```markdown
# When starting work
⚪ Planned: Grid view component
# becomes
🟡 In Progress: Grid view component (10% complete)

# When completing work
🟡 In Progress: Grid view component (95% complete)
# becomes
✅ Completed: Grid view component
```

### 3. Recent Completions (Last 30 Days)

**Add new entries at the TOP:**
```markdown
## ✅ Recent Completions (Last 30 Days)

**Feb 19, 2026**: Grid View Component Complete  # ← New entry
- ✅ Responsive grid layout
- ✅ Thumbnail loading with lazy loading
- ✅ Hover effects and selection state

**Feb 18, 2026**: List View Component Complete  # ← Previous entry
- ✅ Sort controls implemented
...

**Jan 25, 2026**: Old Completion  # ← Remove if >30 days old
```

**Format for completions:**
```markdown
**[Date]**: [Feature/Work Item Name] Complete
- ✅ [Key deliverable 1]
- ✅ [Key deliverable 2]
- ✅ [Key deliverable 3]
```

### 4. Known Issues & Blockers

**Active Blockers** (high priority):
```markdown
### Active Blockers
- **Grid layout responsive issues** (High priority)
  - Problem: Grid breaks on screens <768px
  - Mitigation: Investigating CSS Grid vs Flexbox
  - ETA: Feb 20, 2026
  - Owner: @david
```

**Known Limitations** (lower priority, won't fix immediately):
```markdown
### Known Limitations
- **PDF Export**: Stub implementation (needs Puppeteer)
- **External Links**: Some SSL errors (dev bypass available)
```

**Remove blockers when resolved**, add to Recent Completions instead.

### 5. Up Next Section

**Update when sprint changes or priorities shift:**
```markdown
## 📋 Up Next (Sprint 28)

**Duration**: Mar 4-17, 2026
**Goal**: Stub implementations for new payload types

**Planned Deliverables**:
- ExcalidrawPayload (whiteboard/diagrams)
- MermaidPayload (diagrams as code)
- CanvasPayload (infinite canvas)
```

## What NOT to Change

### Never Modify:
- ❌ Historical epoch sections (Epoch 1-4)
- ❌ Sprint duration or sprint number mid-sprint
- ❌ Epoch goals after epoch start (unless formally revised)
- ❌ Roadmap section (Epoch 6-7) without strategic discussion

### Preserve:
- ✅ All entries in "Recent Completions" less than 30 days old
- ✅ All metrics and velocity data
- ✅ All active blockers until resolved
- ✅ Roadmap for Epoch 6-7 (planned future work)

## Update Workflow

### Step-by-Step Process

**1. Read Current STATUS.md**
```bash
cat docs/notes-feature/STATUS.md
```

**2. Identify What Changed**
- Completed work item?
- Started new work item?
- Progress on existing work item?
- New blocker encountered?
- Blocker resolved?

**3. Update Relevant Sections**
- Update `last_updated` in frontmatter
- Update work item status (emoji + %)
- Add to Recent Completions if work completed
- Update Known Issues if blocker changed
- Update progress percentage

**4. Verify Consistency**
- Work item status matches CURRENT-SPRINT.md
- Progress percentage accurate
- Recent Completions in chronological order (newest first)
- No duplicate entries
- Emojis used consistently

**5. Commit Changes**
```bash
git add docs/notes-feature/STATUS.md
git commit -m "docs: update STATUS.md - [what changed]"
```

## Sync with CURRENT-SPRINT.md

**STATUS.md vs CURRENT-SPRINT.md:**

| STATUS.md | CURRENT-SPRINT.md |
|-----------|-------------------|
| **Summary** view | **Detailed** view |
| High-level progress | Per-work-item progress |
| Recent completions | Daily standup notes |
| Known blockers | Blocker details + resolution steps |
| Updated when work completes | Updated daily |
| Snapshot for stakeholders | Working document for team |

**Update BOTH when:**
- Work item status changes (Planned → In Progress → Completed)
- Work item is blocked
- Sprint goals are adjusted
- Significant progress made (>10%)

**Update ONLY CURRENT-SPRINT.md for:**
- Daily standup notes
- Minor progress updates (<10%)
- Technical implementation details
- Sprint retrospective notes

**Update ONLY STATUS.md for:**
- Recent completions summary
- High-level blocker status
- Sprint-to-sprint transition
- Stakeholder-facing updates

## Examples

### Example 1: Completing a Work Item

**Before:**
```markdown
---
last_updated: 2026-02-18
---

**Progress**: 10% complete (Day 1 of 14)

**Work Items**:
- 🟡 In Progress: List view component (60% complete)
- 🟡 In Progress: Grid view component (40% complete)
- ⚪ Planned: Kanban view component
```

**After:**
```markdown
---
last_updated: 2026-02-19
---

**Progress**: 18% complete (Day 2 of 14)

**Work Items**:
- ✅ Completed: List view component
- 🟡 In Progress: Grid view component (65% complete)
- ⚪ Planned: Kanban view component

## ✅ Recent Completions (Last 30 Days)

**Feb 19, 2026**: List View Component Complete
- ✅ Sort controls (name, date, type)
- ✅ File type icons with lucide-react
- ✅ Context menu integration
- ✅ Keyboard navigation (↑↓ to select)
```

### Example 2: Encountering a Blocker

**Before:**
```markdown
**Work Items**:
- 🟡 In Progress: Grid view component (70% complete)

## 🚧 Known Issues & Blockers

### Active Blockers
None
```

**After:**
```markdown
**Work Items**:
- 🚫 Blocked: Grid view component (70% complete - blocked by responsive layout issue)

## 🚧 Known Issues & Blockers

### Active Blockers
- **Grid layout responsive issues** (High priority)
  - Problem: CSS Grid breaks on screens <768px, items overlap
  - Impact: Cannot complete Grid view component until resolved
  - Mitigation: Investigating CSS Grid auto-fit vs Flexbox approach
  - ETA: Feb 20, 2026
  - Owner: @david
```

### Example 3: Resolving a Blocker

**Before:**
```markdown
**Work Items**:
- 🚫 Blocked: Grid view component (70% complete)

### Active Blockers
- **Grid layout responsive issues** (High priority)
```

**After:**
```markdown
**Work Items**:
- 🟡 In Progress: Grid view component (85% complete)

### Active Blockers
None

## ✅ Recent Completions (Last 30 Days)

**Feb 20, 2026**: Grid Layout Responsive Issue Resolved
- ✅ Switched from CSS Grid to Flexbox with dynamic columns
- ✅ Tested on mobile (375px), tablet (768px), desktop (1920px)
- ✅ Grid view component unblocked, resuming work
```

## Automation Opportunities

### Future Enhancements:
- [ ] Auto-update `last_updated` on file save
- [ ] Auto-calculate progress from CURRENT-SPRINT.md
- [ ] Auto-archive completions >30 days old
- [ ] Auto-sync work item status with CURRENT-SPRINT.md
- [ ] GitHub Actions to validate STATUS.md format

## Troubleshooting

**Problem**: STATUS.md and CURRENT-SPRINT.md show different work item status

**Solution**: CURRENT-SPRINT.md is the source of truth for detailed work. Sync STATUS.md to match.

**Problem**: Progress percentage doesn't match completed work

**Solution**: Recalculate using `(Completed Points / Total Points) * 100`

**Problem**: Recent Completions section is too long

**Solution**: Archive completions >30 days old to epoch history docs

---

**See Also:**
- [CURRENT-SPRINT.md](work-tracking/CURRENT-SPRINT.md) - Detailed sprint tracking
- [Sprint/Epoch Methodology](work-tracking/README.md) - SDLC workflow
- [CLAUDE.md](../CLAUDE.md) - AI assistant development guide
