---
description: Attempt the high-confidence bugs from this week's plan doc, one PR per bug.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Bug fixer — plan doc → one PR per bug

Take this week's `/bug-triage` plan document and actually fix the bugs it marked safe to
attempt, opening **one pull request per bug**. You never merge anything, and you never
tick a smoke box — the owner smokes each PR and `/pr-closeout` closes the issue on Friday.

Your output is an honest, reviewable artifact. A PR that says exactly which gates ran and
what they returned is worth more than one that implies a green it never saw.

## Step 1 — Find this week's plan

The plan doc lives on the triage branch, not on `main` — the triage run opens it as a
draft PR that is usually still unmerged when you run.

```bash
git fetch origin '+refs/heads/*:refs/remotes/origin/*'
git branch -r --list 'origin/chore/bug-triage-*' | sort | tail -1
git show <that branch>:docs/notes-feature/work-tracking/bug-squash/BUG-SQUASH-<week>.md
```

If no triage branch exists, or it carries no plan doc, **stop and report that**. Do not
fall back to triaging the issues yourself — planning is `/bug-triage`'s job and doing it
here would skip the liveness gate and the ranking policy entirely.

## Step 2 — Decide what you are competent to attempt

A bug is eligible only when **every** condition holds:

- its At-a-glance row says **Confidence: high**;
- its estimate is **S** (small);
- its section has **no "Blocked on"** heading;
- the fix touches none of the exclusions below.

**Hard exclusions — abandon the bug, do not attempt a partial fix:**

| Area | Why |
|---|---|
| `prisma/**`, any schema change or migration | human-owned; migrations are the owner's to write |
| `lib/domain/collaboration/**`, the Y.Doc write path | the plausible fix is the forbidden one here — see `CONTENT-LOAD-CASCADE.md` §9.4 |
| A new TipTap `Node.create` / `Mark.create` | needs a `Server*` variant in three extension sets plus a schema-version bump |
| `extensions/publishing/blocks/**` | five required surfaces and a post-merge Hocuspocus redeploy |
| A new extension module | the templates → block → extension ladder is a design decision, not a bug fix |

**Attempt at most three bugs per run.** Three reviewable PRs beat six you will not read,
and the run has to finish. Report every bug you skipped and the specific condition that
disqualified it — a silent cap reads as "nothing else was fixable", which is a lie.

If your work on a bug reveals that it *does* reach an excluded area — you discover the
real fix is in the collab path — **stop that bug immediately**, discard the branch, and
report it. Do not push a partial fix, and do not route around the exclusion.

## Step 3 — Prepare the environment once

The committed Prisma client on `main` is stale, so `typecheck` fails confusingly without
a regenerate:

```bash
pnpm install --frozen-lockfile
npx prisma generate
```

Do this once, before the first bug, not per branch.

## Step 4 — Fix each bug on its own branch off `main`

```bash
git checkout -b fix/bug-<n>-<short-slug> main
```

Follow the plan's **Approach**, but the plan is a starting point, not an instruction you
must obey — if the code contradicts it, trust the code and say so in the PR. Read the
surrounding code and match its conventions: this repo has a house style, and a fix that
reads as foreign is a worse fix.

Keep each change **minimal and on-topic**. Do not opportunistically refactor, reformat, or
fix unrelated things you notice; note them for the owner instead. A one-bug PR that also
rewrites a neighbouring component is not reviewable.

## Step 5 — Gates, reported honestly

Run in order. Each gates the next:

```bash
pnpm typecheck
pnpm lint
NODE_OPTIONS='--max-old-space-size=8192' pnpm build
```

- **typecheck must pass.** If it fails and you cannot fix it cleanly, abandon the bug.
- **lint must pass with no new warnings.** The `--max-warnings` ratchet only goes down —
  never raise the number in `package.json` to get a fix through.
- **build is best-effort.** It is expensive and may run out of memory or time out in this
  environment. If it does not complete, that is an acceptable outcome — record exactly
  what happened.

**Never state that a gate passed unless you ran it and saw it pass.** "build: not run —
OOM at the compilation phase after 6 min" is a useful sentence. "Gates green" when the
build never finished is a false report, and the owner merges on the strength of these
lines.

## Step 6 — One PR per bug

```bash
git push -u origin fix/bug-<n>-<short-slug>
gh pr create --base main
```

Title: `fix(<area>): <what changed>` — describe the change, not the issue number.

The body follows this repo's conventions and **must** carry the smoke line verbatim from
the plan doc, unchecked:

```markdown
## Sprint <N> — <theme>

<One sentence on the defect and the change.>

- <specific change>
- <specific change>

Diagnosis: <why it broke, citing `path/to/file.ts:123`>

**Gates:** typecheck ✅ · lint ✅ (no new warnings) · build ⚠️ not completed — OOM after 6 min

## Pre-merge checklist

- [ ] `pnpm build` green locally
- [ ] **Smoke #<n>:** <the exact line from the plan doc>
```

That smoke line is load-bearing: ticking it is what authorizes Friday's `/pr-closeout` to
close the issue. Copy it exactly — do not reword it, and do not tick it.

**Never merge.** Never push to `main`. Never tick a checkbox. Never close an issue — this
command does not touch the issue tracker at all.

## Step 7 — Report

Finish with a plain summary: a line per bug attempted with its PR number and real gate
results, a line per bug skipped with the disqualifying condition, and anything you
abandoned mid-way with the reason. If nothing was eligible, say exactly that — an honest
empty run is a fine outcome and much better than a speculative fix.
