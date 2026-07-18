/**
 * Tool-output payload diet (AI v3 core S4 — found by playbook smoke #3,
 * 2026-07-18). Client-safe: no server deps.
 *
 * Provider-executed web search results carry `encryptedContent` blobs
 * (Anthropic's citation-grounding payload) of several KB PER RESULT. Ten
 * results per search, several searches per turn → the conversation's
 * subsequent sends haul megabytes of opaque ciphertext on every request,
 * killing the POST ("network error") and torching TPM budgets. This is
 * context discipline's tool-result TTL arriving early, forced by reality.
 *
 * Trade-off, made deliberately: dropping encryptedContent forfeits the
 * provider's ability to re-ground follow-up citations from prior searches.
 * The model's own text summary of the results survives in the transcript,
 * and fresh searches re-ground fresh claims. Titles/URLs/dates are kept so
 * provenance never degrades.
 */

import type { UIMessage } from "ai";

/** Max provider-executed search results retained per tool call. */
const MAX_SEARCH_RESULTS = 5;

function compactOutputItem(item: unknown): unknown {
  if (!item || typeof item !== "object") return item;
  const record = item as Record<string, unknown>;
  if (typeof record.encryptedContent !== "string") return item;
  const { encryptedContent: _dropped, ...rest } = record;
  return rest;
}

function compactPart(part: unknown): unknown {
  if (!part || typeof part !== "object") return part;
  const record = part as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (!type.startsWith("tool-") && type !== "dynamic-tool") return part;
  const output = record.output;
  if (!Array.isArray(output)) return part;
  const hasEncrypted = output.some(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).encryptedContent === "string",
  );
  if (!hasEncrypted) return part;
  return {
    ...record,
    output: output.slice(0, MAX_SEARCH_RESULTS).map(compactOutputItem),
  };
}

/**
 * Strip heavyweight provider ciphertext from tool outputs in an outgoing
 * message array. Pure — returns new objects only where changes occurred.
 */
export function compactToolOutputs(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== "assistant") return message;
    const parts = message.parts as unknown[];
    const compacted = parts.map(compactPart);
    const changed = compacted.some((p, i) => p !== parts[i]);
    return changed
      ? ({ ...message, parts: compacted } as unknown as UIMessage)
      : message;
  });
}
