---
epoch: 14
title: Saved Content Workspaces
status: shipped
shipped_at: 2026-04-30
shipped_via: merge series in origin/main (a9c5570 → 635582a → e0019fc → 04a44ce → 806a8ae → cf63d72 → e7c0beb)
last_updated: 2026-05-17
---

# Epoch 14: Saved Content Workspaces

> **Status: shipped 2026-04-30.** The work landed across the April merge series listed in the frontmatter above (last fixup `e7c0beb` — "Fix workspace persistence and tree rename drafts"). The actual implementation ships under `extensions/workplaces/` (built-in extension), with `ContentWorkspace` + `ContentWorkspaceItem` Prisma models and `app/api/content/workspaces/{route,[id],open-intent,reset}.ts` route handlers. The original Sprint-65 planning text below is preserved as the epoch's historical record but the worktree path it references was cleaned up after merge.

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
