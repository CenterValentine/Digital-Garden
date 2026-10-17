# Context Window Editor — "What the model sees"

**Status:** BUILT 2026-10-16 on `feat/context-window-editor` (§11 PR 1 + PR 2 in one slice; the §12 defaults were taken: an exchange drop removes tool results AND prose, the line follows truncation). Headless smoke passed on a copy of the evidence conversation; **owner smoke on prod pending** (lines in §11). Deviations from the plan: the ledger measures the prompt's dynamic sections by size (`promptBreakdown`) instead of naming every section (the builder joins unnamed strings; naming them is a prompt-cache-gated refactor); the per-part remove control lives in the tool bubble's expanded result header beside Copy, and text parts are removed per exchange or from the ledger, not per bubble.
**Mock:** private artifact <https://claude.ai/artifact/R77YkXbh46Wmjd6eRXLRLn> (built on the real
local conversation `801f9218` "Job Hunt", 12 messages, today's fold rules applied by calling the
real functions). A copy lives in `.local/mocks/context-window-editor.html` (gitignored: it
carries the owner's transcript text).
**Builder:** hand this file + the mock to the implementing session. Everything below is
symbol-anchored; verify against the code before trusting a line number.

---

## 0. What this is, in one paragraph

Every chat request replays the whole conversation. The route already shrinks that replay with
a chain of **rule folds** (`lib/domain/ai/context-diet.ts`, applied in
`app/api/ai/chat/route.ts` around `resolveAttachmentsForModel(...)`), and the chat UI already
renders the result of those rules as chips (`FoldedPerceptionPart`, `FOLD_CHIP_COPY` in
`components/content/ai/ChatMessage.tsx`). The user cannot drive any of it. This feature adds
**user marks** — "remove this from context", "drop this exchange", "the model reads from
here" — stored on the message, applied in the same model-facing pass as the rule folds,
rendered with the same chip vocabulary, and summed in a **context ledger** that says what the
next request will carry. The persisted transcript is never changed; marks only affect what is
re-sent.

## 1. Evidence (measured on the Job Hunt conversation, local DB)

| Fact | Number | Where it came from |
|---|---|---|
| "Hello" after the run ended cost | **47,134 input tokens** (3,456 cached) | `metadata.segments[0].usage` on message 10 |
| The 9-item scoring turn cost | 442,541 input tokens across 10 requests | message 8 segments |
| Parts in the transcript | 124; **11 fold by today's rules** | `perceptionFoldStates` / `writeInputFoldStates` run over the export |
| Reasoning parts | ~12.7k tokens, stripped on resend (DeepSeek) | `stripReasoningForResend` |
| History the model still carries after folds | ~13.2k tokens (chars/4) | mock ledger |
| System prompt | ~7.7k tokens, 9 sections; the "Context hygiene + charter rules" section alone is ~5.3k | `buildSystemPrompt` with this chat's flags |
| Tool definitions | ~38 tools, estimate ~11k tokens (provider does not itemise) | tool assembly in route |
| Largest single kept items | `createNote` roll-up input 3.3k chars; `search_web` results 2–3k chars each ×6 | export |

Reading: after the folds, the fixed overhead (prompt + tools ≈ 19k) is bigger than the carried
history (≈13k). The editor therefore has to show **all four buckets** — system prompt, tool
definitions, attachments, history — or it will mislead the user about where the tokens go.
The history bucket is still worth editing: the KnowBe4 search results and the roll-up input
are ~6k of pure carry on every later turn of a conversation that then went on for "Hello" and
"Hello again".

This conversation predates PR #250 (fold on distillation/turn), which is why the measured
47k is larger than the mock's estimate. The mock estimate (32k) is chars/4 and omits JSON
tokenisation overhead; treat the per-step meter as truth and the ledger as a guide.

## 2. Doctrine fit (read before changing the shape)

- **Consent-first, visible, reversible.** This is the opposite of the two rejected ideas:
  automatic read elision (rejected 2026-08-08: fuzzy folding silently flipped verdicts) and
  token-cap enforcement (rejected 2026-09-04: mid-run stops killed conversations). Nothing
  here fires on its own. Suggestion chips may *offer*; only a click marks.
- **One boundary implementation, two consumers** (owner rule, P4c). The mark transform lives
  in `context-diet.ts`; the UI chip and the ledger consult the same verdict map. No second
  implementation in the component.
- **Stub, never delete.** A removed tool result becomes a stub so `tool_use`/`tool_result`
  pairing stays intact (the rule `compactToolOutputs` and `dedupeRepeatedToolParts` already
  rely on). Only file parts on user messages may be dropped whole.
- **Model path only.** Marks are read when building `resolvedMessages`; `originalMessages`
  and persistence keep every byte, exactly like `stripReasoningForResend`.
- **Anthropic reasoning is locked.** Signed thinking on a tool-using Claude turn must be
  resent (`stripReasoningForResend` exempts anthropic for this reason). The UI greys those
  parts out instead of letting the user break a tool loop.
- **Never REST-only, never a new extension.** This is a chat affordance plus one transform.
  Gate ladder: not a template, not a block, not an extension.

## 3. Naming

Feature name in UI copy: **"What the model sees"**. The panel section: **"Context ledger"**.
Do not call it "context" alone: `ChatContextPicker` already means custom-instruction
contexts, and the folder-context capsule means something else again.

## 4. Data model — no schema change

Marks live in `ConversationMessage.metadata` (already `Json?`), under one key:

```ts
// lib/domain/ai/context-marks.ts (client-safe, zod-only)
export interface ContextMarks {
  /** Parts the user removed. Tool parts key by toolCallId; others by `${type}#${partIdx}`. */
  removed?: string[];
  /** Set on a USER message: everything BEFORE this message is behind the line. */
  lineAbove?: boolean;
}
```

- Tool parts key by `toolCallId` (stable across re-persist; `dedupeRepeatedToolParts` shows
  ids can repeat across continuation rows, so the first occurrence wins there too).
- Text and reasoning parts key by type + index within the message. Persisted parts are
  verbatim `parts[]`, so the index is stable.
- The line is a boolean on the user message that starts the kept region. There is no
  `Conversation.metadata` column; this avoids a migration and makes the line travel with
  edit/regenerate semantics (see §9).
- Transient sidebar chats (not yet saved) hold marks in `state/ai-chat-store.ts` keyed by
  the conversation key until the binding persists the conversation; the binding then writes
  them through the same PATCH.
- Transport: `UIMessage.metadata` already rides in `body.messages` (the engine's
  `prepareSendMessagesRequest` in `lib/domain/ai/use-conversation-engine.ts` sends the
  messages verbatim). The route reads marks from there. This can only *reduce* context, so
  trusting the client is fine.
- Persistence: `PATCH /api/conversations/[id]/messages/[messageId]/marks` (new, thin; sits
  beside the existing `messages/truncate` route and reuses its ownership check). Body is the
  `ContextMarks` object; the service merges it into `metadata` with the same
  metadata-merge discipline PR #222 fixed (merge, never replace).

## 5. The transform

```ts
// context-diet.ts
export type UserMarkState = "removed" | "behind-line" | "kept";
export function userMarkStates(messages: UIMessage[]): Map<string, UserMarkState>; // "messageIdx:partIdx"
export function applyUserContextMarks(messages: UIMessage[]): UIMessage[];
```

Rules, in `applyUserContextMarks`:

1. **Live tail is untouched.** Find the latest user message; it and everything after it are
   never modified (same guard `supersedeBulkReads` uses for `turn` lifetime).
2. **Line.** The latest user message with `lineAbove` defines the boundary; every message
   before it is treated as removed (all parts), except reasoning on anthropic tool turns.
3. **Removed tool part:** keep `input` (it is small and names what was asked — reuse the
   address-keeping helper from `supersedeWriteInputs` for write tools), replace `output`
   with `USER_REMOVED_STUB` = `[removed from context by the user — the transcript still has
   it; ask the user to restore it if this step truly needs it]`. State stays
   `output-available`.
4. **Removed text part:** replace `text` with `[removed from context by the user]`. Do not
   drop the part: an assistant message with zero parts breaks conversion.
5. **Removed reasoning:** for non-anthropic vendors `stripReasoningForResend` already drops
   it — no-op. For anthropic, a reasoning part on a message that also has tool parts is
   **not removable** (UI disables it; transform ignores the mark). On a text-only Claude turn
   it may be dropped.
6. **Removed file part (user message):** drop the part. `resolveAttachmentsForModel` runs
   after and sees nothing.
7. **`data-*` parts are never removable** (charter, output target, folder context). Those
   are composer-level choices with their own controls (detach charter, change target).

**Chain position:** first — before `supersedePerceptionHistory`. Reason: the rule folds are
index-keyed maps computed on the shape the UI sees, and user marks never remove parts, so
applying them first keeps every later map valid. The UI precedence when both apply:
`live > locked > stripped > removed-by-user > behind-line > folded-by-rule > kept`.

**Gate:** extend `scripts/validate-context-diet.ts` (`pnpm context:diet:check`) with
fixtures: (a) removed tool output stubbed, input kept, pairing intact; (b) live tail
untouched even when marked; (c) line stubs every earlier message; (d) anthropic reasoning on
a tool turn survives a mark; (e) file part dropped; (f) precedence with a rule fold on the
same part. **Mutation-test each fixture** (remove one guard, watch the gate fail) — one guard
per fixture, the lesson from PR B.

## 6. Measuring, not guessing

The mock estimates with chars/4. Make the real thing honest:

- The route already stamps per-request diagnostics into `metadata.segment`
  (`lib/domain/ai/turn-diagnostics.ts`, `TurnSegment`). Add two fields:
  `promptSections: Array<{ name: string; chars: number }>` (from `buildSystemPrompt`, which
  should return its sections alongside the joined string) and `toolDefinitionChars: number`
  (`JSON.stringify` of the assembled tool schemas). After the first request the ledger shows
  measured prompt and tool sizes instead of estimates; the "Hello" example then reads
  honestly as "fixed 19k + history 13k".
- The per-step meter already shows `inputTokens` per step; the ledger's "read N" column per
  turn sums `segments[].usage.inputTokens` exactly as the mock does.
- Client estimate helper `estimateContextLedger(messages, vendor, latestSegment)` in
  `lib/domain/ai/context-ledger.ts` (client-safe): sums kept tokens by bucket using the
  verdict maps + `userMarkStates`. Use `chars/4`; label it "estimate" until a segment exists.

## 7. Affordances (what the mock shows, where each lands)

1. **Per-part control** — hover/focus on a tool result, text part or file chip in
   `ChatMessage.tsx`: "remove from context" / "restore". Add `"removed-by-user"` and
   `"behind-line"` to `FOLD_CHIP_COPY` and route them through `FoldedPerceptionPart` (same
   collapsed rendering, amber chip instead of blue). Greyed + struck label for text parts.
   `ToolCallDisplay` gets a `markState` prop beside `pinState`.
2. **Per-exchange action** — "drop this exchange from context" beside the existing
   edit/regenerate actions (`onEdit` / `onRegenerate` props on `ChatMessage`). Marks every
   removable part of the user+assistant pair; shows "restore this exchange" when all are off.
3. **The line** — a dashed amber divider styled like `ModelSwitchDivider`: "the model reads
   from here". Offered between turns as a quiet "draw the line here" button; one line per
   conversation; "clear" removes it. Sets `lineAbove` on that user message.
4. **Context ledger** — one component, two mounts (the `settingsDialog` pattern):
   - Sidebar chat (`ChatPanel.tsx`): a "Context" tab inside `ChatControlPanel` (it already
     hosts the labelled calibrations; the footer rail stays condensed by design).
   - Saved chat in the main pane (`components/content/viewer/ChatViewer.tsx`): a right-sidebar
     tab via the content-sidebar claim mechanism (`lib/extensions/content-sidebar.ts`) —
     owner rule: supporting views go in the right sidebar, never a panel inside a panel.
   Sections: System prompt (per-section sizes, link to Settings → AI → Tools), Tool
   definitions (count + measured chars), Attachments (charter = the existing
   `onDetachCharter`; files removable; output target locked), History grouped by turn with
   "read N · now M" per turn and a checkbox per part.
5. **Entry point** — the session usage line in the assistant footer (`sessionUsage` in
   `ChatMessage.tsx`) gains "next request ≈ N" and a button that opens the ledger.
6. **Suggestions, never actions** — "Largest results the model still carries" chips in the
   ledger; a click marks, nothing marks itself. No thresholds that act.
7. **Cache note** — when a mark lands before the last ~4 messages, show one line: the cached
   prefix moves and is re-billed once (DeepSeek/OpenAI prefix caches; Anthropic is not opted
   into cache writes — see `prompt-cache.ts`). The batch-checkpoint fold accepts the same trade.

## 8. Chips & traceability

- Every user mark renders a chip on the part (`removed by you` / `behind the line`) in both
  the chat and the ledger; expanding a removed part is free and shows the original.
- The ledger's per-turn "read N" is the provider's billed number from `metadata.segments`,
  so the user can see the effect of a mark on the *next* turn's meter.
- Marks persist with the message, so a reopened chat shows the same chips and the same
  model-facing shape (the route recomputes from the same metadata).
- No anomaly chip is needed: a mark never fails. If a marked part is missing (transcript
  repaired), the mark is ignored silently; the ledger simply does not list it.

## 9. Interactions with edit, regenerate, continuation

- `editMessage` / `regenerateMessage` call the truncate route, which soft-hides the anchor
  and later rows. Marks on hidden rows are irrelevant; a line on a hidden user message
  disappears with it — acceptable and stated in the UI by the line simply not rendering.
- Continuations re-persist a turn; `dedupeRepeatedToolParts` keeps the first occurrence,
  and tool marks key by `toolCallId`, so a mark survives a continuation row. Text marks key
  by index inside the *first* row's parts.
- A mark on a part inside an **active** item-iteration run is allowed but the ledger warns:
  "this run is still reading; the ledger is its memory, not this result" (the fold rules
  already keep the current batch in full vision for a reason).

## 10. Out of scope (do not drift)

- Automatic compaction / summarisation (AI V4 memory bank; `AI-V3.1-PLAN.md` final section).
- Any enforcement: caps, auto-folds above a size, auto-marks. See the two rejection memories.
- Editing system-prompt text. The ledger shows sizes and links to the controls that already
  exist (tool settings, detach charter, output target).
- Cross-conversation marks; marks are per message.

## 11. Build sequence

**PR 1 — the transform and the chips** (`feat/context-marks`): `context-marks.ts`,
`applyUserContextMarks` + `userMarkStates`, route wiring (first in the chain), marks PATCH
route + service merge, engine/binding persistence (transient store → PATCH on bind), per-part
control, per-exchange action, chip copy, gate fixtures mutation-tested.
Smoke (production, per the standing rule for AI-capability work):
- [ ] **Smoke:** remove a `search_web` result in an old turn → next request's per-step
      `inputTokens` drops by roughly that result's size; the part shows "removed by you";
      expanding it still shows the original.
- [ ] **Smoke:** mark a part in the live exchange → the control is absent; nothing changes.
- [ ] **Smoke (Claude):** reasoning on a tool turn shows "locked"; the mark is refused.
- [ ] **Smoke:** reload the chat → chips and the ledger shape are identical.

**PR 2 — the ledger and the line** (`feat/context-ledger`): measured `promptSections` +
`toolDefinitionChars` in the segment, `estimateContextLedger`, the ledger component mounted
in `ChatControlPanel` and as a ChatViewer right-sidebar tab, the line divider, the entry
point on the session usage line, cache note.
- [ ] **Smoke:** draw the line above a finished run → "Hello" afterwards reads measurably
      less than before (compare the two segments' `inputTokens`).
- [ ] **Smoke:** ledger "read N" per turn equals the sum of that turn's segment inputs.

**PR 3 — suggestions + polish**: largest-items chips, keyboard access, mobile drawer mount of
the same component when the sidebar is hidden.

Docs to touch when PR 1 lands: `AI-ARCHITECTURE.md` §2 step 4 (chain order) and
`AGENTIC-RESOURCE-DISCIPLINE.md` §4 (new row: "User context marks — Context — ✅").

## 12. Open questions for the owner (answer before PR 1)

1. **Default unit of the per-exchange action**: mark every removable part (mock) or only tool
   results, leaving the assistant's prose in? The prose is what the model "remembers"; tool
   results are the bulk. Recommendation: tool results only, prose stays; make "also remove
   the reply" a second click.
2. **Should the line survive edit/regenerate above it?** With the line stored on a user
   message, truncating above it keeps the line; truncating at or below it removes it.
   Recommendation: accept this; it matches what a user would expect from "the model reads
   from here".
