# AI 3.4 Model Routing — Smoke Test

Manual browser smoke for `feat/ai-v3.4-model-routing`. Run from the worktree
dev server (`pnpm dev --port 3017` if 3015 is taken). Needs **at least two AI
connections** with distinct models (e.g. Anthropic + OpenAI) so routing has
somewhere to route. Each `[ ]` is a PR-checklist line.

## Setup
- [ ] `pnpm model-routing:check` passes and is wired into `pnpm build`.
- [ ] Feature Routing settings (`/settings/ai`) shows six new rows —
      "Playbook role · Scout/Analyst/Writer/Coder/Reviewer/Archivist" — each
      with a capability-filtered model dropdown.

## Part A — AI 3.4 (the feature)

- [ ] **Role directive.** Create a playbook note with two `##` phases; put
      `model: scout` as the first line of Phase 2. Attach it (`/playbook`),
      run Phase 1, approve the checkpoint → the Phase 2 turn runs the model
      mapped to `scout`, and a subtle divider reads
      *"Switched to `MODEL` · by playbook `TITLE` (Phase 2)"* — a hairline
      line, not a pill. (Placeholders backticked deliberately: raw
      angle-bracket placeholders parse as HTML tags in markdown renderers,
      and an unclosed `title` element swallows the rest of the document.)
- [ ] **Pin toggle wins.** With a playbook active (attached OR rooted), click
      the **pin toggle** next to the model picker → it turns amber "Pinned";
      the next turn runs your selected model and the divider reads *"· by
      you"*; the playbook directive is NOT applied. Click it again to unpin →
      the following phase routes by the playbook again. (The toggle is always
      visible — it does not require changing the model first.)
- [ ] **Pin survives reload.** Pin a model, reload → still pinned (per-
      conversation localStorage), playbook still overridden until you unpin.
- [ ] **Pin survives promotion.** Pin BEFORE the first send in a fresh chat,
      then send (conversation gets created) → still pinned afterward.
- [ ] **Pin visible in full-page chat.** Pick a model in the full-page chat
      viewer → the "Pinned · unpin" control appears there too.
- [ ] **Directive in a code sample does NOT route.** A phase whose
      instructions include a fenced config example containing `model: x` →
      no switch, no divider (first-line-only contract).
- [ ] **Dividers survive reload.** After a run with model switches, reload →
      the switch lines are still in the transcript.
- [ ] **Class directive — match.** Put `model: gpt-5 series` (or a family you
      have connected, e.g. `model: claude`) on a phase → a family member runs;
      divider shows it.
- [ ] **Class directive — no match.** Put `model: gpt-5 series` on a phase with
      NO matching connection → an amber **fall-through notice** appears
      ("No connected model matches …") and the turn continues on the current
      model — never a silent swap.
- [ ] **Explicit directive — unserved.** `model: openai/gpt-5-imaginary` on a
      phase with no such connection → amber notice, run continues. (Pre-flight
      warning at the checkpoint card is deferred; the notice is the signal.)
- [ ] **Heal by edit.** Mid-run, fix a bad directive in the playbook note →
      the next turn parses the correction and routes accordingly (no restart).
- [ ] **No directive = unchanged.** A playbook with no `model:` lines → zero
      dividers, behavior byte-for-byte as before.
- [ ] **Role remap round-trips.** In Feature Routing, map "Scout" to a specific
      connection+model, save, reload settings → persists; a `model: scout`
      phase now runs that model.

## Part B — AI 3.2 / 3.3 regression (must still work)

- [ ] **Playbook progressive disclosure (3.2 T3).** Attach a multi-phase
      playbook → only the active phase's detail is in context; `phase_checkpoint`
      advances phases; a research phase can't approve without real tool activity.
- [ ] **Output target per phase (3.2).** A phase that says to write output
      "under this content" lands the artifact there; the default output-target
      preference still applies when a turn doesn't specify; a user prompt naming
      a destination still overrides the preset.
- [ ] **Prompt cache (3.2.2).** With an OpenAI model, run the same unchanged
      playbook phase twice → the cache key is stable across runs (chat stream
      telemetry / `prompt-cache:check` still green). Model routing that changes
      the phase's model naturally rotates the key — expected.
- [ ] **Chat title (3.2 T5).** A URL-opened chat still auto-titles.
- [ ] **Resumable streams (3.3).** Reload mid-stream → the same response keeps
      rendering live and settles (no re-type of the buffered backlog).
- [ ] **Plain chat unaffected.** A normal chat with no playbook and no pin →
      no dividers, no notices, model resolves exactly as before.

## Gate
- [ ] `pnpm typecheck` → `pnpm lint` (zero new warnings) → `pnpm build` all green.
