---
sprint: 54
epoch: 12 (Main Panel Tabs + Split Workspace)
duration: multi-session
branch: codex/epoch-12-sprint-54
status: in_progress
---

# Sprint 54: Tab Drag + Adaptive Pane Reshaping

## Sprint Goal
Make tab drag-and-drop a first-class workspace interaction so users can move tabs between panes, create new splits directly from a drag, and trust the workspace to reshape itself to the simplest valid layout when pane occupancy changes.

**Status**: In Progress

## Success Criteria
- [x] `pnpm build` passes
- [x] Tabs can be dragged between existing visible panes
- [x] Single-pane workspace exposes standardized drop targets to create vertical, horizontal, or quad splits
- [x] Direct tab dragging updates pane preference as the source of truth for future layout derivation
- [x] Workspace collapses to the simplest valid layout when tab moves empty panes
- [ ] Manual smoke on `http://localhost:3001`

## Implemented
- `state/content-store.ts`
  - adds `moveContentTabToPane()` for drag-driven pane reassignment
  - derives the next layout from persistent tab axis preferences after direct moves
  - collapses the workspace to the simplest valid layout consistent with the updated tab placement
- `components/content/MainPanelWorkspace.tsx`
  - makes pane shells droppable for tab moves
  - adds single-pane standardized drag targets for right split, bottom split, and quad split creation
- `components/content/headers/MainPanelHeader.tsx`
  - makes tabs draggable and keeps drag styling conservative within the existing tab system

## Notes
- This worktree runs on port `3001`.
- Sprint 53 is committed at `99f48ba` before Sprint 54 work began.
- Full interaction smoke is still pending; current verification is build-only.
