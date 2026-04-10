---
sprint: 65
epoch: 14 (Saved Content Workspaces)
duration: multi-session
branch: codex/epoch-14-sprint-65
status: active
---

# Sprint 65: Workspace Persistence + Claims

## Sprint Goal
Persist named tab/pane workspaces with locking, borrowing, sharing, expiration, and a permanent Main Workspace catchall.

**Status**: Active

## Success Criteria
- [ ] `pnpm prisma generate` passes
- [ ] `pnpm exec tsc --noEmit` passes
- [ ] `pnpm build` passes
- [ ] User can create, rename, lock, unlock, archive, and expire workspaces
- [ ] Each workspace restores its own tab/pane arrangement
- [ ] Locked recursive folder/content claims show an overlap reminder before opening elsewhere
- [ ] Borrowed tabs auto-release at expiration
- [ ] Permanent sharing keeps a tab available in multiple workspaces
- [ ] Moving a tab to another workspace removes it from the current workspace when no longer assigned

## Notes
- Base branch: synced `main` / `origin/main`
- Worktree: `/Users/davidvalentine/Documents/Digital-Garden/.worktrees/epoch14-s65`
- Dev URL: `http://localhost:3014`
