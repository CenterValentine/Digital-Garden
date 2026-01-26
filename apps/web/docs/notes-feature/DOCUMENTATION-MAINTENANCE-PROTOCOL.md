# Documentation Maintenance Protocol

**Version:** 1.0
**Last Updated:** 2026-01-20
**Purpose:** Ensure documentation integrity across async AI agent sessions and ad-hoc feature changes

---

## Problem Statement

Documentation can become inconsistent when:
- Multiple AI agents work concurrently on different features
- Ad-hoc feature requests bypass formal milestone tracking
- Changes are made without updating all affected documents
- Status indicators (✅, 🚧, ⏳, 📋) become stale
- Percentage completions drift from reality

---

## Core Principles

### 1. Single Source of Truth (SSOT)
Each piece of information has ONE authoritative location:

| Information Type | SSOT Location | References From |
|------------------|---------------|-----------------|
| Milestone completion % | IMPLEMENTATION-STATUS.md | CLAUDE.md, CURRENT-STATE.md, 00-index.md |
| Active tasks | CURRENT-STATE.md | None (this is the source) |
| API endpoint count | CLAUDE.md "API Architecture" | Other docs reference this |
| Feature status (✅/🚧/⏳) | IMPLEMENTATION-STATUS.md | All other docs |
| Architecture patterns | Milestone guides (M1-M6) | CLAUDE.md references these |
| Commands | CLAUDE.md | Quick reference cards reference this |

### 2. Reference, Don't Duplicate
❌ **Bad:** Copy milestone status to multiple files
✅ **Good:** "See IMPLEMENTATION-STATUS.md for current progress"

### 3. Update Sequence
When making changes, follow this order:
1. **Update SSOT first** (e.g., IMPLEMENTATION-STATUS.md)
2. **Update references second** (e.g., CURRENT-STATE.md)
3. **Verify consistency third** (run validation checks)

---

## Mandatory Update Protocol

### When Starting New Work

**Required Updates (in order):**

1. **CURRENT-STATE.md** (ALWAYS FIRST)
   ```markdown
   **Active Milestone:** M# - Feature Name
   **Current Focus:** Brief description
   ```
   - Update "What I'm Working On Right Now"
   - Add to "Recent Changes" with date
   - Mark previous task as complete in "Next 5 Tasks"

2. **Check IMPLEMENTATION-STATUS.md**
   - Verify milestone status is accurate
   - If starting new milestone, update "Current Phase" line 4

3. **Check CLAUDE.md**
   - Verify "Current Status" reflects IMPLEMENTATION-STATUS.md
   - Do NOT duplicate status, just reference

**Time Required:** 2-3 minutes
**Frequency:** Every time you start new work

---

### When Completing Features

**Required Updates (in order):**

1. **IMPLEMENTATION-STATUS.md** (ALWAYS FIRST)
   - Change status emoji: 🚧 → ✅
   - Update completion percentage
   - Add completion date
   - Move from "In Progress" to "Complete" section

2. **CURRENT-STATE.md**
   - Mark task as complete in "Next 5 Tasks"
   - Add to "Recent Changes" with date
   - Update "Decisions Made This Week"

3. **CLAUDE.md**
   - Update "Current Status" if milestone complete
   - Add to "Known Issues & Next Steps" if blockers removed

4. **00-index.md**
   - Update Quick Start section if milestone complete
   - Update "Current Development" section

**Time Required:** 5-7 minutes
**Frequency:** Every time a feature/milestone completes

---

### When Adding New API Routes

**Required Updates (in order):**

1. **API route file** (implement the route)

2. **CLAUDE.md** → "API Architecture" section
   - Update endpoint count (e.g., "14 Endpoints" → "15 Endpoints")
   - Add route to appropriate category
   - Use exact route pattern

3. **IMPLEMENTATION-STATUS.md**
   - Add route to relevant milestone's "API Routes" statistics
   - Update "Components" or "API Routes" count

4. **lib/content/api-types.ts**
   - Add TypeScript interfaces for request/response

**Example:**
```markdown
# Before
### API Architecture (14 Endpoints)

# After
### API Architecture (15 Endpoints)

**New Route:**
GET /api/notes/tags/search       # Autocomplete for tag suggestions
```

**Time Required:** 3-4 minutes
**Frequency:** Every time an API route is added

---

### When Adding New Components

**Required Updates (in order):**

1. **Component file** (implement the component)

2. **IMPLEMENTATION-STATUS.md**
   - Update "Components" count in relevant milestone
   - Add to "Key Components" section if major component

3. **CLAUDE.md** → "Critical Files Reference" (if major component)
   - Add to appropriate category

4. **Milestone guide** (if pattern-worthy)
   - Add example or pattern explanation

**Time Required:** 2-3 minutes
**Frequency:** Every time a major component is added

---

### Ad-Hoc Feature Additions (Bypass Protocol)

**Problem:** User requests feature outside formal milestones
**Example:** "Add a button to export notes to CSV"

**Protocol:**

1. **Implement the feature** (as requested)

2. **Document in CURRENT-STATE.md**
   ```markdown
   ### 2026-01-20
   - ✅ Ad-hoc: CSV export button added (user request)
   - Location: components/notes/ExportButton.tsx
   - API: GET /api/notes/export/csv
   ```

3. **Create ad-hoc session log**
   - File: `docs/notes-feature/archive/adhoc/ADHOC-2026-01-20-csv-export.md`
   - Document: What, Why, How, Where

4. **Update IMPLEMENTATION-STATUS.md** (optional)
   - Add to "Future Enhancements" section if not part of formal milestone
   - OR add to current milestone if it fits

5. **Update CLAUDE.md** (optional)
   - Only if feature is significant enough to warrant mention

**Time Required:** 5 minutes (documentation)
**Frequency:** As needed for ad-hoc requests

---

## Async Agent Coordination

### Problem: Multiple Agents Working Concurrently

**Scenario:**
- Agent A works on tags system (M6)
- Agent B works on file upload UI (M7)
- Both agents running simultaneously

**Protocol:**

#### Before Starting Work

1. **Read CURRENT-STATE.md**
   - Check "What I'm Working On Right Now"
   - Verify no conflict with your planned work

2. **Claim your work area**
   ```markdown
   ## Active Agents
   - Agent A: M6 Tags (started 2026-01-20 10:00 AM)
   - Agent B: M7 File Upload (started 2026-01-20 10:15 AM)
   ```

3. **Use branch-specific CURRENT-STATE**
   - Create: `CURRENT-STATE-M6-TAGS.md`
   - Create: `CURRENT-STATE-M7-UPLOAD.md`
   - Merge back to main `CURRENT-STATE.md` when done

#### During Work

1. **Update your branch-specific state file**
   - Don't touch main CURRENT-STATE.md
   - Avoid IMPLEMENTATION-STATUS.md conflicts

2. **Commit frequently**
   ```bash
   git add docs/notes-feature/CURRENT-STATE-M6-TAGS.md
   git commit -m "docs: M6 tags progress update"
   ```

#### After Completing Work

1. **Merge branch-specific state to main**
   ```bash
   # Review both files
   cat CURRENT-STATE.md
   cat CURRENT-STATE-M6-TAGS.md

   # Merge manually (don't overwrite other agent's work)
   # Copy your "Recent Changes" to main file
   # Copy your "Decisions Made" to main file
   ```

2. **Update IMPLEMENTATION-STATUS.md**
   - Use atomic commits
   - Update only your milestone section

3. **Delete branch-specific state file**
   ```bash
   rm CURRENT-STATE-M6-TAGS.md
   ```

**Time Required:** 5 minutes (coordination overhead)
**Frequency:** Every async agent session

---

## Validation Checks

### Manual Validation (Required Before Committing Docs)

**Run this checklist:**

```bash
# 1. Check milestone status consistency
grep -n "M6.*complete\|M6.*progress" apps/web/docs/notes-feature/*.md

# 2. Check API endpoint counts
grep -n "Endpoints\|API Routes" apps/web/docs/notes-feature/CLAUDE.md apps/web/docs/notes-feature/IMPLEMENTATION-STATUS.md

# 3. Check status emoji consistency
grep -n "✅ M6\|🚧 M6\|⏳ M6\|📋 M6" apps/web/docs/notes-feature/*.md

# 4. Check "Current Status" lines
grep -n "Current Status\|Active Milestone\|Current Phase" apps/web/docs/notes-feature/*.md

# 5. Verify no duplicate information
grep -n "Tags system" apps/web/docs/notes-feature/CLAUDE.md apps/web/docs/notes-feature/CURRENT-STATE.md
```

**Expected Results:**
- Milestone status should match across files
- API counts should be consistent
- Status emojis should reflect completion
- No contradictory statements

**Time Required:** 3-5 minutes
**Frequency:** Before every documentation commit

---

### Automated Validation (Recommended)

**Create validation script:** `scripts/validate-docs.sh`

```bash
#!/bin/bash

echo "🔍 Validating documentation consistency..."

# Extract milestone status from IMPLEMENTATION-STATUS.md
M6_STATUS=$(grep "^### ✅ M6:" apps/web/docs/notes-feature/IMPLEMENTATION-STATUS.md)

# Check CLAUDE.md references it correctly
CLAUDE_M6=$(grep "M6.*complete" apps/web/docs/notes-feature/CLAUDE.md)

# Check for contradictions
CONTRADICTIONS=$(grep -n "M6" apps/web/docs/notes-feature/*.md | grep -E "🚧.*complete|✅.*progress")

if [ -n "$CONTRADICTIONS" ]; then
  echo "❌ CONTRADICTIONS FOUND:"
  echo "$CONTRADICTIONS"
  exit 1
else
  echo "✅ No contradictions found"
fi

# Check API endpoint counts
CLAUDE_API_COUNT=$(grep -oP '\d+(?=\+? Endpoints)' apps/web/docs/notes-feature/CLAUDE.md)
STATUS_API_COUNT=$(grep -oP 'API Routes: \K\d+' apps/web/docs/notes-feature/IMPLEMENTATION-STATUS.md)

echo "API Endpoints: CLAUDE=$CLAUDE_API_COUNT, STATUS=$STATUS_API_COUNT"

if [ "$CLAUDE_API_COUNT" != "$STATUS_API_COUNT" ]; then
  echo "⚠️  API endpoint counts don't match"
fi

echo "✅ Documentation validation complete"
```

**Usage:**
```bash
chmod +x scripts/validate-docs.sh
./scripts/validate-docs.sh
```

**Integration:**
Add to pre-commit hook in `.git/hooks/pre-commit`

**Time Savings:** Automates 3-5 minutes of manual checks

---

## Git Workflow for Documentation

### Branch Strategy

**For feature work:**
```bash
# Create feature branch
git checkout -b feature/m7-file-upload

# Work on code + docs together
git add apps/web/components/FileUpload.tsx
git add apps/web/docs/notes-feature/CURRENT-STATE.md
git commit -m "feat(m7): add file upload component

- Implement drag-and-drop file upload
- Update CURRENT-STATE.md with progress
- Add to M7 task list"
```

**For documentation-only updates:**
```bash
# Create docs branch
git checkout -b docs/update-m6-completion

# Update multiple doc files
git add apps/web/docs/notes-feature/IMPLEMENTATION-STATUS.md
git add apps/web/docs/notes-feature/CURRENT-STATE.md
git add CLAUDE.md
git commit -m "docs: mark M6 as 100% complete

- Update IMPLEMENTATION-STATUS.md M6 status
- Update CURRENT-STATE.md to reflect M7 start
- Fix contradictions in CLAUDE.md"
```

### Commit Message Format

**For doc updates, use this pattern:**
```
docs: <action> <scope>

<bullet list of changes>
```

**Examples:**
```
docs: update M6 completion status
docs: fix API endpoint count contradiction
docs: add M7 tasks to CURRENT-STATE.md
docs: archive M6 session logs
```

---

## Session Handoff Protocol

### When Ending Your Session

**Create a handoff note in CURRENT-STATE.md:**

```markdown
## Notes for Next Session

### Where to Pick Up
1. Currently working on: [specific task]
2. Next step: [concrete action]
3. Blockers: [any issues encountered]

### Context to Remember
- [Important decision made]
- [Pattern discovered]
- [Issue to watch out for]

### Files Modified
- [List of files changed this session]
```

**Time Required:** 2-3 minutes
**Benefit:** Next agent (or you) can resume instantly

---

### When Starting Your Session

**Read these files in order:**

1. **CURRENT-STATE.md** (2 min read)
   - "What I'm Working On Right Now"
   - "Recent Changes (Last 7 Days)"
   - "Notes for Next Session"

2. **IMPLEMENTATION-STATUS.md** (1 min skim)
   - Current milestone status
   - Known limitations

3. **CLAUDE.md** (30 sec skim)
   - Verify commands are current
   - Check "Known Issues & Next Steps"

**Total Time:** 3-4 minutes
**Benefit:** Full context before starting work

---

## Checklists for Common Operations

### ✅ Starting New Milestone Checklist

```markdown
- [ ] Update IMPLEMENTATION-STATUS.md "Current Phase" (line 4)
- [ ] Update CURRENT-STATE.md "Active Milestone" (line 4)
- [ ] Create M#-PLAN.md if complex milestone
- [ ] Update CLAUDE.md "Current Status" section
- [ ] Update 00-index.md "Current Development" section
- [ ] Add tasks to CURRENT-STATE.md "Next 5 Tasks"
- [ ] Commit: `git commit -m "docs: start M# milestone"`
```

### ✅ Completing Milestone Checklist

```markdown
- [ ] Update IMPLEMENTATION-STATUS.md status emoji (🚧 → ✅)
- [ ] Update IMPLEMENTATION-STATUS.md completion percentage
- [ ] Update CURRENT-STATE.md "Recent Changes"
- [ ] Archive session logs to `archive/sessions/`
- [ ] Update CLAUDE.md "Known Issues & Next Steps"
- [ ] Update 00-index.md milestone references
- [ ] Run validation: `./scripts/validate-docs.sh`
- [ ] Commit: `git commit -m "docs: complete M# milestone (100%)"`
```

### ✅ Adding API Route Checklist

```markdown
- [ ] Implement route in `app/api/notes/...`
- [ ] Update CLAUDE.md API count and list
- [ ] Update IMPLEMENTATION-STATUS.md API Routes count
- [ ] Add types to `lib/content/api-types.ts`
- [ ] Update milestone guide if pattern-worthy
- [ ] Commit: `git commit -m "feat(api): add /api/notes/... endpoint"`
```

### ✅ Weekly Cleanup Checklist

```markdown
- [ ] Review CURRENT-STATE.md "Recent Changes"
- [ ] Move changes older than 7 days to milestone docs
- [ ] Update "Next 5 Tasks" (remove completed, add new)
- [ ] Clean up "Session Notes & Discoveries"
- [ ] Archive completed session logs
- [ ] Run validation: `./scripts/validate-docs.sh`
- [ ] Update "Last Updated" date in CURRENT-STATE.md
- [ ] Commit: `git commit -m "docs: weekly CURRENT-STATE cleanup"`
```

**Frequency:** Every Friday or after 7 days of work

---

## Red Flags (Warning Signs of Stale Docs)

### 🚩 Watch Out For:

1. **Percentage that doesn't add up**
   ```
   ❌ "M6 is 95% complete" but all deliverables are ✅
   ✅ "M6 is 100% complete" with all deliverables ✅
   ```

2. **Contradictory emojis**
   ```
   ❌ IMPLEMENTATION-STATUS.md: "✅ M6" but CLAUDE.md: "🚧 M6"
   ✅ Both files show: "✅ M6"
   ```

3. **Stale "Current Focus"**
   ```
   ❌ CURRENT-STATE.md: "Implementing tags" but tags are done
   ✅ CURRENT-STATE.md: "Starting M7 file upload"
   ```

4. **API count mismatch**
   ```
   ❌ CLAUDE.md: "14 endpoints" but you just added 6 more
   ✅ CLAUDE.md: "20 endpoints" reflecting reality
   ```

5. **Duplicate status information**
   ```
   ❌ CLAUDE.md: "M6: 95% complete..." (10 lines of detail)
   ✅ CLAUDE.md: "See IMPLEMENTATION-STATUS.md for progress"
   ```

**Action:** If you see these, STOP and fix before continuing work.

---

## Recovery Procedures

### If Documentation Gets Out of Sync

**Triage Protocol:**

1. **Identify the authoritative source**
   - For milestone status: IMPLEMENTATION-STATUS.md
   - For active work: CURRENT-STATE.md
   - For commands: CLAUDE.md

2. **Update dependents**
   - Fix references in other files
   - Use "See [SSOT]" pattern instead of duplicating

3. **Run validation**
   ```bash
   ./scripts/validate-docs.sh
   ```

4. **Create recovery commit**
   ```bash
   git add docs/
   git commit -m "docs: fix consistency issues

   - Updated CLAUDE.md to reference IMPLEMENTATION-STATUS.md
   - Fixed API endpoint count (was 14, now 20)
   - Removed duplicate M6 status information"
   ```

**Time Required:** 10-15 minutes
**Frequency:** Hopefully never (if protocol followed)

---

## Best Practices Summary

### DO:
✅ Update SSOT files first, then references
✅ Use "See [file]" pattern for cross-references
✅ Read CURRENT-STATE.md at start of every session
✅ Commit docs with code in same commit
✅ Run validation before committing
✅ Archive session logs when milestone complete
✅ Use descriptive commit messages for doc changes

### DON'T:
❌ Duplicate status information across files
❌ Update references before SSOT
❌ Skip validation checks
❌ Commit code without updating docs
❌ Let CURRENT-STATE.md go stale (update weekly)
❌ Leave contradictory information unfixed
❌ Work on docs without reading handoff notes

---

## Maintenance Schedule

| Task | Frequency | Time Required | Responsible |
|------|-----------|---------------|-------------|
| Update CURRENT-STATE.md | Every session | 2-3 min | Active agent |
| Weekly cleanup | Every 7 days | 10 min | Any agent |
| Validation check | Before commit | 3-5 min | Committer |
| Archive session logs | Milestone complete | 5 min | Completing agent |
| Full audit | Monthly | 30 min | Lead developer |

---

## Appendix: File Responsibility Matrix

| File | Updates | Frequency | Priority |
|------|---------|-----------|----------|
| CURRENT-STATE.md | Active agent | Every session | HIGH |
| IMPLEMENTATION-STATUS.md | Milestone owner | Milestone milestones | HIGH |
| CLAUDE.md | Any agent | As needed | MEDIUM |
| 00-index.md | Any agent | Milestone complete | MEDIUM |
| Milestone guides (M1-M6) | Feature owner | Once (permanent) | LOW |
| Session logs | Active agent | Daily | LOW |
| CONTRADICTIONS-REPORT.md | Any agent | As needed | LOW |

---

**Protocol Version:** 1.0
**Last Review:** 2026-01-20
**Next Review:** 2026-02-20 (monthly)
