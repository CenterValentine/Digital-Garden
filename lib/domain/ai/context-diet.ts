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
