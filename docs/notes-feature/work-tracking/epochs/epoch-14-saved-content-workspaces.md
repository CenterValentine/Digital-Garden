---
epoch: 14
title: Saved Content Workspaces
status: active
last_updated: 2026-04-07
---

# Epoch 14: Saved Content Workspaces

## Objective
Add DB-backed named workspaces on top of the existing pane/tab workspace engine so users can preserve task-specific tab and pane arrangements, lock claimed content, borrow or share overlapping content intentionally, and expire workspaces when the work is done.

## Sprint Plan

### Sprint 65: Workspace Persistence + Claims
- create a persistent Epoch 14 worktree from synced `main`
- add `ContentWorkspace` and `ContentWorkspaceItem` persistence
- guarantee a permanent Main Workspace for unassigned/catchall content
- remember each workspace's layout mode, focused pane, and pane tab stacks
- add a workspace selector and settings popup beside main-panel navigation controls
- enforce locked recursive folder/content claims through an open-intent conflict dialog
- support temporary borrowed tabs and permanent shared assignments
- add tab context actions to move or share content across workspaces
- archive/release expired workspaces without deleting content

## Design Constraints
- extend the existing content IDE chrome and glass surfaces
- keep current pane/tab density, borders, spacing, icon scale, and gold active-state language
- do not introduce a separate workspace design system

## Runtime Constraints
- Epoch 14 worktree runs on port `3014`
- worktree path: `/Users/davidvalentine/Documents/Digital-Garden/.worktrees/epoch14-s65`
- base branch: synced `main` / `origin/main`
