---
title: Epoch 15 + 17 Integration — Publishing absorbs Observability standards
status: planned
authored: 2026-05-17
integration_branch: feature/observability-and-publishing
combines:
  - epoch-15-publishing.md (publishing system, branch feature/publishing-system)
  - epoch-17-observability.md (observability cleanup, branch worktree-observability-cleanup)
fork_point: 7ef9d51 (Epoch 16 — Dark Mode merge into origin/main)
target: origin/main (single PR for both epochs)
---

# Integration Plan: Epoch 15 ⊕ Epoch 17

## Goal

Land Epochs 15 (Publishing) and 17 (Observability) in `origin/main` as a single PR, with all publishing-side server code brought up to the observability standards established in Epoch 17. The end state is one branch — `feature/observability-and-publishing` — where the 12 publishing API routes + 1 media route + cron handler all use `withRouteTrace`, structured `logger` calls, and aggressive `spanPayload` where bulk data flows.

## Why combine

1. **No half-measure** — shipping publishing under the old `console.*` / unwrapped-handler discipline would immediately violate the `no-console=error` rule that Epoch 17 just locked in via CI.
2. **Trace continuity** — a `/api/publishing/items/[id]/publish` request often fans out into `content` + `editor` + `storage` layers. Wrapping it now means the very first trace anyone captures of the publish flow will be useful instead of noise.
3. **Single review surface** — one PR with both epochs is easier to review than back-to-back PRs where the second one mostly retrofits the first.

## Branch topology

```
origin/main  ─────┐                       ┌───────────────────────────────────────►
                  │                       │
                  │  7ef9d51 (Epoch 16)   │
                  │  fork-point for both  │
                  │                       │
                  ▼                       ▼
                  ├── worktree-observability-cleanup (c4bf675, 28 ahead)
                  │   Epoch 17 — observability
                  │
                  ├── feature/publishing-system    (d39c2f4, 40 ahead, 22 behind)
                  │   Epoch 15 — publishing
                  │
                  ▼
              feature/observability-and-publishing  ◄── created from observability tip
                  │
                  ├── merge commit: feature/publishing-system
                  ├── conflict-resolution commit(s)
                  ├── prisma regen commit
                  ├── observability harmonization commit(s) for publishing routes
                  └── STATUS update commit  → ready to push, PR target origin/main
```

## Sequencing (Phases A–H)

### Phase A — Epoch documentation ✅ this commit

Three new files in `docs/notes-feature/work-tracking/epochs/`:
- `epoch-15-publishing.md` — publishing epoch wrapper
- `epoch-16-dark-mode.md` — promoted from `feature-dark-mode.md` (rename via `git mv` preserves history)
- `epoch-17-observability.md` — observability epoch wrapper, pointing at the detailed `OBSERVABILITY-CLEANUP-PLAN.md`
- `epoch-15-17-integration.md` (this file) — sequencing + conflict log

`STATUS.md` updated to register Epoch 15 (in_review), Epoch 16 (shipped), Epoch 17 (shipped_in_branch).

### Phase B — Create integration branch (no code changes)

```bash
cd /Users/davidvalentine/Code/Digital-Garden/.claude/worktrees/observability-cleanup
git checkout -b feature/observability-and-publishing
```

Branch starts at the observability tip (`c4bf675`). At this point it's identical to `worktree-observability-cleanup` — the new name signals intent.

### Phase C — Merge publishing in

```bash
git fetch origin
git merge feature/publishing-system
```

Expected outcome: a merge commit with conflicts to resolve. The merge-tree check earlier showed `.gitignore` will merge cleanly; other shared files will conflict per the rules in Phase D.

### Phase D — Conflict resolution rules (apply mechanically)

| File / Glob | Rule |
|---|---|
| `lib/database/generated/prisma/**` | Accept neither side. Delete the directory's conflict markers; run `npx prisma generate` after merge resolution to produce the correctly-merged client. The generated diff goes in its own `chore(prisma): regenerate against merged schema` commit. |
| `prisma/schema.prisma` | Take publishing's additions (observability didn't touch schema). 13 new models: `PublicPath`, `Series`, `PublicItem`, `PublicItemRevision`, `PublicPathRedirect`, `PreviewToken`, `BlogPostPayload`, `ProjectPayload`, `ProfileSectionPayload`, `CaseStudyPayload`, `BookmarkPayload`, `PagePayload`, `MediaItemPayload`. Verify no duplicate model names with other epochs. |
| `lib/domain/editor/schema-version.ts` | Both branches bumped this. Reconcile to a single version that captures BOTH sets of additions. Bump MAJOR if either side did MAJOR; otherwise sum the MINOR bumps. |
| `lib/domain/editor/extensions-client.ts` | Union of both extension lists. Order: keep observability's order first, append publishing's W1+W2-W10 blocks. Deduplicate by Node/Mark name. |
| `lib/domain/editor/extensions-server.ts` | Same union rule. Every W1+W2-W10 block must have its `Server*` variant included. |
| `lib/domain/collaboration/extensions.ts` | Same union rule. `pnpm collab:schema:check` will fail loudly if anything is missing. |
| `package.json` | Keep observability's `trace:view`, `trace:list`, `--max-warnings 159` lint script, and dev script port (3015). Keep publishing's new deps (esp. anything for media upload, public renderer). If publishing added a `lint:publishing` script, keep it as an advisory in addition to the main `lint`. |
| `eslint.config.mjs` | Take observability's rewrite — it has the full Phase 4/5 structure with the `no-console=error` rule and Phase-5 deferral list. If publishing added scoped overrides, re-apply them to observability's structure. |
| `vercel.json` | Take publishing's cron block as-is (observability didn't touch this file). |
| `app/globals.css` | Both touched. If conflicts, take both additions (publishing adds `.public-prose`, observability didn't add CSS). |
| `docs/notes-feature/STATUS.md` | Manual merge. Both touched the "Recent Completions" section; both entries must end up in the result. |
| `docs/notes-feature/work-tracking/BACKLOG.md` | Both touched. Manual merge. |

### Phase E — Gates after merge resolution

```bash
npx prisma generate
pnpm typecheck                       # must be clean
pnpm collab:schema:check             # publishing added blocks; check passes
pnpm build                           # full pipeline including lint
pnpm lint                            # see ratchet contingency below
```

**Lint ratchet contingency:** Publishing's 12 API routes have zero `console.*` calls, so the `no-console=error` rule shouldn't trip. But publishing added ~118 files and may have other warnings (unused vars, exhaustive-deps) that nudge the count past 159:
- ≤ 10 additional warnings → bump ratchet in `package.json` with justification, commit as part of merge resolution
- 10–30 → triage with `pnpm lint --fix` first, then bump
- > 30 → escalate; do a focused lint pass before unlocking Phase F

### Phase F — Observability harmonization (the work)

**Scope: aggressive** per user direction. Every publishing route gets:
1. `withRouteTrace` wrap (root span = `route:request`)
2. `logger.error` in catch blocks with **scalar attrs** for filterability
3. **Domain-meaningful spans** opened with `withSpan` / `startSpan` around the operational core of each handler
4. **`spanPayload`** for any non-trivial response body, payload state, or validation output

Per-route harmonization map:

| Route | Layer | Spans to open | `spanPayload` opportunities |
|---|---|---|---|
| `POST /api/media/upload` | `storage` | `media:upload` around the storage write | `upload_metadata` (after finalize) |
| `GET /api/publishing/items` | `content` | `publishing:list` around the query | `items_response` (list of PublicItem headers) |
| `POST /api/publishing/items` | `content` | `publishing:create` | `incoming_body`, `created_item` |
| `GET /api/publishing/items/[id]` | `content` | `publishing:read` | `item_response` (PublicItem + working/published revisions) |
| `PATCH /api/publishing/items/[id]` | `content` | `publishing:update` | `incoming_body`, `updated_item` |
| `DELETE /api/publishing/items/[id]` | `content` | `publishing:delete` | none |
| `POST /api/publishing/items/[id]/publish` | `content` | `publishing:publish` — wraps revision snapshot + status flip + path/slug write | `rendered_html`, `published_revision` |
| `POST /api/publishing/items/[id]/unpublish` | `content` | `publishing:unpublish` | none |
| `POST /api/publishing/items/[id]/schedule` | `content` | `publishing:schedule` | `schedule_payload` (target time + revision id) |
| `POST /api/publishing/items/[id]/sync` | `content` | `publishing:sync` — wraps source ContentNode read + diff + working revision write | `source_payload`, `diff_summary` |
| `POST /api/publishing/items/[id]/validate` | `content` | `publishing:validate` | `validation_report` (broken links, missing assets) |
| `GET /api/publishing/items/[id]/revisions` | `content` | `publishing:revisions_list` | `revisions_response` |
| `POST /api/publishing/items/[id]/revisions` | `content` | `publishing:revision_create` | `incoming_body`, `created_revision` |
| `GET /api/publishing/paths` | `content` | `publishing:paths_list` | `paths_response` |
| `POST /api/publishing/paths` | `content` | `publishing:path_create` | `incoming_body` |
| `GET/PATCH/DELETE /api/publishing/paths/[id]` | `content` | `publishing:path_{read,update,delete}` | `path_response` for GET, `incoming_body` for PATCH |
| `GET /api/publishing/scheduled-publish` (cron) | `content` | `publishing:scheduled_publish_batch` — root span; per-item child span `publishing:scheduled_publish_item` | `batch_summary` (counts), per-item `result` |

**Special handling for cron:** the cron handler has no `x-trace-id` from a client — `withRouteTrace` mints a fresh one. The handler should log `attrs.cron_run_id = trace_id` so the per-batch trace is correlatable from Vercel's cron history.

**Client-side cleanup:** 1 `console.*` in `extensions/publishing/components/view-mode/PublishingViewMode.tsx` → `clientLogger.error` (layer `ui`).

**ESLint deferral list:** assess whether `extensions/publishing/**` belongs in the deferred list or whether we can leave the `no-console=error` rule enforced there. Decision rule: if all `extensions/publishing/**/*.tsx` are console-free after Phase F's cleanup (currently 1 call), keep the rule enforced.

### Phase G — Final gates

```bash
pnpm typecheck
pnpm lint                                # 0 errors; ratchet should remain stable or drop
pnpm build
pnpm collab:schema:check
pnpm trace:view --list                   # confirm Phase 6 recorder works after merge
```

If `pnpm trace:view --list` shows zero traces, that's fine — the dev server hasn't run since the merge. Run `pnpm dev`, hit `/api/publishing/items` once to exercise the harmonized route, then re-run `pnpm trace:view` to verify the publishing-flow trace renders correctly.

### Phase H — Tracking docs + ready-for-PR

- Update `STATUS.md` "Recent Completions" with a combined entry covering both epochs and the integration.
- Update this file's "Conflict resolution log" section below with the actual conflicts that occurred and how they were resolved.
- Working tree clean → mirror the merge-prep state we had on the observability branch.
- Branch is ready for `git push -u origin feature/observability-and-publishing` + `gh pr create` (see PR draft in conversation history).

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Prisma client merge produces invalid output | High that text-merge fails; near-zero that regen fails after | Skip text merge entirely — delete conflict markers, run `prisma generate` |
| Lint count blows up past 159 | Medium | Ratchet bump with justification; or scoped `--fix` pass; document new count |
| Schema-check fails due to missed `Server*` variant | Low (memory note says publishing got these right) | `pnpm collab:schema:check` will name the missing extension |
| `lib/domain/editor/schema-version.ts` reconciliation introduces a migration gap | Low | Bump MAJOR; ensure both sides' migrations are present in `lib/domain/export/migrations.ts` |
| Vercel cron handler can't open a span (no ALS context yet) | Low (`withRouteTrace` provides one) | Verify by running `pnpm dev` + hitting `/api/publishing/scheduled-publish` with the cron secret |
| Aggressive Phase F bloats the PR diff | Medium | Each route harmonization is ~15-30 lines; 13 routes = ~250-400 line diff. Acceptable for the value |
| Publishing memory note (5 days stale) describes state that's since drifted | Low | All facts re-verified from `git diff` at discovery time |

## Conflict resolution log (filled in during execution)

> *Empty at plan-doc-authoring time. Each conflict resolved during Phase D will be appended here with the file, the rule applied, and any non-mechanical judgment notes.*

## Gates checklist

- [ ] Phase A — Epoch docs + STATUS registration
- [ ] Phase B — Integration branch created
- [ ] Phase C — Merge commit produced (with conflicts)
- [ ] Phase D — All conflicts resolved per rules above
- [ ] Phase E — `pnpm typecheck` + `pnpm collab:schema:check` + `pnpm build` green; ratchet decision made
- [ ] Phase F — All 13 publishing routes harmonized; 1 client-side console retired; deferral list assessed
- [ ] Phase G — Full gate pass on harmonization commit; smoke test via `pnpm trace:view`
- [ ] Phase H — `STATUS.md` updated; conflict log filled in; branch ready for push + PR
