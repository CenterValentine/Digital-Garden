---
name: update-showcase
description: Refresh the recruiter-facing showcase (README, figure registry, demo page, GitHub metadata) against what has actually shipped on main. Use when the user says "update the showcase", after merging notable features or releases, or when the README/roadmap has drifted from reality. Keeps high-demand AI competencies as the presentation driver.
---

# Update the Showcase

Follow the canonical ritual in
[docs/notes-feature/guides/showcase/SHOWCASE-MAINTENANCE.md](../../../docs/notes-feature/guides/showcase/SHOWCASE-MAINTENANCE.md).
Operational checklist:

1. **Baseline**: `git fetch origin`, then `git log -1 --format=%ci -- README.md` and
   `git log --oneline --since=<that date> origin/main`. Cross-check `docs/notes-feature/STATUS.md`
   Recent Completions. Build the list of shipped-but-unshowcased work.
2. **README.md**:
   - Promote shipped `🔭 Planned` roadmap items into the competency table / feature tour with a
     repo-relative code link (verify with `git ls-tree origin/main <path>` — never trust the local
     checkout, it may be behind).
   - Add new planned items with `🔭` labels. Never let an unshipped capability appear unlabeled.
   - Re-verify Quickstart commands/ports/env vars against `package.json` and `CLAUDE.md`.
   - Ordering bias: agentic orchestration → AI infrastructure → multimodal → everything else.
3. **Figures**: for each new feature worth showing, add a `## Fig <id> — <title>` capture brief to
   `docs/media/figures/FIGURES.md` (next free number in its section; never renumber) and a
   `<!-- fig:<id> --> <!-- /fig:<id> -->` slot in the README. Never hand-edit inside slot markers.
   Then run `pnpm showcase:figures` and include its rewrites in the change.
4. **Demo page**: if a real demo video now exists, replace the placeholder frame in
   `components/personal/DemoPage.tsx` with the embed, keeping the custom-demo CTA and the URL.
5. **GitHub metadata**: if positioning changed, `gh repo edit --description "..."` and
   `--add-topic` for any new competency keywords (e.g. `mcp` once it ships).
6. **Gates**: `pnpm typecheck && pnpm lint` when code changed; for markdown-only updates, verify
   all new relative links resolve.
7. **Trackers**: update workstream status in
   `docs/notes-feature/work-tracking/DEVELOPER-PRESENCE-PLAN.md` and the Standing Decisions table
   in the maintenance guide if any decision changed.
8. **Report**: summarize what was promoted, what was newly planned, and which figures are still
   awaiting media (read the count from the `pnpm showcase:figures` output).

Do not open a standalone docs-only PR for this; bundle with the next feature/chore PR unless the
user asks otherwise.

**PR title/body for wording-only tweaks:** keep it generic ("docs: README copy pass") — don't
narrate the specific rewording rationale or cite verification steps in the PR body. See the
maintenance guide's "PR bodies for showcase-content-only changes stay generic" note. Exception:
PRs that promote a `🔭 Planned` item to shipped, or add a genuinely new claim, still need a real
descriptive PR — the honesty rule (evidence-linked claims) always outranks subtlety.
