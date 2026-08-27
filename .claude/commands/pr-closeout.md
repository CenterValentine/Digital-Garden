---
description: Close bugs whose smoke tests were checked off in a merged PR.
allowed-tools: Bash, Read, Glob, Grep
---

# PR closeout → squash verified bugs

Find bugs that a merged PR claims to fix **and** whose smoke test the owner has ticked,
and close them citing the PR that fixed them.

The authorization model is the same one `/bug-triage` uses, on a different surface: a
**checked `Smoke #N` box in a merged PR is the owner's express authorization to close
issue #N**, and the PR is its own citation. A box left unchecked is a deliberate signal
that the bug is *not* resolved — never treat it as an oversight.

You close issues. You do not touch code, and you do not open a PR.

## The contract this depends on

Bug-fixing PRs declare, in their **Pre-merge checklist**, one line per bug:

```markdown
- [ ] **Smoke #83:** copy a checklist inside a column block → only the checklist pastes
- [ ] **Smoke #85:** upload an image while viewing a folder → lands in that folder, not root
```

One bug per line. The owner ticks a line when that bug's smoke passes. Checked means
verified; unchecked means not verified. There is no third state and nothing to infer.

Match the marker case-insensitively, tolerating `*` emphasis and extra spacing:

```bash
grep -nE '^\s*- \[[ xX]\] +\**Smoke +#[0-9]+' <<< "$body"
```

## Step 1 — Gather merged PRs

Look at PRs merged in the **last 7 days**. The window deliberately overlaps previous
runs; re-processing is harmless because an already-closed issue is skipped in Step 2.

```bash
gh pr list --state merged --limit 50 \
  --json number,title,body,mergedAt,mergeCommit,url \
  --jq '[.[] | select(.mergedAt > "<7 days ago, ISO8601>")]'
```

Ignore PRs with no `Smoke #N` lines at all — they predate the convention or fix no bugs.
Do not fall back to scraping bare `#N` references: PR bodies cite sprint numbers and
sibling PRs the same way, and that ambiguity is exactly what the marker removes.

## Step 2 — Close what was verified

For each **checked** `Smoke #N` line:

```bash
gh issue view <N> --json state,title,labels
```

Skip it silently if the issue is already closed. Otherwise post one comment and close:

```bash
gh issue comment <N> --body "<citation>"
gh issue close <N> --reason completed
```

The comment cites, concretely:

- the PR number and title, linked;
- the **merge commit SHA and its date**;
- the smoke line verbatim, so the record shows exactly what was verified.

For example:

> Closed by #181 — *fix(editor): scope clipboard slice to the selected node*.
> Merge commit `4f2a1c9` (2026-08-28).
> Verified via the PR's checklist: `**Smoke #83:** copy a checklist inside a column
> block → only the checklist pastes`.

Close **only** issues named by a checked marker in a merged PR. Never close an issue
because the code looks fixed, because a PR mentions it in passing, or because it seems
stale. That constraint is the whole point of the marker.

## Step 3 — Report what was held back

For each **unchecked** `Smoke #N` line whose issue is still open, the bug stays open —
the owner deliberately did not tick it. Post **one** comment per PR (not per bug)
listing what was held back, so the reason is recorded next to the work:

> Closeout: closed #85 (smoke verified). Held back #83 — its smoke line is unchecked:
> `**Smoke #83:** copy a checklist inside a column block → only the checklist pastes`.

Skip the comment entirely when a PR had nothing held back and nothing closed. Never
tick a box on the owner's behalf, and never re-comment on a PR you have already
reported on — check for a prior comment of yours before posting.

## Step 4 — Summarize

End the run with a plain-text summary as your final message: issues closed with the PR
that closed each, issues held back with the PR and the unchecked line, and PRs skipped
for having no markers. If nothing qualified, say exactly that — do not invent activity.

Because the window overlaps, a held-back bug reappears in next week's summary until it
is either ticked or closed by hand. That repetition is intentional: it is the only thing
stopping a verified-but-unticked fix from going quiet forever.
