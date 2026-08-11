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

/** Below this, stubbing saves nothing worth the cache perturbation. */
const SUPERSEDE_MIN_CHARS = 600;

const SUPERSEDED_STUB =
  "[superseded at batch checkpoint — this raw page data was already digested into recorded item results and the run ledger; rely on those records, and re-read the source URL if an item truly needs revisiting]";

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
export function supersedeIterationHistory(messages: UIMessage[]): UIMessage[] {
  // Single pass: track the ACTIVE run and its latest checkpoint position.
  let runActive = false;
  let lastCheckpoint: { messageIdx: number; partIdx: number } | null = null;
  messages.forEach((m, messageIdx) => {
    if (m.role !== "assistant") return;
    m.parts.forEach((part, partIdx) => {
      const p = part as { type?: string; state?: string; output?: unknown };
      if (
        p.type === "tool-propose_item_iteration" &&
        p.state === "output-available"
      ) {
        const out = p.output as { ok?: boolean } | undefined;
        if (out?.ok) {
          runActive = true;
          lastCheckpoint = null; // never bleed a previous run's boundary in
        }
      } else if (
        p.type === "tool-record_batch_checkpoint" &&
        p.state === "output-available" &&
        runActive
      ) {
        lastCheckpoint = { messageIdx, partIdx };
      } else if (
        p.type === "tool-record_iteration_findings" &&
        p.state === "output-available"
      ) {
        runActive = false;
        lastCheckpoint = null;
      }
    });
  });
  if (!runActive || !lastCheckpoint) return messages;
  const boundary: { messageIdx: number; partIdx: number } = lastCheckpoint;

  return messages.map((m, messageIdx) => {
    if (m.role !== "assistant" || messageIdx > boundary.messageIdx) return m;
    let changed = false;
    const parts = m.parts.map((part, partIdx) => {
      if (
        messageIdx === boundary.messageIdx &&
        partIdx >= boundary.partIdx
      ) {
        return part;
      }
      const p = part as { type?: string; state?: string; output?: unknown };
      if (
        !p.type ||
        !PERCEPTION_TOOL_PARTS.has(p.type) ||
        p.state !== "output-available"
      ) {
        return part;
      }
      if (JSON.stringify(p.output ?? "").length < SUPERSEDE_MIN_CHARS) {
        return part;
      }
      changed = true;
      return {
        ...(part as Record<string, unknown>),
        output: SUPERSEDED_STUB,
      } as typeof part;
    });
    return changed ? { ...m, parts } : m;
  });
}
