# AI Architecture — the map

The narrative companion to the generated [AI-CAPABILITY-MATRIX.md](AI-CAPABILITY-MATRIX.md).
That doc answers *"what does model X get?"*; this one answers *"how does a chat turn
actually work, which tables decide it, and why is it built that way?"*

References are **file + symbol** (not line numbers — they rot). Verified against
`AI-sys-improve/architecture-map` (post-#156 per-model ceilings + #157 drift gates).
When something here contradicts the code, the code wins — then fix this doc.

---

## 1. The surface map

| Concern | Where |
|---|---|
| Chat route (routing, tools, streamText, persistence) | `app/api/ai/chat/route.ts` (~2.5k lines — most invariants live here) |
| Client chat engine (useChat wiring, client tools, budgets) | `lib/domain/ai/use-conversation-engine.ts` |
| Client persistence binding (save turns, merge usage) | `lib/domain/ai/use-conversation-binding.ts` |
| System prompt assembly (pure string builder, no imports) | `lib/domain/ai/system-prompt.ts` → `buildSystemPrompt()` |
| Provider factories (BYOK adapters, legacy resolver) | `lib/domain/ai/providers/registry.ts` |
| Model catalog (**load-bearing**, see §4) | `lib/domain/ai/providers/catalog.ts` → `PROVIDER_CATALOG` |
| Connection templates (what a BYOK connection serves) | `lib/features/ai-connections/templates.ts` → `CONNECTION_TEMPLATES` |
| Server tools (factories) | `lib/domain/ai/tools/{registry,editor-tools,flashcard-tools,workflow-tools}.ts` |
| Client-executed tool contracts (zod-only, client-safe) | `lib/domain/ai/tools/{co-browse-tools,read-page-in-browser,open-tab-and-read}.ts` |
| Tool settings metadata + harness classification | `lib/domain/ai/tools/metadata.ts` (`ALL_TOOL_IDS`, `HARNESS_INTERNAL_TOOL_IDS`) |
| Playbooks (parse, render, binding, checkpoint gate) | `lib/domain/ai/playbooks/` |
| Feature routing (roles, capability filters, fallback) | `lib/domain/ai/features/{registry,router,execute-with-fallback}.ts` |
| Run ledger (iteration/research loop state, a markdown note) | `lib/domain/ai/run-ledger.ts` |
| Prompt caching policy | `lib/domain/ai/prompt-cache.ts` |
| Anomaly chips (failure surfacing in chat) | `components/content/ai/AnomalyChips.tsx` |
| Conversation persistence (Prisma) | `lib/features/conversations/service.ts`; tables `Conversation`, `ConversationMessage` (AI SDK `parts[]` stored verbatim) |

**CI gates over this domain:** `ai:drift:check` (parallel tables, §4/§5),
`ai:matrix:check` (generated matrix freshness), `model-routing:check` (directive
parsing + role specs), `prompt-cache:check` (cache-key identity), `playbooks:check`,
`output-targets:check`. All in the `build` chain; the first two also run in
`.github/workflows/ai-drift.yml` on AI-touching PRs.

---

## 2. One turn's lifecycle

A "turn" (one assistant message) can span **several HTTP requests** — that fact
explains half of the subtle machinery.

1. **Client** (`use-conversation-engine.ts`): `useChat` with a `DefaultChatTransport`;
   the body resolver sends `providerId`, `modelId`, `modelPinned`, `playbookId`,
   `activePhaseIndex`, `outputTarget`, `browserExtensionAvailable`,
   `coBrowseAvailable`, page/viewed hints. It never sends `connectionId`.
2. **Route resolves the model** through the ladder (§3), producing the
   *executed vendor + bare model id* and a `modelRoute` stamp for the message.
3. **Middleware wraps the model**: `defaultSettingsMiddleware` applies temperature
   (via `resolveModelTemperature` — o-series/Kimi are forced to 1) and the output
   ceiling (§4), plus `rateLimitRetryMiddleware` (5 retries, 1s→30s backoff). This is
   the ONLY place temperature/maxOutputTokens are set — `streamText()` itself passes
   neither.
4. **Tools are assembled** (§5) and filtered by user `toolConfig`; the system prompt
   is built from capability flags derived from the final tool set (`"search_web" in
   tools`, etc.), so prompt sections and tools can't disagree.
5. **`streamText` runs the step loop** with `stopWhen: stepCountIs(…)` (§6) and
   `toolChoice: "auto"`. Server tools execute inline; reaching a **client-executed
   tool ends the HTTP stream** at that tool call.
6. **Client executes** the browser/co-browse tool via the extension bridge, then
   `sendAutomaticallyWhen` decides whether to auto-continue the turn with a new
   request. The predicate (`lastMessageHasResolvedBrowserRead`, engine) is
   **deliberately narrow** — it fires only when the last step's parts are all settled
   browser-tool parts. Using the SDK's generic "complete with tool calls" predicate
   would defeat the step cap by resuming turns the server intentionally ended.
7. **Persistence**: the binding saves the message with `parts[]` verbatim.
   `mergeTurnUsageMetadata` (`use-conversation-binding.ts`) **accumulates usage
   across all requests of the turn and keeps the TERMINAL request's finishReason**.
   Why: the 2026-08-08 DeepSeek failure was mis-diagnosed from metadata frozen at
   request #1 ("tool-calls", 659 tokens) while the terminal request died at the
   output cap ("length", 4096).
8. **Anomaly chips** (`AnomalyChips.tsx`) render failure states from the persisted
   record — terminal `finishReason: "length"`, tool errors, captcha detection.
   Chips are a *view* over persisted parts/metadata; new anomaly kinds are derivation
   changes, not new storage.

---

## 3. Model resolution ladder

In `route.ts` POST, in precedence order ("rung" comments in the code):

0. **Playbook phase directive** — only when the user hasn't pinned a model
   (`modelPinned`), via `resolvePlaybookModelRoute()`; unresolved directives emit a
   user-visible notice, never a silent substitution.
1. **Explicit `connectionId`** — dead path from the chat UI today.
2. **Preset match** — `providerId` matched against the user's connections by
   `presetId`. This is the normal BYOK path (DeepSeek, etc.).
3. **Namespaced-model match** — `provider/model` ids against gateway connections.
4. **Straight-faced refusal** — explicit selection that resolves nothing → HTTP 422
   `MODEL_UNAVAILABLE` (never a silent model swap).
5. **Feature route** — no explicit pick → `resolvePrimaryRoute(userId, "chat")` with
   capability + context-window filters.
6. **Legacy resolver** — `MODEL_MAP` in `providers/registry.ts` (canonical id →
   provider string); BYOK-less use throws `BYOKRequiredError` → 402 unless the env
   gateway (`AI_USE_GATEWAY=true`) is on.

**Executed vendor**: for namespaced ids the prefix before the first `/` names the
vendor that actually runs the request; the bare id (after the `/`) is what the
catalog is consulted with. This single derived identity feeds native-search
eligibility, reasoning config, PDF handling, and the output ceiling.

---

## 4. The parallel tables (and why the catalog is load-bearing)

The same model facts live in **five places**, each consumed by different code:

| Table | Consumed by |
|---|---|
| `PROVIDER_CATALOG` (`providers/catalog.ts`) | Output ceiling (`getModelMeta().maxOutput`), reasoning posture (`buildProviderOptions`), settings display |
| `CONNECTION_TEMPLATES` (`ai-connections/templates.ts`) | What a BYOK connection seeds/serves; model pickers |
| `AIProviderId` / `AIModelId` unions (`lib/domain/ai/types.ts`) | Compile-time typing — `ModelMeta.id` IS `AIModelId`, so adding a catalog model forces a union edit |
| Settings `providerId` z.enum (`lib/features/settings/validation.ts`) | Persisted user settings validation |
| `MODEL_MAP` (`providers/registry.ts`) | Legacy no-connection resolver only (subset of the union; BYOK-only models are legitimately absent) |

**History:** the 2026-08-08 prod incident happened because DeepSeek existed in the
templates but not the catalog — so no reasoning config existed for it, and the flat
4096 default output cap truncated its reasoning-heavy steps mid-thought
(`finishReason: "length"`, zero visible output). The fix (#156) made `maxTokens`
resolve as: user's explicit setting → `getModelMeta(bareId).maxOutput` → provider
default; a stored `4096` is normalized to "unset" (it was the legacy imposed default,
never a deliberate choice). That turned catalog absence from "cosmetic" into
"behavioral", which is why `ai:drift:check` gate 1 now enforces coverage and gate 2
enforces a 16k `maxOutput` floor for reasoning-capable models (thinking bills
against the output budget).

**Reasoning config** (`buildProviderOptions` in route.ts): anthropic → thinking
budget for `reasoning: "enabled"` models; google → `includeThoughts`; deepseek →
adaptive thinking, plus `reasoningEffort: "low"` when the turn is inside an approved
item-iteration (**mechanical run** — read→record→next needs no open-ended
deliberation; the effort knob limits thinking *spend*, whereas an output cap only
truncates thinking *after* it is generated and billed). OpenAI o-series needs no
config (`reasoning: "auto"` — emits on its own).

---

## 5. The tool system

**Assembly** (route.ts `allTools`): `createBaseTools` + `createFlashcardTools` +
`createWorkflowTools` + (`editableContentId` ? `createEditorTools`) + conditionally
the client-executed browser tools (`browserExtensionAvailable` →
`read_page_headless_or_browser`, `open_tab_and_read`; `coBrowseAvailable` →
`co_browse_open`, `co_browse_act`, `read_current_page`, `list_tabs`) + `search_web`
(provider-native for anthropic/openai/google/xai; app-executed Tavily/Brave fallback
for everyone else — **no search connection = no search tool at all** for those
vendors). When the extension is reachable, plain `read_page` is removed so
`read_page_headless_or_browser` is the single reader.

**Classification invariant** (drift gate 3): every tool is either
user-configurable (settings metadata in `tools/metadata.ts` and its per-module
siblings) or harness-internal (`HARNESS_INTERNAL_TOOL_IDS` — loop-state and approval
plumbing the user must not be able to disable, plus the browser tools, which are
gated by extension availability and their own trust settings instead). A new tool
that is neither fails the build.

**Client-executed tools have no server `execute`** — the stream ends at the call;
continuation is the client predicate described in §2 step 6. If a turn ends at the
step cap with a *server* tool resolved, that is a deliberate stop, not a bug.

**Two agentic harnesses** compose over these tools, both using the **run ledger**
(a markdown note, `run-ledger.ts` — loop state lives in the ledger + message parts,
never in model memory):

- **Research**: `propose_research_run` (approval-gated) → reads + `extract_structured`
  → `record_research_findings` closes.
- **Per-item iteration**: `propose_item_iteration` (approval-gated; items get tiered
  stable keys — URL when observed, label-slug otherwise) → per item: read/act →
  `record_item_result` → optional `record_batch_checkpoint` every `batchSize` items
  (#156: the harness holds new reads until the checkpoint is recorded) →
  roll-up note + `record_iteration_findings` closes. Budgets are derived
  **client-side from message history** (server tools record items, so a client
  counter would drift) and enforced as a soft-stop at the read tools — fail-open,
  mid-item acting never breaks.

---

## 6. Step budgets

`stopWhen: stepCountIs(…)` in route.ts — the server-side safety ceiling:

| Situation | Steps | Why |
|---|---|---|
| Plain chat | 7 | Default bound on tool loops |
| Editable document open | 8 | One extra step for the edit round-trip |
| Approved research run | `pageBudget × 2 + 4` (budget ≤ 40) | Read + extract per page + overhead |
| Approved item iteration | `itemBudget × 4 + 8` (budget ≤ 200) | Read + record (+ re-read) per item + proposal/roll-up overhead; the client item budget is the true limiter — this ceiling must not cut off before it |

Budgets are recomputed server-side each request by rescanning `body.messages` for
approved proposal parts (and reset when the closing record appears) — the server
never trusts a client-claimed number.

---

## 7. Playbook injection (three mutually exclusive modes)

1. **Explicit attach** (`body.playbookId`): progressive disclosure — standing rules +
   **the active phase only** + a phase TOC + a manifest of the playbook's
   `[[wiki-link]]` references (traced on demand via `getCurrentNote`, never
   preloaded). Checkpoint cadence: checkpoint then STOP (the model has not seen the
   next phase's text).
2. **Rooted execution** (chat rooted in a playbook + execution-shaped user text):
   whole playbook injected; continue-immediately cadence.
3. **Ambient awareness** (rooted in a playbook, not asked to run): one-liner hint
   only.

Weak-model hardening: once a playbook is resolved, `search_playbooks` is removed
from the tool set and the playbook is **bound to the latest user message**
(`playbooks/message-binding.ts`) — system context alone proved insufficient
(a smoke trace showed DeepSeek re-opening the rooted note despite a correctly
injected Active Playbook section). `phase_checkpoint` pauses phases for approve /
revise / approve-with-tweaks verdicts and maintains the run ledger;
`checkpoint-gate.ts` adds runtime proof requirements before approval can be
requested.

---

## 8. Prompt caching

`prompt-cache.ts` `buildPromptCachePolicy`: **app-managed keys are OpenAI-only**
(`supportsOpenAIPromptCaching` per model). The cache key is
`digest(userId, playbookId, playbookContext, tool set)` — insensitive to tool
*order*, rotated by playbook edits and phase advances, isolated per user.
Anthropic is deliberately NOT opted into paid cache writes (policy decision recorded
in `validate-prompt-cache.ts`). DeepSeek caches automatically server-side — its hit
rate is visible only via `cachedInputTokens` in persisted usage (#156). The system
prompt is ordered cache-friendly: stable playbook context precedes run-specific
sections (`buildSystemPrompt` section ordering).

---

## 9. Changing things safely

**Add a model** → catalog entry (`PROVIDER_CATALOG`) **and** `AIModelId` union
**and** (if newly seeded) the template's `defaultModels`. `ai:drift:check` gate 1/2
names anything missed; `pnpm ai:matrix` regenerates the matrix.

**Add a provider** → template + catalog provider + `AIProviderId` union + settings
z.enum + adapter branch in `resolveChatModelFromConnection` (+ `ADAPTER_KINDS` if a
new adapter kind). Gates 1 and 5 enforce; the matrix's "Adapter branch" column
shows a **MISSING** marker if the scan disagrees.

**Add a tool** → define it in a factory (or as a client contract), then classify it:
settings metadata or `HARNESS_INTERNAL_TOOL_IDS`. Gate 3 fails until you decide.
If prompt text or another tool's description references it by name, gate 4 keeps
those references honest — and catches the rename-but-forgot-the-prose case.

**Change the system prompt** → `prompt-cache:check` pins cache-key behavior;
gate 4 re-validates tool-name references; remember section order is part of the
caching design.

**Change tool loop behavior** → the resume predicate (§2 step 6), the step-cap
formulas (§6), and the budget derivations are each deliberately narrow; read their
doc comments before "fixing" them — every one encodes a lesson from a production
failure.
