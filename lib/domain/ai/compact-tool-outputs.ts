/**
 * Tool-output payload diet (AI v3 core S4 — smoke #3 found the MB-scale
 * ciphertext; smoke #5 found that merely stripping `encryptedContent`
 * fails the provider tool's OUTPUT SCHEMA on the next send ("expected
 * string, received undefined")). Client-safe: no server deps.
 *
 * Strategy: provider-executed search results in PAST assistant messages
 * are removed entirely — tool part and results together, so tool_use/
 * tool_result pairing stays intact by absence. The model's own written
 * synthesis of the results (the text parts that follow) carries the
 * knowledge forward; fresh searches re-ground fresh claims. The LAST
 * message is never touched — that is the live continuation/approval path.
 *
 * Wins: no schema validation target, no ciphertext re-upload, and the
 * biggest token reduction of all (whole result arrays gone from history).
 */

import type { UIMessage } from "ai";

function isProviderSearchPart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  const record = part as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (!type.startsWith("tool-") && type !== "dynamic-tool") return false;
  if (record.providerExecuted !== true) return false;
  return Array.isArray(record.output);
}

/**
 * Remove provider-executed search tool parts from all but the final
 * message. Pure — returns new objects only where changes occurred.
 */
export function compactToolOutputs(messages: UIMessage[]): UIMessage[] {
  return messages.map((message, index) => {
    if (message.role !== "assistant" || index === messages.length - 1) {
      return message;
    }
    const parts = message.parts as unknown[];
    const kept = parts.filter((p) => !isProviderSearchPart(p));
    return kept.length === parts.length
      ? message
      : ({ ...message, parts: kept } as unknown as UIMessage);
  });
}
