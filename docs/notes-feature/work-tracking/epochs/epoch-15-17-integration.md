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

### Phase C merge output (`git merge feature/publishing-system` from observability tip)

Auto-merged cleanly: `app/globals.css`, `components/content/blocks/PropertiesPanel.tsx`, `components/content/editor/MarkdownEditor.tsx`, `components/content/headers/RightSidebarHeader.tsx`, `lib/domain/editor/commands/slash-commands.tsx`, `pnpm-lock.yaml`, plus 77 additions from publishing.

### 8 files with content conflicts

| File | Rule applied | Notes |
|---|---|---|
| `.gitignore` | Additive merge | Both branches added entries below the existing `archive/` block. Resolution kept publishing's additions: `.worktrees/`, `.codex/`, `~$*` (Office lock files), `.memsearch/`. Observability had no additions in that section. |
| `package.json` | Per Phase D rule | Kept observability's strict `lint: eslint --max-warnings 159` + Phase-6 `trace:view`/`trace:list` scripts + `build` calls strict `lint`. Kept publishing's new `lint:publishing` scoped script as an advisory tool (does NOT run in build pipeline). Kept publishing's `@types/jsdom` + `jsdom` deps required by `components/public/TipTapContent.tsx`. |
| `lib/domain/editor/extensions-client.ts` | Drop redundant + union | The HEAD half of both conflict blocks re-imported `ExcalidrawBlock` + `MermaidBlock` — those imports were already 4 lines above (the auto-merge had picked them up from observability AND tried to re-add them from publishing). Resolution: drop the redundant duplicates, keep publishing's genuinely-new `PullQuote` + `TableOfContents`. |
| `lib/domain/editor/extensions/blocks/excalidraw-block.ts` | Union | Kept HEAD's `consumePendingDiagramCreate` import + the `BlockContentDom` type (used elsewhere in file). Added publishing's `makeWrapAttrs` import. |
| `lib/domain/editor/extensions/blocks/mermaid-block.ts` | Union | Same pattern as excalidraw-block: kept HEAD's `consumePendingDiagramCreate` + `BlockContentDom`, added publishing's `makeWrapAttrs`. |
| `lib/domain/editor/commands/slash-commands-menu.tsx` | Took publishing's version wholesale | Publishing's version uses the React-Compiler-approved render-time reset pattern with a `fingerprint` state instead of `useEffect(setSelectedIndex(0), [props.items])` — this *removes* an `eslint-disable-next-line react-hooks/set-state-in-effect` suppression AND adds the `cycleTab` function for the All/Editor/Published tab system. Net warning reduction. |
| `lib/domain/blocks/node-view-factory.ts` | Kept HEAD's style | Both sides declared the same `HTMLElement & { __cleanup?: () => void }` type, just inline vs. named. Kept HEAD's named `DomWithCleanup` type for consistency with the rest of the file. Functionally equivalent. |
| `app/page.tsx` | Kept HEAD's dark-mode-aware styling | Publishing's branch pre-dated the dark-mode merge (Epoch 16), so its sign-in button styling was light-only (`bg-gray-100`). Kept HEAD's dark-aware `bg-gold-primary/15 dark:bg-gold-primary/20` styling + the second `Create account` button. Side effect: Phase F.4 had to convert these `<a>` tags to `<Link>` after the strict lint surfaced `@next/next/no-html-link-for-pages` on them. |

### Prisma client regeneration (commit `71e37a0`)

Per Phase D rule: deleted conflict markers in `lib/database/generated/prisma/**`, ran `npx prisma generate` against the merged schema (40 new tables/types combining publishing's 13 new models with the rest), then `git add -u lib/database/generated/` to stage the regenerated tracked files. Net: `lib/database/generated/prisma/*` updated in-place; no manual merge of generated code.

### Phase E gate results

- `pnpm typecheck`: failed initially (`Cannot find module 'jsdom'`) → ran `pnpm install` to install merged `jsdom` + `@types/jsdom` deps → clean.
- `pnpm collab:schema:check`: passed on first run. All 23 W2-W10 publishing blocks have `Server*` variants properly registered.
- `pnpm lint`: 9 errors initially:
  - 4 `no-console` (1 in `app/api/media/upload/route.ts`, 3 in `components/public/TipTapContent.tsx`) — all from publishing's new code. Resolved in Phase F.
  - 5 `@next/next/no-html-link-for-pages` (3 in `app/page.tsx`, 1 in `app/(authenticated)/settings/api/page.tsx`, 1 in `components/settings/storage/UsageTab.tsx`) — pre-existing `<a>` tags surfaced once strict lint applied to the merged tree. Resolved in Phase F.4 by importing `Link from "next/link"` and converting all 5.
- Ratchet decision: no bump needed. Final state 159/159 = exactly at the existing `--max-warnings 159` ratchet established in Phase 4.

### Phase F harmonization (commit `d5678a5`)

All 13 publishing routes + media upload + 1 SSR renderer + 1 client component harmonized to Epoch 17 observability standards. Aggressive scope: `withRouteTrace` on every handler, named domain spans, `spanPayload` for bulk data (incoming bodies, responses, published revisions, validation reports, diff summaries). See the commit message for the full per-route table.

Special Vercel-cron handling: `app/api/publishing/scheduled-publish/route.ts` uses `startSpan`/`itemSpan.end()` instead of `withSpan` for per-item child spans because `Promise.allSettled` runs its callbacks in parallel and ALS context doesn't propagate cleanly through that pattern. The batch span is the parent; each per-item child carries the same `trace_id` (the `cron_run_id`) and its own `span_id`. Per-item failures log structured `logger.error` with `payload_type` + `public_item_id` attrs for postmortem analysis.

### Phase G — final smoke test (this commit)

- `pnpm typecheck` ✓
- `pnpm lint` ✓ (0 errors, 159 warnings — at ratchet)
- `pnpm collab:schema:check` ✓
- `pnpm build` ✓ (132 pages)
- `pnpm trace:view --list` ✓ (Phase 6 viewer still operational post-merge)

## Gates checklist

- [x] Phase A — Epoch docs + STATUS registration *(commit `7dec100`)*
- [x] Phase B — Integration branch `feature/observability-and-publishing` created
- [x] Phase C — Merge commit produced *(commit `71e37a0`)*
- [x] Phase D — All 8 conflicts resolved per rules above; Prisma client regenerated against merged schema
- [x] Phase E — `pnpm typecheck` ✓ + `pnpm collab:schema:check` ✓ + `pnpm build` ✓; ratchet decision: no bump (9 errors all resolved in F)
- [x] Phase F — 13 publishing routes + 1 media route + Vercel cron + 1 SSR renderer + 1 client component harmonized *(commit `d5678a5`)*. ESLint deferral list assessment: `extensions/publishing/**` does NOT need deferral entry — all publishing client code is now console-free.
- [x] Phase G — Full gate pass on harmonization commit (typecheck/lint/build/collab:schema:check); `pnpm trace:view --list` smoke test confirms Phase 6 viewer survives the merge.
- [x] Phase H — `STATUS.md` updated with combined entry; conflict log filled in; branch ready for `git push -u origin feature/observability-and-publishing` + `gh pr create`.
- [x] Phase I — Anti-overwrite guards added in response to live data-loss incident (4 commits). Branch state still PR-ready.

### Phase I (added 2026-05-17, response to data-loss incident)

**Trigger:** While integration was held local pending PR creation, a user opened a daily note (`63a3a080-e702-4da4-a132-5bd0d61eebea`) in local dev (dev=prod database). The editor briefly rendered the real content from the GET, then the editor auto-saved a template/empty body via PATCH, overwriting the production NotePayload. Content was recovered via a still-open mobile Chromium tab whose y-indexeddb cache held the prior Yjs state and pushed it back when refocused.

**Root cause:** `app/api/content/content/[id]/route.ts` PATCH handler had no precondition checks on `notePayload.upsert`. Any client sending `tiptapJson` got that body written verbatim. The trace at `01070acc` shows `content:write:completed 1 writes 408ms` with `INSERT NotePayload` and `Synced 0 tags` — the smoking gun.

**Forensic loss:** The Phase H predev hook (`rm -rf .local/debug-payloads`) had wiped the incident's `01070acc` sidecar before it could be inspected. We can't reconstruct what the editor sent. Phase I.4 fixes the predev hook so future incidents don't lose this evidence.

**4 commits ship in this PR as Phase I:**

| # | Commit | What it does |
|---|---|---|
| I.1 | `3d6a7d2` | Shrink-refusal guard: PATCH refused with `422 OVERWRITE_REFUSED` when existing.searchText > 200 chars AND new < 0.5 × existing AND no `allowShrink: true` on body. Structured `content:write:overwrite_refused` event for trace visibility. |
| I.2 | `773bead` | Optional `If-Match: <bodyHash>` precondition (on-the-fly SHA-256, no schema change). Mismatch → `409 PRECONDITION_FAILED`. `bodyHash` exposed in GET + PATCH `note` responses. Backwards-compatible. |
| I.3 | `f89276b` | `content:write:overwrite_risk_detected` event for shrinks in the 50–70% range — informational warn, write still allowed but trace history shows the borderline case. |
| I.4 | `f2caa3f` | `scripts/archive-traces.ts` replaces `rm -rf` — moves prior-session traces to `.local/debug-payloads/.archive/<ISO timestamp>/` with LRU 5-session cap. Predev hook still triggers it via `pnpm clean:traces`. |

**What's NOT in this PR (separate follow-ups):**
- Client-side adoption of `If-Match` in `MarkdownEditor`. The server guard is in place; clients can opt in incrementally. Without client adoption, `If-Match` is server-prepared infrastructure that never triggers.
- Investigation of the specific *client trigger* that fired the destructive PATCH. The user theorizes a daily-notes left-rail tab click applied a template. `app/api/periodic-notes/resolve/route.ts` is verified idempotent (returns existing without template-application). The actual culprit is either editor mount behaviour, the periodic-summary block, or something else — needs reproduction with sidecars intact (Phase I.4 enables this).
- `dev≠prod` database separation. Whole separate project (provision dev DB, point `.env.local` at it).
- Same-class guards on `htmlPayload`, `codePayload`, etc. The destructive incident was NotePayload-only; expanding the guard is straightforward but lower priority.
