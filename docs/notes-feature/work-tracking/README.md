# Work Tracking - Sprint/Epoch Model

**Modern SDLC practices** for the Digital Garden Content IDE.

## Overview

We use a **sprint/epoch development model** that combines:
- **Sprints**: Short 2-week iterations with concrete deliverables
- **Epochs**: Strategic 8-12 week periods with thematic goals

This approach replaces our previous milestone-based tracking (M1-M11) with a more agile, iterative workflow.

## Structure

```
work-tracking/
├── README.md (this file)
├── CURRENT-SPRINT.md          # Active sprint details (Sprint 27)
├── BACKLOG.md                 # Prioritized work items for upcoming sprints
│
├── epochs/                    # Planned epochs
│   ├── epoch-5-advanced-content-types.md (ACTIVE)
│   ├── epoch-6-collaboration.md (PLANNED)
│   └── epoch-7-ai-integration.md (PLANNED)
│
└── history/                   # Completed work
    ├── sprints/               # Sprint retrospectives (archived after completion)
    ├── epoch-1-foundation.md
    ├── epoch-2-content-experience.md
    ├── epoch-3-media-storage.md
    └── epoch-4-export-extensibility.md
```

## Workflow

### Sprint Planning (Every 2 weeks)

**1. Review Backlog**
- Prioritize work items based on epoch goals
- Estimate story points (1-13 pts scale)
- Consider dependencies and risks

**2. Create Sprint Document**
- Copy `CURRENT-SPRINT.md` template
- Define sprint goal and success criteria
- Commit to work items within capacity
- Identify blockers and risks

**3. Sprint Kickoff**
- Review sprint goal with team
- Clarify work item acceptance criteria
- Set up communication channels

### Daily Tracking

**Update `CURRENT-SPRINT.md` daily:**
- Add standup notes (what did, doing, blockers)
- Move work items between states:
  - ⚪ Planned → 🟡 In Progress → ✅ Completed
- Flag blockers immediately
- Update progress percentages

**Template:**
```markdown
### [Date] (Day X)

**What I did yesterday:**
- Completed FP-001 (List view component)

**What I'm doing today:**
- Starting FP-002 (Grid view component)

**Blockers:**
- None
```

### Sprint Retrospective (End of sprint)

**1. Complete Retrospective Section**
- What went well
- What could improve
- Action items for next sprint

**2. Calculate Velocity**
- Committed points vs completed points
- Update velocity baseline for next sprint

**3. Archive Sprint**
- Move completed sprint to `history/sprints/sprint-XX.md`
- Create new `CURRENT-SPRINT.md` from template

**4. Update Epoch Progress**
- Update cumulative progress in epoch document
- Adjust remaining estimates
- Update risks and mitigations

### Epoch Review (Every 8-12 weeks)

**1. Evaluate Epoch Goals**
- Compare actual vs planned outcomes
- Measure success metrics
- Document lessons learned

**2. Archive Epoch**
- Move epoch doc to `history/`
- Update `STATUS.md` with completion summary

**3. Plan Next Epoch**
- Define theme and strategic goals
- Break down into sprints
- Identify dependencies and risks
- Create new epoch document in `epochs/`

## Metrics

### Story Points

**Scale:**
- 1 pt: Simple task (<2 hours)
- 2 pts: Small task (2-4 hours)
- 3 pts: Medium task (4-8 hours)
- 5 pts: Large task (1-2 days)
- 8 pts: Very large task (2-3 days)
- 13 pts: Epic (needs breakdown into smaller tasks)

**Velocity:**
- Track average story points completed per sprint
- Use 3-sprint rolling average for planning
- Adjust capacity based on team availability

### Success Metrics

**Sprint Level:**
- Velocity (points completed / points committed)
- Completion rate (work items completed / committed)
- Blocker resolution time

**Epoch Level:**
- Goal achievement (% of strategic goals met)
- Feature delivery (features shipped vs planned)
- Technical debt reduction

## Templates

### Sprint Template

```markdown
---
sprint: [NUMBER]
epoch: [NUMBER] ([EPOCH NAME])
duration: [START DATE] - [END DATE]
status: active
day: 1
---

# Sprint [NUMBER]: [SPRINT TITLE]

## Sprint Goal
[Clear, concise goal statement]

## Success Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Work Items

### In Progress
- [ ] **ID**: Description (X pts) - @owner - Y% complete

### Planned
- [ ] **ID**: Description (X pts)

### Blocked
None

## Sprint Metrics
- **Capacity**: X story points
- **Committed**: Y story points
- **Velocity (last 3)**: A-B points/sprint

## Daily Notes
[Daily standup notes here]

## Retrospective (End of Sprint)
_To be completed_
```

### Epoch Template

```markdown
---
epoch: [NUMBER]
name: "[EPOCH NAME]"
theme: "[THEME DESCRIPTION]"
duration: [START] - [END] ([WEEKS] weeks)
status: active
current_sprint: [NUMBER]
---

# Epoch [NUMBER]: [EPOCH NAME]

## Vision
[Strategic vision for this epoch]

## Strategic Goals
1. Goal 1
2. Goal 2

## Success Metrics
- [ ] Metric 1
- [ ] Metric 2

## Sprints
[List of sprints in this epoch]

## Dependencies
- **Blockers**: [List]
- **Prerequisites**: [List]

## Risks & Mitigations
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| ... | ... | ... | ... |

## Related Documentation
[Links to relevant docs]

## Changelog
[Date-stamped updates]
```

## Migration from Milestones

**Old (Milestone-Based):**
- M1: Foundation
- M2: Core API
- M3: UI Foundation
- ...

**New (Epoch-Based):**
- Epoch 1: Foundation (M1-M3)
- Epoch 2: Content Experience (M4-M6)
- Epoch 3: Media & Storage (M7)
- Epoch 4: Export & Extensibility (M8-M9 Phase 2)

**Benefits:**
- ✅ Clear time boundaries (sprints = 2 weeks, epochs = 8-12 weeks)
- ✅ Regular retrospectives and improvements
- ✅ Data-driven planning with velocity tracking
- ✅ Strategic themes guide tactical decisions
- ✅ Easier to communicate progress to stakeholders

## Best Practices

### Do's ✅
- Update `CURRENT-SPRINT.md` daily
- Keep sprint goals focused and achievable
- Break down large tasks (>8 pts) into smaller ones
- Celebrate wins in retrospectives
- Use data (velocity) for planning
- Document lessons learned

### Don'ts ❌
- Don't over-commit to work items
- Don't skip retrospectives
- Don't change sprint scope mid-sprint (unless critical)
- Don't ignore blockers
- Don't estimate without understanding requirements
- Don't plan more than 1 epoch ahead in detail

---

**See Also:**
- [STATUS.md](../STATUS.md) - Single source of truth for current status
- [CURRENT-SPRINT.md](CURRENT-SPRINT.md) - Active sprint details
- [BACKLOG.md](BACKLOG.md) - Prioritized work items
- [00-START-HERE.md](../00-START-HERE.md) - Documentation index
