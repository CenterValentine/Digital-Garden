/**
 * Folder-mention chip + durable trace (FOLDER-CONTEXT-CAPSULE-PLAN → Phase 4,
 * sweep B5 two-stage gate, D13 chips & traceability).
 *
 * The live chip state machine runs in the composer (client pre-flight on
 * mention insert); at send, the final state snapshot rides a
 * `data-folder-context` UIMessage part — persisted and rendered with the
 * sent user message (the durable trace), ignored by convertToModelMessages.
 * The SERVER re-runs the gate at send regardless (authoritative half).
 *
 * Pure types + helpers — client-safe, mirrors playbooks/message-binding.ts.
 */

export type FolderMentionStatus =
  | "checking" // pre-flight in progress (live chip only)
  | "fresh"
  | "stale"
  | "none"
  | "optedOut";

export interface FolderContextMentionData {
  folderId: string;
  title: string;
  status: FolderMentionStatus;
  /** LLM calls the gate's drains spent (0 when already fresh). */
  generationCalls: number;
  /** Nodes whose sections actually changed. */
  refreshedNodes: number;
  /** Why the ladder stopped short of fresh, when it did. */
  reason?: string;
  waitedMs?: number;
}

export interface FolderContextMentionPart {
  type: "data-folder-context";
  data: FolderContextMentionData;
}

export function createFolderContextMentionPart(
  data: FolderContextMentionData
): FolderContextMentionPart {
  return { type: "data-folder-context", data };
}

export function parseFolderContextMentionPart(
  part: unknown
): FolderContextMentionData | null {
  if (!part || typeof part !== "object") return null;
  const candidate = part as {
    type?: unknown;
    data?: {
      folderId?: unknown;
      title?: unknown;
      status?: unknown;
      generationCalls?: unknown;
      refreshedNodes?: unknown;
      reason?: unknown;
      waitedMs?: unknown;
    };
  };
  if (
    candidate.type !== "data-folder-context" ||
    typeof candidate.data?.folderId !== "string" ||
    typeof candidate.data.title !== "string" ||
    typeof candidate.data.status !== "string"
  ) {
    return null;
  }
  return {
    folderId: candidate.data.folderId,
    title: candidate.data.title,
    status: candidate.data.status as FolderMentionStatus,
    generationCalls:
      typeof candidate.data.generationCalls === "number"
        ? candidate.data.generationCalls
        : 0,
    refreshedNodes:
      typeof candidate.data.refreshedNodes === "number"
        ? candidate.data.refreshedNodes
        : 0,
    reason:
      typeof candidate.data.reason === "string"
        ? candidate.data.reason
        : undefined,
    waitedMs:
      typeof candidate.data.waitedMs === "number"
        ? candidate.data.waitedMs
        : undefined,
  };
}
