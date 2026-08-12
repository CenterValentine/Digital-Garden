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

/**
 * Key under which a write tool ships the PRE-WRITE document so the client can offer
 * an Undo chip (AI collab write path, D10).
 *
 * It is a full document, so it must never reach the model — `stripRevertSnapshots`
 * removes it from every outbound message (including the last, unlike the
 * part-removal pass below) and from anything persisted. The client keeps its own
 * copy in memory because `compactToolOutputs` is pure: state retains the snapshot,
 * only the wire copy loses it.
 */
export const REVERT_SNAPSHOT_KEY = "__revertSnapshot";

/**
 * Remove the revert snapshot from one tool part's output.
 *
 * Tool outputs here are JSON *strings*, so this parses, deletes, and re-stringifies.
 * The output stays a string, so nothing about tool_use/tool_result pairing or the
 * provider's output schema changes — which is why this pass is safe to run on the
 * final message where the part-removal pass is not.
 */
function stripSnapshotFromPart(part: unknown): unknown {
  if (!part || typeof part !== "object") return part;
  const record = part as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (!type.startsWith("tool-") && type !== "dynamic-tool") return part;
  if (typeof record.output !== "string") return part;
  if (!record.output.includes(REVERT_SNAPSHOT_KEY)) return part;

  try {
    const parsed = JSON.parse(record.output) as Record<string, unknown>;
    if (!(REVERT_SNAPSHOT_KEY in parsed)) return part;
    delete parsed[REVERT_SNAPSHOT_KEY];
    return { ...record, output: JSON.stringify(parsed) };
  } catch {
    // Not JSON after all — leave it alone rather than corrupting the output.
    return part;
  }
}

/** Strip revert snapshots from every message. Pure; returns new objects only where changed. */
export function stripRevertSnapshots(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    const parts = message.parts as unknown[];
    let touched = false;
    const next = parts.map((part) => {
      const stripped = stripSnapshotFromPart(part);
      if (stripped !== part) touched = true;
      return stripped;
    });
    return touched
      ? ({ ...message, parts: next } as unknown as UIMessage)
      : message;
  });
}

/** Strip revert snapshots from a single message's parts (persistence path). */
export function stripRevertSnapshotFromParts(parts: unknown): unknown {
  if (!Array.isArray(parts)) return parts;
  let touched = false;
  const next = parts.map((part) => {
    const stripped = stripSnapshotFromPart(part);
    if (stripped !== part) touched = true;
    return stripped;
  });
  return touched ? next : parts;
}

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
  // Snapshots come off EVERY message, including the last: they are client-only
  // payloads that would otherwise put a whole document into the model's context on
  // the very next request.
  return stripRevertSnapshots(messages).map((message, index) => {
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
