/**
 * Context diet (S7, 2026-08-08) — request-time transforms that shrink what
 * the model is RE-SENT, without touching what the user sees or what
 * persists. Measured motivation: a 4-item iteration turn re-sent 1.77M
 * nominal input tokens of which only ~82k was new content; DeepSeek's
 * prefix cache absorbed the price, but the 128k WINDOW is the binding
 * constraint — these transforms buy window, not just dollars.
 *
 * Everything here must be provably absence-safe: remove only tokens whose
 * lack the model cannot feel (dead reasoning replays, superseded raw
 * snapshots already digested into the run ledger).
 */

import type { UIMessage } from "ai";
import { parseReadHeader } from "@/lib/domain/data/read-format";

/**
 * Drop reasoning parts from RESENT assistant history for providers that
 * never consume them back. convertToModelMessages forwards reasoning parts
 * as model input verbatim — for DeepSeek that was ~100k chars of dead
 * weight replayed through every request of a 19-request turn. Anthropic is
 * exempt: extended thinking with tool use requires the prior turn's signed
 * thinking blocks to be resent, and the SDK manages those via reasoning
 * parts.
 *
 * Apply ONLY to the model-message path (input to
 * resolveAttachmentsForModel/convertToModelMessages) — NEVER to the
 * `originalMessages` handed to toUIMessageStreamResponse, or continuation
 * merges would strip reasoning from the persisted transcript.
 */
export function stripReasoningForResend(
  messages: UIMessage[],
  executedVendorId: string,
): UIMessage[] {
  if (executedVendorId === "anthropic") return messages;
  return messages.map((m) => {
    if (m.role !== "assistant") return m;
    const parts = m.parts.filter((p) => p.type !== "reasoning");
    return parts.length === m.parts.length ? m : { ...m, parts };
  });
}

// ── OpenAI item references (#193) ───────────────────────────────────────────

/** Provider-metadata namespace the OpenAI Responses API reads item ids from. */
const OPENAI_METADATA_NAMESPACE = "openai";

/**
 * The metadata carriers convertToModelMessages forwards as `providerOptions`
 * on assistant text/reasoning parts (`providerMetadata`), tool calls
 * (`callProviderMetadata`) and tool results (`resultProviderMetadata`). All
 * three can carry an `openai.itemId`, so all three have to be cleaned.
 */
const ITEM_ID_METADATA_FIELDS = [
  "providerMetadata",
  "callProviderMetadata",
  "resultProviderMetadata",
] as const;

/** Returns a cleaned copy of `part`, or null when it carried no item id. */
function withoutOpenAIItemId(
  part: UIMessage["parts"][number],
): UIMessage["parts"][number] | null {
  let next: Record<string, unknown> | null = null;
  for (const field of ITEM_ID_METADATA_FIELDS) {
    const metadata = (part as Record<string, unknown>)[field];
    if (!metadata || typeof metadata !== "object") continue;
    const namespace = (metadata as Record<string, unknown>)[
      OPENAI_METADATA_NAMESPACE
    ];
    if (!namespace || typeof namespace !== "object") continue;
    if (!("itemId" in namespace)) continue;
    const { itemId: _itemId, ...rest } = namespace as Record<string, unknown>;
    next ??= { ...(part as Record<string, unknown>) };
    next[field] = {
      ...(metadata as Record<string, unknown>),
      [OPENAI_METADATA_NAMESPACE]: rest,
    };
  }
  return next as UIMessage["parts"][number] | null;
}

/**
 * Drop `openai.itemId` from RESENT message parts so the transcript replays as
 * the text we are holding rather than as a pointer to OpenAI's server-side
 * item store.
 *
 * With the Responses API's `store` defaulting to true, @ai-sdk/openai emits
 * `{ type: "item_reference", id }` for any part carrying an item id. Those
 * items expire after ~30 days — and a key rotation or a ZDR policy kills them
 * sooner — after which the reference resolves to nothing and every send in
 * that conversation is rejected with `Item with id 'msg_…' not found` (#193).
 *
 * The chat route now also sends `store: false` for OpenAI, which stops NEW
 * transcripts being poisoned; this heals the ones already carrying dead ids,
 * which is every OpenAI conversation predating that change. Stripping is
 * absence-safe in both directions: with `store: false` the id is never a
 * usable reference, and no other vendor reads the `openai` namespace — so the
 * transform is unconditional rather than gated on the executed vendor, and
 * keeps healing a transcript whichever route later reaches it.
 *
 * Only `itemId` is removed; sibling keys in the namespace (`phase`, cache
 * hints) are preserved.
 *
 * Model-path only, same contract as the transforms above: the persisted
 * transcript and `originalMessages` keep every byte.
 */
export function stripOpenAIItemReferences(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => {
    let changed = false;
    const parts = m.parts.map((part) => {
      const stripped = withoutOpenAIItemId(part);
      if (!stripped) return part;
      changed = true;
      return stripped;
    });
    return changed ? { ...m, parts } : m;
  });
}

// ── Snapshot supersession (S8) ──────────────────────────────────────────────

/** Raw-perception outputs eligible for supersession — bulky page data whose
 * decision value ends once the item is recorded in the run ledger. */
const PERCEPTION_TOOL_PARTS = new Set([
  "tool-co_browse_open",
  "tool-co_browse_act",
  "tool-read_current_page",
  "tool-read_page_headless_or_browser",
  "tool-open_tab_and_read",
  "tool-read_page",
  "tool-list_tabs",
]);

/**
 * Re-readable content whose value ends with the reply that used it — folded
 * by the TURN rule only (a charter read is not raw perception distilled into
 * a ledger, so the distillation rule never touches it). The evidence thread
 * behind AI-CONTEXT-ECONOMICS-PLAN read the same charter node four times.
 */
const TURN_FOLD_TOOL_PARTS = new Set([
  ...PERCEPTION_TOOL_PARTS,
  "tool-read_content",
  "tool-search_content",
]);

/** Below this, stubbing saves nothing worth the cache perturbation. */
const SUPERSEDE_MIN_CHARS = 600;

const SUPERSEDED_STUB =
  "[superseded at batch checkpoint — this raw page data was already digested into recorded item results and the run ledger; rely on those records, and re-read the source URL if an item truly needs revisiting]";

const TURN_FOLDED_STUB = (toolName: string, header: string | null) =>
  `[folded — this ${toolName} result from an earlier turn was digested into the reply that followed; call the tool again if a later step truly needs it]` +
  (header ? `\n${header}` : "");

/** The retained header may not itself be worth a re-read's tokens. */
const RETAINED_HEADER_MAX_CHARS = 1500;

/**
 * What a folded read keeps: its HEADER — title, type, and for a database the
 * column list — never its body. Round 2 of AI-CONTEXT-ECONOMICS (2026-09-21):
 * after PR A folded turn 1's reads, turn 2 re-read both ledgers and the
 * Library — five reads, most of an 8-step budget — because it needed the
 * COLUMN NAMES for captureTo and the stub said "call the tool again". The
 * fold had traded tokens for steps. A header is a few hundred bytes and is
 * exactly what a later step asks of an earlier read.
 *
 * read_content renders `Title:` / `Type:` / `Updated:` then a digest whose
 * `Columns:` block lists `- Name (type) — description` lines; that block is
 * kept whole (descriptions included — they are the load-bearing context for
 * capture columns). Anything else keeps its first four lines.
 */
export function retainedReadHeader(output: unknown): string | null {
  if (typeof output !== "string") return null;
  const lines = output.split("\n");
  const columnsAt = lines.findIndex((l) => l.trim() === "Columns:");
  let kept: string[];
  if (columnsAt >= 0) {
    let end = columnsAt + 1;
    while (end < lines.length && /^\s*- /.test(lines[end])) end += 1;
    // Title/type lines above plus the column block — skip the prose in between.
    const head = lines.slice(0, Math.min(columnsAt, 3)).filter((l) => /^(Title|Type|Updated):/.test(l));
    kept = [...head, ...lines.slice(columnsAt, end)];
  } else {
    kept = lines.slice(0, 4);
  }
  const header = kept.join("\n").trim();
  if (!header) return null;
  return header.length > RETAINED_HEADER_MAX_CHARS
    ? `${header.slice(0, RETAINED_HEADER_MAX_CHARS - 1).trimEnd()}…`
    : header;
}

/**
 * A query_database result's column header: the header-once TSV line that
 * follows the summary line. Kept by the bulk-read fold for the same reason
 * as above — column names are what a later step needs from a folded read.
 */
export function retainedQueryColumns(output: unknown): string | null {
  if (typeof output !== "string") return null;
  const second = output.split("\n", 2)[1] ?? "";
  return second.includes("\t") ? second.trim() : null;
}

/**
 * During an ACTIVE batched iteration run, stub raw perception outputs that
 * precede the latest record_batch_checkpoint. Approved rules (owner
 * 2026-08-08): iteration runs only, checkpoint boundaries only, never
 * anything after the last checkpoint (so the current batch keeps full
 * vision). The ledger — which survives untouched — is the cross-batch
 * memory by design.
 *
 * Model-path only (same contract as stripReasoningForResend): the persisted
 * transcript and originalMessages keep every byte. Cache note: each new
 * checkpoint shifts the stub boundary and costs one prefix-cache re-miss —
 * the trade is deliberate; the reclaimed 128k-window space is what lets a
 * 25-item run finish at all.
 */
/**
 * The latest DISTILLATION point in the transcript: the position of the most
 * recent record_batch_checkpoint or record_iteration_findings, or null when
 * neither has happened. Either one means "the raw perception before me has
 * been digested into the ledger".
 *
 * Deliberately NOT gated on an active run (AI-CONTEXT-ECONOMICS-PLAN D1).
 * The previous boundary returned `runActive ? lastCheckpoint : null`, so a
 * successful record_iteration_findings — the moment a run's raw page data
 * became MOST disposable — switched the fold off for the rest of the
 * conversation. Measured on the evidence thread: the working set was ~86k
 * tokens right after a checkpoint and ~326k on the first request after the
 * run ended, with 905 kB of foldable perception re-sent on every request
 * from then on. A later propose_item_iteration never lowers this point:
 * a new run does not un-digest the old one.
 */
export function findDistillationPoint(
  messages: UIMessage[],
): { messageIdx: number; partIdx: number } | null {
  let latest: { messageIdx: number; partIdx: number } | null = null;
  messages.forEach((m, messageIdx) => {
    if (m.role !== "assistant") return;
    m.parts.forEach((part, partIdx) => {
      const p = part as { type?: string; state?: string };
      if (
        (p.type === "tool-record_batch_checkpoint" ||
          p.type === "tool-record_iteration_findings") &&
        p.state === "output-available"
      ) {
        latest = { messageIdx, partIdx };
      }
    });
  });
  return latest;
}

/**
 * Is this part raw perception the distillation rule may stub? Shared by the
 * model-facing fold, the UI collapse, and the batch-gallery grouping in
 * ChatMessage (same rule, same min-chars guard).
 */
export function shouldSupersedePart(part: unknown): boolean {
  const p = part as { type?: string; state?: string; output?: unknown };
  if (!p.type || !PERCEPTION_TOOL_PARTS.has(p.type)) return false;
  if (p.state !== "output-available") return false;
  return JSON.stringify(p.output ?? "").length >= SUPERSEDE_MIN_CHARS;
}

/** Is this part re-readable content the turn rule may stub? */
function isTurnFoldable(part: unknown): boolean {
  const p = part as { type?: string; state?: string; output?: unknown };
  if (!p.type || !TURN_FOLD_TOOL_PARTS.has(p.type)) return false;
  if (p.state !== "output-available") return false;
  return JSON.stringify(p.output ?? "").length >= SUPERSEDE_MIN_CHARS;
}

export type PerceptionFoldState = "folded-distilled" | "folded-turn" | "kept";

/**
 * Fold verdict for every foldable perception / read part, keyed
 * `"messageIdx:partIdx"` — ONE implementation for the model-facing fold and
 * the UI collapse (owner rule: no divergence between front and back). Same
 * shape as bulkReadFoldStates.
 *
 * A part is folded when EITHER rule holds:
 *  - **distillation**: raw perception (PERCEPTION_TOOL_PARTS) that precedes
 *    the latest checkpoint / findings record — the ledger now holds what it
 *    meant. Applies inside the live message too (the current batch, after
 *    the latest distillation point, always keeps full vision).
 *  - **turn**: any TURN_FOLD_TOOL_PARTS result in an assistant message
 *    before the latest user message — the reply that followed IS a
 *    distillation. Same `turn` lifetime bulk reads use (plan §4.6a).
 *
 * Reclaims on the evidence thread: 905 kB (D1).
 */
export function perceptionFoldStates(
  messages: UIMessage[],
): Map<string, PerceptionFoldState> {
  const out = new Map<string, PerceptionFoldState>();
  const distilled = findDistillationPoint(messages);
  let lastUserIdx = -1;
  messages.forEach((m, i) => {
    if (m.role === "user") lastUserIdx = i;
  });

  messages.forEach((m, messageIdx) => {
    if (m.role !== "assistant") return;
    m.parts.forEach((part, partIdx) => {
      if (!isTurnFoldable(part)) return;
      const key = `${messageIdx}:${partIdx}`;
      const beforeDistillation =
        distilled != null &&
        (messageIdx < distilled.messageIdx ||
          (messageIdx === distilled.messageIdx &&
            partIdx < distilled.partIdx));
      if (beforeDistillation && shouldSupersedePart(part)) {
        out.set(key, "folded-distilled");
      } else if (messageIdx < lastUserIdx) {
        out.set(key, "folded-turn");
      } else {
        out.set(key, "kept");
      }
    });
  });
  return out;
}

/** The UI's question for one part. */
export function perceptionFoldState(
  states: Map<string, PerceptionFoldState>,
  messageIdx: number,
  partIdx: number,
): PerceptionFoldState | null {
  return states.get(`${messageIdx}:${partIdx}`) ?? null;
}

/**
 * Model-path fold for perception and re-readable reads. Same contract as
 * every transform here: NEVER applied to originalMessages/persistence; the
 * transcript keeps every byte, and the UI renders the same parts collapsed.
 */
export function supersedePerceptionHistory(messages: UIMessage[]): UIMessage[] {
  const states = perceptionFoldStates(messages);
  if (![...states.values()].some((s) => s !== "kept")) return messages;

  return messages.map((m, messageIdx) => {
    if (m.role !== "assistant") return m;
    let changed = false;
    const parts = m.parts.map((part, partIdx) => {
      const state = states.get(`${messageIdx}:${partIdx}`);
      if (state !== "folded-distilled" && state !== "folded-turn") return part;
      changed = true;
      const toolName = ((part as { type?: string }).type ?? "tool-").replace(
        /^tool-/,
        "",
      );
      return {
        ...(part as Record<string, unknown>),
        output:
          state === "folded-distilled"
            ? SUPERSEDED_STUB
            : TURN_FOLDED_STUB(
                toolName,
                retainedReadHeader((part as { output?: unknown }).output),
              ),
      } as typeof part;
    });
    return changed ? { ...m, parts } : m;
  });
}

// ── Write inputs (AI-CONTEXT-ECONOMICS-PLAN B1) ────────────────────────────

/**
 * Tools whose INPUT has a durable home the moment the call succeeds: the
 * database, note, or ledger they wrote to. On the evidence thread the model
 * typed 201 kB into `insert_rows` (8 calls, 25 kB each) — generated text,
 * the expensive kind — and then re-read it as input on every later step.
 */
const WRITE_TOOL_PARTS = new Set([
  "tool-insert_rows",
  "tool-update_rows",
  "tool-update_row",
  "tool-update_note",
  "tool-record_item_result",
]);

/** The run's item list — superseded only once the run has recorded findings. */
const PROPOSAL_TOOL_PART = "tool-propose_item_iteration";

const WRITE_INPUT_MIN_CHARS = 600;

/** Scalar input fields short enough to keep as addresses (targets, ids, statuses). */
const WRITE_INPUT_KEEP_MAX_CHARS = 80;

export type WriteInputFoldState = "folded" | "kept";

function isWritePart(part: unknown): part is {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
} {
  if (!part || typeof part !== "object") return false;
  const p = part as { type?: unknown; state?: unknown };
  return (
    typeof p.type === "string" &&
    (WRITE_TOOL_PARTS.has(p.type) || p.type === PROPOSAL_TOOL_PART) &&
    p.state === "output-available"
  );
}

/** A write that did not succeed keeps its input — the model may need it to retry. */
function writeSucceeded(output: unknown): boolean {
  if (output && typeof output === "object") {
    const o = output as { ok?: unknown; error?: unknown; success?: unknown };
    if (o.ok === false || o.success === false) return false;
    if (typeof o.error === "string" && o.error.length > 0) return false;
  }
  return true;
}

/**
 * Fold verdict for every large, successful write input, keyed
 * `"messageIdx:partIdx"`. Same two boundaries as perceptionFoldStates —
 * before the latest distillation point, or in a turn before the latest user
 * message — because within the current batch the model may still refer to
 * what it just wrote. `propose_item_iteration` folds only once a
 * `record_iteration_findings` exists after it (during the run the model
 * addresses items by that list).
 */
export function writeInputFoldStates(
  messages: UIMessage[],
): Map<string, WriteInputFoldState> {
  const out = new Map<string, WriteInputFoldState>();
  const distilled = findDistillationPoint(messages);
  let lastUserIdx = -1;
  let lastFindings: { messageIdx: number; partIdx: number } | null = null;
  messages.forEach((m, i) => {
    if (m.role === "user") lastUserIdx = i;
    if (m.role !== "assistant") return;
    m.parts.forEach((part, partIdx) => {
      const p = part as { type?: string; state?: string };
      if (p.type === "tool-record_iteration_findings" && p.state === "output-available") {
        lastFindings = { messageIdx: i, partIdx };
      }
    });
  });

  messages.forEach((m, messageIdx) => {
    if (m.role !== "assistant") return;
    m.parts.forEach((part, partIdx) => {
      if (!isWritePart(part)) return;
      const inputLength = JSON.stringify(part.input ?? "").length;
      if (inputLength < WRITE_INPUT_MIN_CHARS) return;
      if (!writeSucceeded(part.output)) return;
      // A fold must SHRINK. The stub keeps every short scalar, so an input
      // made of many short fields and no payload can come out longer than
      // it went in — leave those alone rather than grow the context.
      const toolName = part.type.replace(/^tool-/, "");
      const stubLength = JSON.stringify(supersededWriteInput(toolName, part.input)).length;
      if (stubLength >= inputLength) return;
      const key = `${messageIdx}:${partIdx}`;
      const before = (
        point: { messageIdx: number; partIdx: number } | null,
      ): boolean =>
        point != null &&
        (messageIdx < point.messageIdx ||
          (messageIdx === point.messageIdx && partIdx < point.partIdx));
      if (part.type === PROPOSAL_TOOL_PART) {
        out.set(key, before(lastFindings) ? "folded" : "kept");
        return;
      }
      out.set(
        key,
        before(distilled) || messageIdx < lastUserIdx ? "folded" : "kept",
      );
    });
  });
  return out;
}

/**
 * The stub keeps the input's ADDRESSES (short scalars — ids, targets,
 * statuses) and drops its PAYLOAD (rows, cells, prose), so the model can
 * still say what it wrote where without carrying what it wrote.
 */
function supersededWriteInput(toolName: string, input: unknown): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  let rows: number | null = null;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        if (k === "rows" || k === "updates" || k === "items") rows = v.length;
        continue;
      }
      if (typeof v === "number" || typeof v === "boolean") kept[k] = v;
      else if (typeof v === "string" && v.length <= WRITE_INPUT_KEEP_MAX_CHARS) kept[k] = v;
    }
  }
  const what = rows != null ? `${rows} item(s)` : "its content";
  return {
    superseded: `[input superseded — this ${toolName} call succeeded and ${what} now live where it wrote them; use query_database / read_content to re-read rather than this input]`,
    ...kept,
  };
}

/**
 * Model-path fold for write inputs. Historical tool-call `input` is forwarded
 * verbatim by convertToModelMessages with no schema validation, and the chat
 * route never validates incoming history — which is why stubbing an INPUT is
 * safe where stripping an OUTPUT field failed a provider schema (smoke #5).
 * The output (row ids, receipts) is kept untouched. Same contract as every
 * transform here: never applied to originalMessages/persistence.
 */
export function supersedeWriteInputs(messages: UIMessage[]): UIMessage[] {
  const states = writeInputFoldStates(messages);
  if (![...states.values()].some((s) => s === "folded")) return messages;

  return messages.map((m, messageIdx) => {
    if (m.role !== "assistant") return m;
    let changed = false;
    const parts = m.parts.map((part, partIdx) => {
      if (states.get(`${messageIdx}:${partIdx}`) !== "folded") return part;
      changed = true;
      const p = part as { type?: string; input?: unknown };
      const toolName = (p.type ?? "tool-").replace(/^tool-/, "");
      return {
        ...(part as Record<string, unknown>),
        input: supersededWriteInput(toolName, p.input),
      } as typeof part;
    });
    return changed ? { ...m, parts } : m;
  });
}

// ── Denied approvals teach (AI-CONTEXT-ECONOMICS-PLAN §6b.4) ───────────────

/**
 * What the model reads for a denied approval. convertToModelMessages
 * forwards `approval.reason` when the client set one and otherwise the bare
 * "Tool execution denied." — which tells the model nothing about what to do
 * next. Prod 5e5b739d (2026-09-22): a 20k-token read was denied (the owner
 * wanted a charter edit in context first), the model re-asked the same read,
 * and the turn ended with four steps unused.
 */
export function deniedApprovalReason(toolName: string): string {
  if (toolName === "query_database") {
    return "The user declined this read at that size. Do NOT re-request it as is. Continue with what you already have, or request a much smaller read (a lower budget, fewer columns, a search or rowIds) that needs no approval.";
  }
  return `The user declined this ${toolName} call. Do NOT repeat the same call. Continue without it if you can; otherwise ask the user, in one line, what they would prefer instead.`;
}

/**
 * Model-path only: give every denied approval that carries no reason a
 * teaching one, keyed by tool. The part's state and the transcript are
 * untouched — only what the model is told changes.
 */
export function teachDeniedApprovals(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => {
    if (m.role !== "assistant") return m;
    let changed = false;
    const parts = m.parts.map((part) => {
      const p = part as {
        type?: string;
        state?: string;
        approval?: { reason?: unknown } & Record<string, unknown>;
      };
      if (!p.type?.startsWith("tool-") || p.state !== "output-denied") return part;
      if (typeof p.approval?.reason === "string" && p.approval.reason.trim()) return part;
      changed = true;
      return {
        ...(part as Record<string, unknown>),
        approval: { ...(p.approval ?? {}), reason: deniedApprovalReason(p.type.replace(/^tool-/, "")) },
      } as typeof part;
    });
    return changed ? { ...m, parts } : m;
  });
}

// ── Repeated tool parts (AI-CONTEXT-ECONOMICS-PLAN A2) ─────────────────────

/** Below this an identical output is cheaper to keep than to perturb the cache over. */
const DEDUPE_MIN_CHARS = 600;

const DUPLICATE_OUTPUT_STUB = (toolName: string) =>
  `[identical to an earlier ${toolName} result with the same input — nothing changed; that earlier result is still in context]`;

export type DuplicatePartState = "dropped-duplicate-call" | "identical-output";

function isToolPart(part: unknown): part is {
  type: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
} {
  if (!part || typeof part !== "object") return false;
  const type = (part as { type?: unknown }).type;
  return (
    typeof type === "string" && (type.startsWith("tool-") || type === "dynamic-tool")
  );
}

/**
 * Content-addressed duplicate verdicts, keyed `"messageIdx:partIdx"` — one
 * implementation for the model-facing pass and the UI collapse. First
 * occurrence always wins; only `output-available` parts are ever candidates,
 * so a call still awaiting its result (the live continuation / approval
 * path) is never touched.
 *
 * Two duplicate shapes, measured on the evidence thread:
 *  - **dropped-duplicate-call** — the same `toolCallId` already appeared in
 *    an earlier message. Continuations that re-persist a turn stored the
 *    same 25 parts in four messages (433 kB). Duplicate ids are malformed
 *    history; the later copy is removed WHOLE, call and result together, so
 *    tool_use/tool_result pairing stays intact by absence — the rule
 *    compactToolOutputs already relies on.
 *  - **identical-output** — a different call whose type + input + output are
 *    byte-identical to an earlier one (110 kB of repeated page snapshots).
 *    The provider still needs a result for this call, so the OUTPUT becomes
 *    a pointer stub. On the newest part this is the most useful stub of all:
 *    "nothing changed" is exactly what the model needs to hear after an
 *    action that did nothing.
 *
 * Provably absence-safe — the exact bytes are earlier in context. And
 * deterministic: the same history always folds the same way, so unlike a
 * checkpoint boundary this never shifts the prefix cache.
 *
 * Never touches `reasoning` (Anthropic signed thinking must be resent
 * verbatim), `text`, `step-start` or `data-*` parts — only tool parts.
 */
export function duplicatePartStates(
  messages: UIMessage[],
): Map<string, DuplicatePartState> {
  const out = new Map<string, DuplicatePartState>();
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();
  messages.forEach((m, messageIdx) => {
    if (m.role !== "assistant") return;
    m.parts.forEach((part, partIdx) => {
      if (!isToolPart(part) || part.state !== "output-available") return;
      const key = `${messageIdx}:${partIdx}`;
      if (typeof part.toolCallId === "string" && part.toolCallId.length > 0) {
        if (seenIds.has(part.toolCallId)) {
          out.set(key, "dropped-duplicate-call");
          return;
        }
        seenIds.add(part.toolCallId);
      }
      const outputText = JSON.stringify(part.output ?? "");
      if (outputText.length < DEDUPE_MIN_CHARS) return;
      const contentKey = `${part.type} ${JSON.stringify(part.input ?? null)} ${outputText}`;
      if (seenContent.has(contentKey)) {
        out.set(key, "identical-output");
        return;
      }
      seenContent.add(contentKey);
    });
  });
  return out;
}

/** The UI's question for one part. */
export function duplicatePartState(
  states: Map<string, DuplicatePartState>,
  messageIdx: number,
  partIdx: number,
): DuplicatePartState | null {
  return states.get(`${messageIdx}:${partIdx}`) ?? null;
}

/**
 * Model-path dedupe. Apply AFTER the fold transforms so their index-keyed
 * states are computed on the same message shape the UI sees; this pass is
 * the only one that removes parts. Same contract: never applied to
 * originalMessages/persistence.
 */
export function dedupeRepeatedToolParts(messages: UIMessage[]): UIMessage[] {
  const states = duplicatePartStates(messages);
  if (states.size === 0) return messages;

  return messages.map((m, messageIdx) => {
    if (m.role !== "assistant") return m;
    let changed = false;
    const parts: UIMessage["parts"] = [];
    m.parts.forEach((part, partIdx) => {
      const state = states.get(`${messageIdx}:${partIdx}`);
      if (state === "dropped-duplicate-call") {
        changed = true;
        return;
      }
      if (state === "identical-output") {
        changed = true;
        const toolName = ((part as { type?: string }).type ?? "tool-").replace(
          /^tool-/,
          "",
        );
        parts.push({
          ...(part as Record<string, unknown>),
          output: DUPLICATE_OUTPUT_STUB(toolName),
        } as typeof part);
        return;
      }
      parts.push(part);
    });
    return changed ? { ...m, parts } : m;
  });
}


// ── Bulk database reads (AI-BULK-ROW-READING-PLAN §4.6) ─────────────────

/** Below this, a read is cheaper to keep than to perturb the cache over. */
const BULK_READ_MIN_CHARS = 600;

/** Pinned (`chat`) reads may hold at most this much, newest first. */
export const DEFAULT_PINNED_ALLOWANCE_TOKENS = 12_000;

const BULK_READ_STUB = (
  table: string,
  rows: number,
  tokens: number,
  columns: string | null,
) =>
  `[superseded — this database read (${rows} rows of "${table}", ~${Math.round(tokens / 100) / 10}k tokens) was digested into the reply that followed; call query_database again if a later step truly needs the rows]` +
  (columns ? `\ncolumns: ${columns.split("\t").join(" · ")}` : "");

export type BulkReadFoldState = "kept" | "pinned-run" | "pinned-chat" | "folded";

/**
 * Applied lifetime + fold verdict for every query_database part, by
 * (messageIdx, partIdx). ONE implementation for the model-facing fold and
 * the UI collapse/pin chips (the iteration fold's rule, kept).
 *
 * Rules (plan §4.6a):
 *  - `turn`: folds once an assistant message precedes the latest user message.
 *  - promotion by adjacency: a `turn` read in the same assistant message as,
 *    and before, an approved propose_item_iteration is treated as `run`.
 *  - `run`: kept while that run is active (no record_iteration_findings yet);
 *    once the run ends, folds like `turn`. `run` with no run ever started
 *    after it degrades to `turn`.
 *  - `chat`: kept newest-first until the pinned allowance is spent.
 */
export function bulkReadFoldStates(
  messages: UIMessage[],
  options: { pinnedAllowanceTokens?: number } = {},
): Map<string, BulkReadFoldState> {
  const allowance = options.pinnedAllowanceTokens ?? DEFAULT_PINNED_ALLOWANCE_TOKENS;
  const key = (m: number, p: number) => `${m}:${p}`;
  const out = new Map<string, BulkReadFoldState>();

  let lastUserIdx = -1;
  messages.forEach((m, i) => {
    if (m.role === "user") lastUserIdx = i;
  });

  // Run state by message: which runs are active at the END of the
  // transcript, and where each was proposed.
  interface ReadPart {
    messageIdx: number;
    partIdx: number;
    lifetime: "turn" | "run" | "chat";
    tokens: number;
    table: string;
    rows: number;
  }
  const reads: ReadPart[] = [];
  let runActive = false;
  let runStart: { messageIdx: number; partIdx: number } | null = null;
  const runSpans: Array<{ start: { messageIdx: number; partIdx: number }; end: { messageIdx: number } | null }> = [];

  messages.forEach((m, messageIdx) => {
    if (m.role !== "assistant") return;
    m.parts.forEach((part, partIdx) => {
      const p = part as { type?: string; state?: string; output?: unknown };
      if (p.type === "tool-propose_item_iteration" && p.state === "output-available") {
        const ok = (p.output as { ok?: boolean } | undefined)?.ok;
        if (ok) {
          runActive = true;
          runStart = { messageIdx, partIdx };
          runSpans.push({ start: runStart, end: null });
        }
      } else if (p.type === "tool-record_iteration_findings" && p.state === "output-available") {
        if (runActive) {
          runSpans[runSpans.length - 1].end = { messageIdx };
        }
        runActive = false;
        runStart = null;
      } else if (p.type === "tool-query_database" && p.state === "output-available") {
        const text = typeof p.output === "string" ? p.output : "";
        if (text.length < BULK_READ_MIN_CHARS) return;
        const header = parseReadHeader(text);
        reads.push({
          messageIdx,
          partIdx,
          lifetime: header?.lifetime ?? "turn",
          tokens: header?.tokens ?? Math.ceil(text.length / 4),
          table: header?.table ?? "database",
          rows: header?.rows ?? 0,
        });
      }
    });
  });

  const inActiveRun = (r: ReadPart): boolean =>
    runSpans.some(
      (span) =>
        span.end === null &&
        (r.messageIdx > span.start.messageIdx ||
          (r.messageIdx === span.start.messageIdx && r.partIdx >= span.start.partIdx)),
    );
  const adjacentToProposal = (r: ReadPart): boolean =>
    runSpans.some(
      (span) =>
        span.end === null &&
        span.start.messageIdx === r.messageIdx &&
        r.partIdx < span.start.partIdx,
    );

  let pinnedSpent = 0;
  // Newest first so the allowance keeps the latest pins.
  for (const r of [...reads].reverse()) {
    const k = key(r.messageIdx, r.partIdx);
    const beforeLatestUser = r.messageIdx < lastUserIdx;
    if (r.lifetime === "chat") {
      if (pinnedSpent + r.tokens <= allowance) {
        pinnedSpent += r.tokens;
        out.set(k, "pinned-chat");
      } else {
        out.set(k, beforeLatestUser ? "folded" : "kept");
      }
      continue;
    }
    if (r.lifetime === "run" || adjacentToProposal(r)) {
      if (inActiveRun(r) || adjacentToProposal(r)) {
        out.set(k, "pinned-run");
        continue;
      }
      // Run over (or never started): behaves as `turn`.
    }
    out.set(k, beforeLatestUser ? "folded" : "kept");
  }
  return out;
}

/** The UI's question for one part. */
export function bulkReadFoldState(
  states: Map<string, BulkReadFoldState>,
  messageIdx: number,
  partIdx: number,
): BulkReadFoldState | null {
  return states.get(`${messageIdx}:${partIdx}`) ?? null;
}

/**
 * Model-path fold for bulk reads. Same contract as the other transforms:
 * NEVER applied to originalMessages/persistence; the transcript keeps
 * every byte.
 */
export function supersedeBulkReads(
  messages: UIMessage[],
  options: { pinnedAllowanceTokens?: number } = {},
): UIMessage[] {
  const states = bulkReadFoldStates(messages, options);
  if (![...states.values()].some((s) => s === "folded")) return messages;
  return messages.map((m, messageIdx) => {
    if (m.role !== "assistant") return m;
    let changed = false;
    const parts = m.parts.map((part, partIdx) => {
      if (states.get(`${messageIdx}:${partIdx}`) !== "folded") return part;
      const p = part as { output?: unknown };
      const text = typeof p.output === "string" ? p.output : "";
      const header = parseReadHeader(text);
      changed = true;
      return {
        ...(part as Record<string, unknown>),
        output: BULK_READ_STUB(
          header?.table ?? "database",
          header?.rows ?? 0,
          header?.tokens ?? Math.ceil(text.length / 4),
          retainedQueryColumns(text),
        ),
      } as typeof part;
    });
    return changed ? { ...m, parts } : m;
  });
}
