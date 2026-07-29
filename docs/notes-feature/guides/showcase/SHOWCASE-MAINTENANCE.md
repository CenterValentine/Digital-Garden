# Showcase Maintenance Guide

The **showcase** is every surface a recruiter, hiring manager, or engineering peer sees before
they ever run the app. Its job: make AI Automation Engineer competencies identifiable in under
90 seconds, and reward anyone who digs deeper with real, current code. This guide is the canonical
reference for keeping it truthful and current. The `/update-showcase` Claude Code skill
(`.claude/skills/update-showcase/`) automates the ritual below.

## Showcase surface inventory

| Surface | Location | What it must stay in sync with |
|---|---|---|
| README | `README.md` | Shipped features, roadmap labels, code paths, commands, stats |
| Feature inventory | `docs/FEATURES.md` | Every domain's shipped/🚧/🔭 state + code entry points |
| Deployment guide | `docs/DEPLOYMENT.md` + `.env.example` | Real env vars in code, service topology, migration caveats |
| MCP design of record | `docs/notes-feature/work-tracking/MCP-PLAN.md` | Promote milestones to README/FEATURES as they ship |
| Figure registry + audit | `docs/media/figures/FIGURES.md` | Media files on disk (auto via script) |
| Video demo page | `app/(public)/demo/page.tsx` → davidvalentine.org/demo | Placeholder until a demo video ships |
| GitHub metadata | repo description, topics, homepage (via `gh repo edit`) | README positioning |
| Plan of record | `docs/notes-feature/work-tracking/DEVELOPER-PRESENCE-PLAN.md` | Workstream status |

## The prime directive: honesty

**Nothing planned may appear unlabeled.** Every unshipped capability in any showcase surface
carries `🔭 Planned` and, once one exists, a link to its design doc. When something ships, the
update ritual promotes it: label removed, evidence link added. Technical screeners check claims
against code; one inflated claim costs more than ten missing features.

**Presentation driver: high-demand AI skills first.** When choosing what to surface, feature, or
lead with, the priority order is: agentic orchestration (tools, playbooks, workflows) → AI
infrastructure (routing, fallback, streaming, governance) → multimodal pipelines → everything
else. Non-AI features earn README space by demonstrating engineering depth (collab CRDTs, CI
gates), not by completeness.

## The update ritual ("update the showcase")

1. **Diff reality against the README.** Find what shipped since the last showcase update:
   `git log -1 --format=%ci -- README.md` for the baseline date, then
   `git log --oneline --since=<that date> origin/main` plus the Recent Completions section of
   `docs/notes-feature/STATUS.md`.
2. **Promote shipped roadmap items.** Move them from the Roadmap section into the competency
   table / feature tour, with a code-path link. Add newly planned items with `🔭`.
3. **Verify every claimed code path still exists** (`git ls-tree origin/main <path>`), and that
   commands/ports/env vars in Quickstart still match `package.json` and `CLAUDE.md`.
4. **Reconcile figures.** New feature worth showing → add a registry entry (next free number in
   its section, never renumber) + a marker in the README + a capture brief. Then run
   `pnpm showcase:figures` and commit its rewrites.
5. **Check the demo page.** If a demo video now exists, replace the placeholder frame in
   `components/personal/DemoPage.tsx` with the embed (keep the custom-demo CTA).
6. **Sync GitHub metadata** if positioning changed: `gh repo edit --description ... --add-topic ...`.
7. **Gates:** `pnpm typecheck && pnpm lint` (README-only changes still deserve a link-check pass
   by eye; script/page changes need the full gates).
8. **Update the plan doc** workstream statuses and this guide's Standing Decisions if any changed.

## The figure signal system (spec)

Full contract lives in [`docs/media/figures/FIGURES.md`](../../../media/figures/FIGURES.md);
summary:

- **Registry**: `FIGURES.md` declares each figure as `## Fig <id> — <title>` with a capture brief.
  It is also the **audit log** — its status table and per-figure Status lines are rewritten by the
  script on every run, so it always reflects disk truth.
- **Slots**: showcase markdown contains `<!-- fig:<id> --> … <!-- /fig:<id> -->` markers. Content
  between markers is script-owned; never hand-edit inside them.
- **Signal**: dropping `fig-<id>.<ext>` into `docs/media/figures/` and running
  `pnpm showcase:figures` embeds the media in every slot. No file → a one-line "media pending"
  caption. **An empty or broken placeholder must never render** — that invariant is the script's
  core job.
- **Formats**: images/GIFs embed inline; videos become ▶ links (GitHub won't inline-play committed
  video). Image + video for the same id → image inline, video linked beneath.
- The script warns on: orphan media files, registered-but-unplaced figures, unregistered markers.

## Standing decisions (update when the owner rules)

| Decision | State | Date |
|---|---|---|
| License | **MIT** — `LICENSE` file + README badge added | 2026-07-29 |
| Tier-3 live demo account | **Deferred** — video-first strategy instead | 2026-07-29 |
| Video demo | Placeholder page live at /demo ("still growing" + custom-demo CTA via /contact) | 2026-07-29 |
| MCP | Plan-first: design doc (Workstream G) before implementation; first slice = read-only server | 2026-07-29 |

## Remaining workstreams (from the plan of record)

See `DEVELOPER-PRESENCE-PLAN.md` §3–4. Shipped in S1: README overhaul, figure system, demo page,
repo metadata. Shipped in S2: `docs/FEATURES.md`, `docs/DEPLOYMENT.md` + `.env.example`,
`MCP-PLAN.md`, ContentNode + workflow diagrams. Next: **S3** — capture the 14 registered figures
+ record the video (owner; deferred until after release). **S4** — showcase seed vault +
read-only MCP server slice (M1 of MCP-PLAN.md).
