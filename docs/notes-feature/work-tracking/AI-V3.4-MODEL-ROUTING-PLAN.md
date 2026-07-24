# AI 3.4 — Playbook-Orchestrated Model Routing · Build Plan

> **BUILD STATUS (2026-07-24): S1–S3 BUILT on `feat/ai-v3.4-model-routing`
> (worktree `ai-v34-model-routing`), gates green.** S4 checkpoint pre-flight
> DEFERRED (see §7 note below) — its core value is already delivered by the
> visible fall-through notice + single-resolution stamping, so it's a UX
> nicety, not a correctness gap. What shipped: directive parse + role features
> + `model-routing:check` (S1); hoisted resolve + precedence ladder +
> `modelPinned` + route stamp (S2); inline switch divider + notices + unpin in
> both chat surfaces (S3). Not pushed / no PR until owner review.
>
> **Purpose:** self-contained plan so a **fresh chat** can build AI 3.4 with zero
> prior context. Read top-to-bottom, then build. Nothing here depends on the
> conversation that produced it.
>
> **How to start the build chat:** open a fresh session, `Read` this file, and
> say *"build AI 3.4 per this plan."*
>
> Written 2026-07-24 from the `ai-v33-resumable` worktree, immediately after
> PR #130 (AI 3.3 resumable streams) merged. All file:line anchors verified
> against that state of `main`; expect small drift — re-verify anchors before
> editing, as the 3.3 handoff prescribed.

---

## 1. The feature in one paragraph

A playbook phase can declare which model should run it. When the run crosses a
phase boundary (an **approved** `phase_checkpoint` — the only way phases
advance), the next turn executes on the declared model, the transition is shown
inline in the chat as a subtle "switched to X · by playbook Y (Phase N)"
divider, and the user's own explicit model pick always wins over the playbook.
Directives are **structured lines** (`model: scout`, `model: gpt-5 series`,
`model: anthropic/claude-opus-4`) resolved **deterministically** against the
user's actual connections via the existing feature-routing machinery. There is
**no runtime LLM router** and **no prose interpretation**. A playbook with no
directives behaves byte-for-byte as today.

**Version framing:** ships as **AI 3.4** per the version-parity roadmap
(3.2 = T1/T2/T3/T5, 3.3 = resumable streams).

---

## 2. Locked decisions (do not re-litigate)

- **Only playbooks route the chat turn.** Free-chat per-turn auto-routing
  ("router model picks each turn") is REJECTED: it rotates the prompt-cache
  key every switch (v3.2.2 lesson — model is part of the cache identity), adds
  a routing call of latency to every turn, and silently overrides the user's
  pick, violating the straight-faced-routing principle already encoded in the
  `MODEL_UNAVAILABLE` 422 guard. Background features and modality tools are
  ALREADY routed (see §3) — do not rebuild them.
- **Structured directives only in v1.** A `model:` line in a phase / standing
  rules. NO free-prose interpretation ("use a fast model for this" buried in a
  paragraph) — that is the regex-fragile surface and it is severable. Class
  expressions (`gpt-5 series`) live INSIDE the structured line.
- **Deterministic resolution.** Classes resolve by normalized-id prefix/family
  matching over the user's connection models — string ops, table-testable.
  Never an LLM call.
- **Precedence: pinned user pick > phase directive > standing-rules directive >
  settings default > current conversation model.** The user said "the user
  prompt overwrites this" about output targets; model routing inherits the
  same ladder shape (§5).
- **Architecture template = the output-placement system** hardened in 3.2
  (owner directive: "align with the same implementations"):
  `lib/domain/ai/output-target.ts` (canonical type + durable
  `data-output-target` turn binding + latest-user-turn read) +
  `lib/domain/ai/playbooks/output-directives.ts` (validated-playbook prose
  extraction). Model routing mirrors this trio — extend the pattern, don't
  invent a parallel one.
- **Vocabulary = ROLES with capability contracts, not speed tiers.** Owner
  found `fast/balanced/deep` "too vague and overly abstracted." Six roles
  (§8), each a `FeatureSpec` with required/preferred capabilities and (new)
  an optional context-window floor — checkable, not vibes. Users remap roles
  in the existing Feature Routing settings page (rows appear automatically).
- **Never silent substitution.** Every ladder fall-through emits a visible
  inline notice. Explicit binds (user pick, or a playbook's literal
  `provider/model`) are never quietly replaced — unresolvable explicit
  directives surface at the checkpoint pre-flight (§7) or fail straight-faced
  like today's 422/BYOK paths.
- **Switch UX = inline divider line, NOT a pill.** Claude-style: thin rules +
  small text, stating the model AND who switched it ("by you" / "by playbook
  'X' (Phase N)" / "default"). Derived from per-message stamps so it survives
  reload and renders in history.
- **Turn atomicity.** One `streamText` call = one model. "Step-level"
  granularity binds at the next turn boundary; within-turn multi-model already
  exists only as modality tools (`generate_image`/`generate_speech` via
  `toolConfig.routeOverride`) and stays that way.
- **Prevention over recovery** (owner: "prevention is king", citing the
  wrong-vendor incident): one resolution point, stamped as a durable message
  part before execution, executed model echoed back and compared (§6).

---

## 2b. ⚠ Verify against installed reality before wiring (the 3.3 discipline)

The 3.3 build's biggest win was checking every ⚠ against the installed code
before writing any — one check overturned the handoff's suggested API
(`resume: true` → idle-guarded `resumeStream()`). Same drill here:

- ⚠ `messageMetadata` on the `start` part: the route's existing callback
  (route ~1519) pattern-matches `part.type === "finish"`; `type: "start"`
  chunks exist in the installed `ai` types. Confirm the callback actually
  fires for `start` parts in `ai@6.x` before relying on it; if it doesn't,
  fall back to a `data-model-route` part written into the stream via
  `originalMessages`/start-of-stream data instead.
- ⚠ The hoist dependency contract (§4e) — re-derive the exact variable set
  the moved block reads at build time; the route WILL have drifted.
- ⚠ `parsePlaybook` client-safety: it imports only `type JSONContent` today —
  confirm no server-only import crept in before using it in the pre-flight.
- ⚠ Role capability inference: `effectiveCapabilities` does NOT infer
  `reasoning` from ids today (§8 note) — decide add-inference vs demote-to-
  preferred and pin it in `model-routing:check`.

---

## 3. What exists TODAY (grounded — read before designing)

### 3a. Feature routing — already a full router; reuse, don't rebuild

- `lib/domain/ai/features/registry.ts` — `FeatureSpec` (lines 28–59):
  `{ id, label, description, requiredCapabilities, preferredCapabilities?,
  defaultSuggestion? {presetId, modelId}, settingsHref? }`.
  `CapabilityFlag` (15–26): `text | streaming | tools | vision | image |
  speech | audio-input | transcription | reasoning | low-cost | embedding`.
  10 features registered (61–203): `chat`, `image-generation`,
  `text-to-speech`, `speech-to-text`, `tool-result-extraction`, `follow-ups`,
  `chat-title-generation`, `folder-assistant`, `studio-metadata`,
  `studio-generation`.
- `lib/domain/ai/features/router.ts` — `resolveFeatureRoute(userId, featureId)`
  (37–126): user's `AIFeatureRoute` rows (ordered, capability-filtered) →
  registry `defaultSuggestion` → last-resort capability-matched auto-bind →
  `[]`. `resolvePrimaryRoute` (133–139). `modelSatisfiesCapabilities` (147),
  `listCompatibleModels` (160).
- `lib/domain/ai/features/execute-with-fallback.ts` — `executeWithFallback`
  (60–111): one attempt per route in order; `isRetriable` (118–156) hops on
  429/408/5xx/network/timeout, aborts on 4xx (404 model-not-found deliberately
  fatal so misconfig is visible). `NoRoutesAvailableError` /
  `AllRoutesExhaustedError`.
- `lib/domain/ai/features/capabilities.ts` — `effectiveCapabilities` (133–142)
  = explicit `capabilities[]` ∪ id-inferred (`inferCapabilities` 26–98,
  regex families: dall-e/whisper/o-series/…) with alias normalization
  (111–118). **Client-safe module** (split from server-only router) — the
  checkpoint pre-flight can use it in the browser.
- Storage: Prisma `AIFeatureRoute` (`prisma/schema.prisma` ~1379–1402),
  service `lib/features/ai-feature-routes/service.ts` (`setFeatureRoutes` 83),
  API `app/api/ai/feature-routes/route.ts`, settings UI
  `components/settings/AIFeatureRoutingPage.tsx` (renders one row per
  registry entry automatically — new roles appear with zero UI work).

### 3b. Model resolution in the chat route — and THE ordering problem

`app/api/ai/chat/route.ts` resolves the model at lines ~264–467:
`providerId`/`modelId` from body/settings (265–268), then `resolveSource`
ladder `explicit | preset-match | feature-route | legacy` (288–413) with the
**straight-faced guard** (366–402): explicit selection with no serving
connection → `MODEL_UNAVAILABLE` 422, never a silent vendor swap. Model built
at 448–467 (`resolveChatModelFromConnection` → middleware wrap), consumed by
`streamText` at ~1317.

**The playbook is parsed ~500 lines LATER** (~960–1116): attach-mode selection
(923–942: explicit `body.playbookId` / rooted / ambient), parse + phase clamp
(969–976: `Math.min(Math.max(body.activePhaseIndex, 0), phases.length-1)`),
progressive-disclosure injection (1008–1030). **A phase-declared model
currently has no read site — hoisting playbook resolve above model resolution
is the load-bearing refactor of 3.4** (§4e).

Other grounded facts:
- Per-message provider/model stamps already exist and drive per-provider
  bubble theming: `getMessageStamp` / `seedMessageStamps` in
  `lib/domain/ai/use-conversation-engine.ts`; the model is **per-request**,
  nothing pins a conversation — runtime switching is native.
- Turn-start body snapshots `lastSentBodies` (engine ~152–175) exist because
  of the **2026-07-18 wrong-vendor incident**: an approval auto-resume ran
  under default provider resolution and executed the approved tool against the
  wrong vendor. That comment block is the prevention design's origin story.
- Error taxonomy: `lib/domain/ai/chat-errors.ts` (`parseChatError`,
  `BYOK_REQUIRED`/`RATE_LIMITED`/`MODEL_NOT_FOUND`/… + `shouldOfferSettingsCta`);
  client greying via `isModelAvailable`
  (`components/content/ai/MakeAndModelPicker.tsx` 66–78);
  `resolveModelTemperature` (`lib/domain/ai/model-constraints.ts`) guards
  fixed-temperature families.
- Prompt cache (v3.2.2, merged PR #129): executed model + validated playbook +
  rendered active phase are part of the OpenAI cache key
  (`lib/domain/ai/prompt-cache.ts`); phase-grained model binding is
  cache-ALIGNED (same phase+model across runs reuses prefix). Do not break
  the §P3 prompt ordering.

### 3c. Playbook phase machinery

- `lib/domain/ai/playbooks/parse.ts` — `parsePlaybook(doc)` (191–237) splits
  top-level TipTap nodes at the shallowest heading level (197–202) into
  `standingRules` + `phases[]`. `PlaybookSection` (26–33) =
  `{ title, content: JSONContent[], references }` — **no structured metadata
  today**; index is positional. Markdown-like fallback (152–189);
  `stripYamlFrontmatter` (117–129) DISCARDS frontmatter (directives must NOT
  be frontmatter).
- Phase index is **derived client-side from approved checkpoints**
  (`resolvedPhaseIndex`, engine ~961–985: counts `tool-phase_checkpoint`
  parts whose executed output carries `__checkpoint: true` — only APPROVED
  checkpoints have executed). Server merely clamps `body.activePhaseIndex`.
  ⇒ **every model transition is already human-approved, for free.**
- The directive-extraction template:
  `lib/domain/ai/playbooks/output-directives.ts` — pure functions over
  rendered section text, extracted only from the **server-validated** playbook
  (`validatedPlaybookId`, route ~1249–1253), matched most-specific-first.
  `lib/domain/ai/playbooks/checkpoint-gate.ts` (`configurePhaseCheckpointGate`
  47–71) is the phase-scoped runtime-gate precedent.

---

## 4. The design — eight pieces

### 4a. Canonical directive module — `lib/domain/ai/model-directive.ts` (new)

Mirror `output-target.ts` exactly (type + label + durable part + latest-turn
read + parse):

```ts
export type ModelDirective =
  | { kind: "role"; role: ModelRole }                      // model: scout
  | { kind: "class"; family: string }                       // model: gpt-5 series
  | { kind: "explicit"; providerId: string; modelId: string }; // model: anthropic/claude-opus-4

export type ModelRouteSource =
  | "user"            // pinned explicit pick
  | "playbook-phase"  // phase directive
  | "playbook"        // standing-rules directive
  | "settings"        // role/default mapping
  | "default";        // current conversation model (no routing occurred)

export interface ResolvedModelRoute {
  providerId: string;
  modelId: string;
  connectionId?: string;
  source: ModelRouteSource;
  playbookTitle?: string;
  phaseIndex?: number;
}
```

- `parseModelDirective(value: string): ModelDirective | null` — deterministic:
  role keyword → `role`; `<family> series`/known family token → `class`;
  `provider/model` slash form → `explicit`. Pure, table-tested.
- `data-model-route` message part (create/parse/getLatestUserMessage…) — the
  durable turn binding carrying the **announced** `ResolvedModelRoute`, same
  reload/approval-continuation durability contract as `data-output-target`
  (output-target.ts 36–79). This is prevention layer 1 (§6).
- Client-safe (no Prisma) — the checkpoint pre-flight imports it in the
  browser alongside `capabilities.ts`.

### 4b. Class matcher — in `model-directive.ts` (or sibling `model-families.ts`)

`resolveModelClass(family, connections): Array<{connectionId, modelId}>` —
normalize ids (strip `provider/` namespace, lowercase, the same normalization
`inferCapabilities` uses), prefix/family match over the user's
`Connection.models[]` (the runtime truth, NOT the static catalog), rank by:
role/settings mapping presence → capability fit → catalog `costTier` when
known → connection order. The ranked list IS the fallback chain. No match →
`[]` (ladder falls through with a visible notice; a class is advisory, unlike
an explicit bind).

### 4c. Role registry — extend `FEATURE_REGISTRY`

Add six entries (ids `role-scout` … `role-archivist`, §8) with capability
contracts + `defaultSuggestion`s. Add optional `minContextWindow?: number` to
`FeatureSpec` and enforce it in `modelSatisfiesCapabilities` (router.ts 147)
— needed by `archivist`, harmless elsewhere. Rows appear in
`AIFeatureRoutingPage` automatically; optional polish: a "Playbook model
roles" section grouping.

### 4d. Phase directive extraction — `parse.ts` + `playbooks/model-directives.ts` (new)

- In the `parsePlaybook` split loop (204–219): if a section's first content
  node is a paragraph whose full text matches `/^model:\s*(.+)$/i`, record the
  raw value as `PlaybookSection.modelDirective?: string`. Leave the line IN
  `content` (author-visible, harmless to the model). Standing-rules directive
  = playbook-wide default.
- `playbooks/model-directives.ts` — thin canonical wrapper mirroring
  output-directives: `getPhaseModelDirective(parsed, phaseIndex)` →
  `parseModelDirective` on phase value, falling back to standing rules.
  Extracted ONLY from the validated playbook (same trust boundary as output
  directives — never from page content).

### 4e. Route integration — the load-bearing refactor + the ladder

In `app/api/ai/chat/route.ts`:

1. **Hoist playbook resolve** (attach-mode selection + fetch + `parsePlaybook`
   + phase clamp — today at ~923–976) ABOVE the model-resolution block
   (~264–467). The injection/render half stays where it is; only
   parse/phase-select moves. Keep the parsed result in one variable consumed
   by both halves (parse once, not twice).
   **Dependency contract for the moved block** (verify at build, §2b): it may
   consume only `session.user.id`, `body.playbookId`, `contentId`, and
   `messages` (the rooted-execution cue regex reads the latest user message).
   It must NOT reference `conversationIdForAssoc`, `targetFolderId`, or
   anything computed in the conversation-binding section (~558+) — if it
   seems to need one of those, the hoist is being cut at the wrong seam.
   Reference-context resolution, checkpoint-gate config, and prompt
   injection all stay at their current downstream sites.
   **Do the hoist as its own behavior-identical commit (S2a)**: no ladder, no
   new logic — gate it on build green (incl. `prompt-cache:check`) plus a
   manual chat smoke showing identical behavior, THEN add the ladder (S2b).
2. **Add the ladder** ahead of today's `resolveSource` steps, new source value
   `"playbook-phase"` / `"playbook"`:
   - `body.modelPinned === true` (new flag, §4f) → today's explicit path
     untouched; playbook directives ignored this conversation.
   - else phase directive → resolve by kind: `role` →
     `resolveFeatureRoute(userId, "role-…")` (ordered backups + capability
     filter + defaults, free); `class` → `resolveModelClass` chain;
     `explicit` → the existing preset/namespaced connection lookup — if
     unserved, DO NOT substitute: emit the fall-through notice and continue
     down the ladder (pre-flight §7 should have warned already).
   - else standing-rules directive (same resolution).
   - else today's ladder verbatim (explicit → preset-match → namespaced →
     feature-route → legacy).
3. **V1: the resolved chain informs RESOLUTION ORDER only — no runtime hop.**
   The turn commits to the chain's top candidate; a mid-stream provider
   failure keeps today's behavior (error banner → regenerate, which
   re-resolves and naturally tries again). Do NOT wire `executeWithFallback`
   around `streamText` in v1 — adapting the non-streaming fallback wrapper to
   a streaming call (hop only pre-first-token, never after tokens flow) is
   the single trickiest integration in this feature and is deliberately
   deferred to a followup once telemetry shows it's worth it. This also
   matches "prevention is king": a visible failed turn beats an invisible
   vendor hop.
4. Temperature/reasoning constraints re-apply per resolved model
   (`resolveModelTemperature`, reasoning `providerOptions`) — they key off
   modelId and already run post-resolution; verify order after the hoist.
5. Prompt-cache: no change needed — the executed model and phase are already
   key inputs; confirm `prompt-cache:check` still passes.

### 4f. The pinned-pick signal — engine + body

Today the route treats `body.providerId` presence as "explicit" (the 422
guard keys off it), but the engine sends provider/model in EVERY baseline
body — it cannot distinguish "user chose this" from "engine carried the
default." Add `modelPinned: boolean` to the baseline body
(`chatBodyResolvers`, engine ~994–1013).

**Concrete spec — mirror the output-target persistence machinery verbatim**
(engine ~707–745, the template is in scope a few lines above where the pin
lives): a per-conversation localStorage key via a `modelPinStorageKey({
conversationId, contentId })` twin of `outputTargetStorageKey`, hydrated on
key change exactly like the output-target key-change effect (ChatPanel stays
mounted across conversation switches — same leak hazard, same fix). The pin
sets to `true` inside `handleModelChange` (engine ~800–824, the only
user-pick entry point) and clears on… nothing automatic in v1 — an explicit
"unpin" affordance in the picker (small "following playbook" / "pinned"
state) is the release valve. `modelPinned` rides the baseline body AND the
`data-model-route` part so continuations replay it. **This flag is the
precedence ladder's top rung — build and gate it first (S2b), everything
else keys off it.**

### 4g. Turn stamping, echo-compare, and the switch divider

- **Announce:** server, after resolution and before `streamText`, emits the
  `ResolvedModelRoute` via `messageMetadata` on the `start` part (the
  messageMetadata hook at route ~1519–1531 already stamps usage on `finish`;
  add a `start` branch). It also lands in the turn's `data-model-route` part.
- **Stamp:** client seeds message stamps from that metadata
  (`seedMessageStamps` path) so the executed provider/model/source persists
  with the message — reload-safe, history-correct.
- **Compare:** announced (turn part) vs executed (message stamp) — equal →
  normal; different → LOUD inline warning, not a subtle divider. This is what
  makes "wrong AI quietly executing" impossible to miss (§6).
- **`ModelSwitchDivider`** (new, `components/content/ai/`): rendered by
  `ChatPanel`/`ChatViewer` message loops between consecutive assistant
  messages whose stamps differ. Hairline rules + centered small text:
  `Switched to GPT-5 · by playbook "Job Hunt" (Phase 3)` / `· by you` /
  `· default`. Fall-through notices ("'gpt-5 series' unresolvable —
  continuing on Claude Sonnet 4") render in the same visual voice.

### 4h. CI gate — `scripts/validate-model-routing.ts` + `pnpm model-routing:check`

House pattern (`playbooks:check`, `prompt-cache:check`, wired into `build`).
Must cover: directive-parse table (role/class/explicit/garbage); ladder
precedence incl. `modelPinned` top rung; class-matcher determinism; NO silent
substitution (every fall-through produces a notice artifact); continuation
replays the turn's `data-model-route` — **encode the 2026-07-18 wrong-vendor
scenario as a permanent regression case**; `minContextWindow` enforcement.

---

## 5. The precedence ladder (the single most important correctness property)

```
1. modelPinned user pick            → source "user"        (never overridden)
2. phase model: directive           → source "playbook-phase"
3. standing-rules model: directive  → source "playbook"
4. settings mapping / role default  → source "settings"
5. current conversation model       → source "default"     (no routing)
```

Invariants (each is a `model-routing:check` case):
- No directives anywhere ⇒ byte-for-byte today's behavior.
- Every hop DOWN the ladder emits a visible notice.
- Explicit binds (rung 1, or an `explicit` directive) are never substituted.
- Continuations (approval resume, reload, resumed stream) replay the turn's
  stamped route — they never re-run the ladder.

---

## 6. Prevention architecture (the wrong-model bug class)

The 2026-07-18 incident (engine ~152–175) is the template: announced and
executed model resolved at different times by different code paths. Layers:

1. **One resolution point** (the hoisted ladder), frozen into the durable
   `data-model-route` part BEFORE execution; continuations replay the part.
2. **Echo-and-compare** (§4g): executed metadata vs announced part; mismatch
   renders loud. Detection-as-prevention for the silent-divergence class.
3. **Never-silent-substitution invariant** (§5) — visible notice on every
   fall-through; straight-faced failure on explicit binds.
4. **Regression-tested** in `model-routing:check` (§4h).

---

## 7. Recovery — playbooks are healable at runtime

- **Reprompt/picker (heals the turn):** rung 1 beats everything; the divider
  confirms the override took.
- **Edit the playbook (heals the run):** the server re-parses the note every
  request — fix the directive mid-run, next turn uses it. No restart.
  (Prompt-cache key rotates on edit — correct, already built.)
- **Checkpoint pre-flight (heals BEFORE failure):** when the
  `phase_checkpoint` approval card for advancing to phase N+1 renders, the
  client resolves phase N+1's directive **locally** and shows the outcome:
  "Phase 3 will run on GPT-5" or "Phase 3 wants `gpt-5 series` — no matching
  connection: [Continue on current] [Open AI settings]". The user approves a
  phase knowing what will run it.
  **Data path (verified gap — spec it, don't improvise):** the client-side
  `ActivePlaybook` object is only `{id, title, phaseIndex, phaseCount}`
  (engine ~987–997) — it does NOT carry directives. The pre-flight therefore:
  (1) fetches the playbook note's TipTap JSON by `activePlaybookId` via the
  existing content GET (playbooks are ordinary notes), (2) runs
  `parsePlaybook` client-side — it is a pure JSONContent function with a
  type-only import (⚠ confirm, §2b), (3) applies `getPhaseModelDirective` +
  the `model-directive.ts` matcher against `effectiveCapabilities` (already
  client-safe) + the connections list the picker already fetches. No new
  endpoint. Cache the parse per (playbookId, note updatedAt) so repeated
  checkpoints don't refetch.
- Runtime 429/5xx mid-phase: today's error banner + regenerate (re-resolves).

---

## 8. Role vocabulary (v1 — names adjustable at owner's taste)

| Role (`role-*` feature id) | Required | Preferred | `minContextWindow` | Default suggestion | Typical phase |
|---|---|---|---|---|---|
| `scout` | text, tools | low-cost | — | anthropic / claude-haiku-3-5 | research, gather, search |
| `analyst` | text, reasoning | — | — | openai / o3-mini | weigh, decide, plan |
| `writer` | text, streaming | — | — | anthropic / claude-sonnet-4 | draft, compose |
| `coder` | text, tools | — | — | mistral / codestral | implement, script |
| `reviewer` | text, reasoning | — | — | anthropic / claude-opus-4 | critique, verify |
| `archivist` | text | low-cost | 200_000 | google / gemini-2.5-pro | digest a corpus |

Defaults use catalog-present models so out-of-box resolution succeeds via the
existing `defaultSuggestion` → auto-bind ladder even before the user maps
anything. `reasoning` as a required flag: note `effectiveCapabilities` does
not currently infer `reasoning` from ids — either add inference (o-series /
thinking families, mirroring `inferCapabilities` patterns) or drop `reasoning`
from required to preferred for v1. Decide at build; the check script pins the
choice.

---

## 9. Exact files to touch

| File | Change |
|---|---|
| `lib/domain/ai/model-directive.ts` | **new** — types, parse, class matcher, `data-model-route` part (mirror output-target.ts) |
| `lib/domain/ai/playbooks/model-directives.ts` | **new** — phase/standing-rules directive accessor (mirror output-directives.ts) |
| `lib/domain/ai/playbooks/parse.ts` | `modelDirective?` extraction in split loop; `PlaybookSection` field |
| `lib/domain/ai/features/registry.ts` | six `role-*` FeatureSpecs; `minContextWindow?` field |
| `lib/domain/ai/features/router.ts` | enforce `minContextWindow` in `modelSatisfiesCapabilities` |
| `app/api/ai/chat/route.ts` | **hoist playbook parse above model resolution**; ladder + `resolveSource: "playbook-phase" \| "playbook"`; start-part `messageMetadata` route echo; fall-through notices |
| `lib/domain/ai/use-conversation-engine.ts` | `modelPinned` in baseline body + `data-model-route` turn part; stamp seeding from route metadata |
| `components/content/ai/ModelSwitchDivider.tsx` | **new** — divider + mismatch warning + fall-through notice rendering |
| `components/content/ai/ChatPanel.tsx` / `ChatViewer.tsx` | render divider between differing-stamp messages |
| checkpoint approval card component | pre-flight notice + actions (locate via `phase_checkpoint` rendering in ChatMessage/tool cards) |
| `components/settings/AIFeatureRoutingPage.tsx` | optional: "Playbook model roles" grouping (rows already auto-render) |
| `scripts/validate-model-routing.ts` + `package.json` | **new** check + `model-routing:check` in `build` pipeline |
| `docs/notes-feature/work-tracking/AI-V3.2-PLAN.md` | note 3.4 shipped when done (bundle in PR, no solo docs PR) |

**No Prisma changes. No migrations.** Roles reuse the `AIFeatureRoute` table.

---

## 10. Non-goals (write these into the PR body)

- No runtime LLM router; no per-turn auto-routing in free chat.
- No free-prose directive interpretation (structured `model:` lines only).
- No mid-stream model switches (turn is atomic).
- No step-level granularity below the turn boundary in v1.
- No catalog cost/deprecation enrichment (role mapping encodes that judgment).
- No changes to modality-tool routing (`toolConfig.routeOverride` stands).
- No new settings prose editor — Feature Routing rows are the criteria surface.
- No runtime mid-stream fallback hop in v1 (§4e.3) — chain informs resolution
  order only; failures surface via the error banner + regenerate.

---

## 11. Smoke test (each line = a PR checklist item)

- [ ] Playbook with `model: scout` on Phase 2: approve Phase 1 checkpoint →
      Phase 2 turn runs the mapped model; divider says "by playbook (Phase 2)".
- [ ] Pin a model via the picker mid-run → next turns stay pinned; divider
      says "by you"; playbook directives visibly NOT applied.
- [ ] `model: gpt-5 series` with a matching connection → family member runs;
      without → visible fall-through notice, run continues on ladder result.
- [ ] Explicit `model: provider/model` that is unserved → checkpoint
      pre-flight card warns with [Continue on current] / [Open AI settings].
- [ ] Edit the playbook's directive mid-run → next turn uses the correction.
- [ ] Approval continuation after reload replays the turn's stamped model
      (2026-07-18 regression scenario).
- [ ] Playbook with no directives → behavior byte-for-byte unchanged; zero
      dividers.
- [ ] Role remap in Feature Routing settings round-trips and changes the
      routed model on the next phase.
- [ ] `pnpm model-routing:check` green and wired into `pnpm build`.

---

## 12. Branch / worktree / gates

- Branch **off `origin/main`** as `feat/ai-v3.4-model-routing` in a fresh
  worktree (`git worktree add -b feat/ai-v3.4-model-routing
  .claude/worktrees/ai-v34-model-routing origin/main`). Do not build on the
  3.3 worktree.
- First commands: `pnpm install` → `pnpm exec prisma generate` (committed
  client is stale; use `pnpm exec`, not npx).
- Build order (gate each before the next — the S2a/S2b split is the
  reliability keystone):
  **S1** canonical module + parser + roles + check script (pure code, fully
  unit-testable before touching the route) →
  **S2a** route hoist as a behavior-identical pure refactor — no ladder, no
  new logic; gate: build green + chat smoke unchanged →
  **S2b** ladder + `modelPinned` + fall-through notices →
  **S3** stamping + divider + echo-compare →
  **S4** checkpoint pre-flight + settings polish (stretch — if it fights
  back, ship v1 without it; §7's other two recovery paths stand alone) →
  **S5** docs + smoke.
- Gates: `pnpm typecheck` → `pnpm lint` (ratchet: zero new warnings) →
  `NODE_OPTIONS='--max-old-space-size=8192' pnpm build` (now includes
  `prompt-cache:check`, `playbooks:check`, and the new `model-routing:check`).
  No `any`. Next.js 16 `proxy.ts`, never `middleware.ts`.
- **Do not push / open a PR until the owner reviews.** PR uses sprint format,
  §11 items as individual checklist lines.

---

## 13. Pointers

- Repo conventions: `CLAUDE.md` (root) — authoritative.
- Template systems to mirror: `lib/domain/ai/output-target.ts`,
  `lib/domain/ai/playbooks/output-directives.ts`.
- Roadmap memory: `project_ai_v32_roadmap.md`; 3.3 build facts:
  `project_ai_v33_resumable_built.md`.
- Prompt-cache interplay: `docs/notes-feature/work-tracking/AI-V3.2.2-PROMPT-CACHING-PLAN.md`.
- Playbook system plan: `docs/notes-feature/work-tracking/AI-V3.2-T3-PLAYBOOKS-PLAN.md`.
