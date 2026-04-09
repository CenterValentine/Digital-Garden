---
status: planned
last_updated: 2026-04-07
start_sprint: 58
worktree: /Users/davidvalentine/Documents/Digital-Garden/.worktrees/epoch-13-people-collab
branch: codex/epoch-13-people-collab
base_pr: 22
base_merge_commit: 2acc6d9b9fc8bad4a8e7e634f865c19607b0e0ce
---

# Epoch 13: People + Collaboration

## Goal

Build the People system and safe collaboration foundations without destabilizing the core content tree. The epoch starts at Sprint 58 and is implemented in its own worktree from the latest merged Sprint 55 PR.

## Source Control Plan

- Canonical repo: `/Users/davidvalentine/Documents/Digital-Garden`
- Worktree: `/Users/davidvalentine/Documents/Digital-Garden/.worktrees/epoch-13-people-collab`
- Branch: `codex/epoch-13-people-collab`
- Base: `origin/main` after merged PR #22, `2acc6d9b9fc8bad4a8e7e634f865c19607b0e0ce`
- All Epoch 13 docs and implementation changes stay in the worktree until they are intentionally promoted.

## Architecture Decisions

- Do not add `group` as a `ContentType`.
- Model groups/subgroups as People-domain records and render mounted groups folder-like in the file tree.
- Use `People` as the required default group, not `Unassigned`.
- Use `Add` in creation menus instead of `New`.
- Owners and signed-in collaborators with explicit access use `/content` for Hocuspocus-backed collaboration.
- `/share` is public-facing; public non-user links are view-only in v1.
- Access levels include at least `view` and `edit`.

## People Model

- Add canonical People-domain models for groups/subgroups, people, file-tree mounts, and person mentions.
- Add a single default `People` group per owner and create it automatically when the People system initializes for a user.
- Add exactly-one file-tree representation per person or group/subgroup through a mount table and database uniqueness.
- Allow groups/subgroups to contain subgroups, people, and direct notes/files/folders.
- Keep People view canonical; the standard file tree renders representative mount nodes rather than duplicating People records.
- Add tree DTO metadata such as `treeNodeKind: "content" | "person" | "peopleGroup"` so the UI can render People mounts folder-like without pretending they are normal `ContentNode` folders.

## File Tree Rules

- Add `Add -> Person/Group` to both the file tree context menu and the `+` menu.
- The add flow searches people, groups, and subgroups, and also supports creating a person, group, or subgroup.
- Adding a person already represented anywhere in the file tree is blocked with a clear error and a way to focus the existing location.
- Adding a group/subgroup that would duplicate represented descendants is blocked first, then offers an explicit overwrite/remount action.
- Confirmed remount removes prior conflicting mounts and creates the selected group/subgroup mount transactionally.
- Re-adding the same mounted person/group elsewhere offers to move the existing mount rather than create another.
- Dragging a person representative out of a mounted group/subgroup asks whether to keep or change People-view group membership.
- Moving controlled content inside the People mirrored area is allowed and reassigns it to the target person/group transactionally.
- Moving controlled content outside the People mirrored area is allowed only after a recurring warning; confirmation clears the People assignment and places the content under normal folder jurisdiction. The warning includes a "do not show again" preference.
- Client drop prevention is a convenience only. Create, move, duplicate, delete/restore, and mount APIs must call a shared server-side People tree policy.

## Collaboration Model

- Add a central access resolver for owner, signed-in grants, and share-link access.
- Keep owner `/content` access fully supported by Hocuspocus.
- Signed-in collaborators with `edit` grants can edit through `/content`; signed-in collaborators with `view` grants open read-only.
- Public `/share` access is view-only for non-users in v1.
- Add same-repo Hocuspocus service and Yjs persistence after the People tree guardrails are in place.
- Prevent legacy REST autosave from racing Hocuspocus/Yjs once a note is collaboration-enabled.

## Mentions

- Add a `@person` TipTap mention extension.
- Search only accessible People records for suggestions.
- Sync `@person` mentions to a normalized mention table when note content saves.
- Clicking an `@person` opens that person. If they are mounted in the file tree, reveal and focus the mounted location; otherwise open the People view/person detail without fabricating a mount.

## Sprint Breakdown

### Sprint 58: Foundations

- Create/update docs for Epoch 13.
- Rename file-tree creation menu wording from `New` to `Add`.
- Add People schema foundations and validation scaffolding.
- Add access-level planning for `view`/`edit` collaboration.

### Sprint 59: People View + Mount UX

- Build People view with group/subgroup tree and default `People` group.
- Build person detail surface.
- Add `Add -> Person/Group` search and creation flows for file-tree mounts.

### Sprint 60: Tree Policy Hardening

- Implement shared server-side People tree policy.
- Add conflict/remount flows and detach/reassign warnings.
- Add database constraints and transaction tests for mount uniqueness and content reassignment.

### Sprint 61: Person Mentions

- Add `@person` TipTap extension and autocomplete.
- Add mention sync and click-to-open/focus behavior.
- Add API tests for suggestion scope and mention persistence.

### Sprint 62: Hocuspocus Collaboration

- Add same-repo Hocuspocus service.
- Add Yjs persistence and collaboration tokens.
- Enable `/content` owner and signed-in collaborator collaboration modes.

### Sprint 63: Share + Media Prototype

- Add public `/share` view-only path for non-users.
- Ensure signed-in `/share` users with grants get expected `view`/`edit` behavior.
- Prototype small P2P WebRTC rooms if Hocuspocus stability gates pass.

## Test Strategy

- Prisma/transaction tests for default group creation, unique mounts, conflicting remounts, and controlled content assignment.
- API tests for People tree, person/group search, mount conflicts, and move-policy denial/confirmation cases.
- UI smoke tests for Add menu wording, People view, mounted group rendering, and focus/reveal from `@person`.
- Collaboration tests for owner `/content`, signed-in `view`/`edit` grants, public `/share` view-only, and unauthorized denial.
- Run `pnpm typecheck` and `pnpm build` at feature checkpoints.
