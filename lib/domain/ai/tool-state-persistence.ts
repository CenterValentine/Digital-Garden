/**
 * Repair approval-gated tool parts loaded from ConversationMessage storage.
 *
 * The live AI SDK can briefly expose a complete tool input as
 * `input-streaming`/`input-available` before it appends the approval request.
 * Older persistence code captured that stale intermediate snapshot. A complete
 * phase checkpoint is safe to restore because `phase_checkpoint` always
 * requires approval and its required input (`phase` + `summary`) is present.
 */
export function normalizePersistedToolParts(parts: unknown): unknown[] {
  if (!Array.isArray(parts)) return [];

  return parts.map((part) => {
    if (!part || typeof part !== "object") return part;
    const candidate = part as {
      type?: unknown;
      state?: unknown;
      toolCallId?: unknown;
      approval?: unknown;
      input?: {
        phase?: unknown;
        summary?: unknown;
      };
    };
    const isRecoverableCheckpoint =
      candidate.type === "tool-phase_checkpoint" &&
      (candidate.state === "input-streaming" ||
        candidate.state === "input-available") &&
      candidate.approval == null &&
      typeof candidate.toolCallId === "string" &&
      typeof candidate.input?.phase === "string" &&
      candidate.input.phase.length > 0 &&
      typeof candidate.input.summary === "string" &&
      candidate.input.summary.length > 0;

    if (!isRecoverableCheckpoint) return part;
    return {
      ...candidate,
      state: "approval-requested",
      approval: {
        // Deterministic so repeated reloads restore the same actionable card.
        id: `aitxt-restored-${candidate.toolCallId}`,
      },
    };
  });
}
