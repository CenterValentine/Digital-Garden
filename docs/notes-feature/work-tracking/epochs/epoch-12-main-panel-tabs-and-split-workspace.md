---
epoch: 12
title: Main Panel Tabs + Split Workspace
status: active
last_updated: 2026-03-24
---

# Epoch 12: Main Panel Tabs + Split Workspace

## Objective
Replace the main panel’s single-document model with a split-ready workspace model that supports:
- multiple open content tabs
- URL-restorable tab sessions
- per-tab sidebar/runtime isolation
- future dual-pane and quad-pane layouts without reworking state again

## Sprint Plan

### Sprint 50: Tab Foundation
- pane-aware workspace state
- real tab strip in the main panel
- preview-tab reuse until explicit pinning
- URL persistence for active content and open tabs
- delete cleanup for open tabs

### Sprint 51: Sidebar Isolation + Workspace Preservation
- content-scoped outline state
- content-scoped editor instance and AI edit state
- pane-scoped history
- right-sidebar state restoration per content

### Sprint 52: Dual-Pane Split
- dual-pane rendering
- focused pane controls shared sidebar context
- per-pane tab stacks

### Sprint 53: Quad Split
- four-corner layout
- focused-pane activation rules
- final stability hardening

## Design Constraints
- extend the existing content IDE styling
- keep current glass surfaces, spacing, borders, and highlight language
- do not introduce a parallel tab design system

## Runtime Constraints
- Epoch 12 worktree runs on port `3001`
- worktree is kept outside `/private/tmp` to avoid restart loss
