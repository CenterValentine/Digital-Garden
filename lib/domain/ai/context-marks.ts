/**
 * User context marks — "What the model sees" (CONTEXT-WINDOW-EDITOR-PLAN §4).
 *
 * A mark is the user's own verdict on a part of the transcript: "the model
 * should stop carrying this". Marks live in `ConversationMessage.metadata`
 * under one key and travel with the UIMessage the client sends, so the chat
 * route reads them from `body.messages` with no extra lookup. They are the
 * consent-first inverse of the automatic folds in `context-diet.ts`: nothing
 * here fires on its own, and the persisted transcript is never changed —
 * only what is RE-SENT to the model.
 *
 * Client-safe: no Prisma, no React.
 */

import type { UIMessage } from "ai";

export const CONTEXT_MARKS_KEY = "contextMarks";

export interface ContextMarks {
  /**
   * Parts the user removed. Tool parts key by `call:<toolCallId>` (stable
   * across continuation rows); every other part keys by `<type>#<partIdx>`
   * (persisted `parts[]` are verbatim, so the index is stable).
   */
  removed?: string[];
  /**
   * Set on a USER message: everything BEFORE this message is behind "the
   * model reads from here" line. One line per conversation — the latest
   * user message carrying the flag wins.
   */
  lineAbove?: boolean;
}

type PartLike = { type?: string; toolCallId?: string };

/** The mark key for a part at `partIdx` of its message. */
export function partMarkKey(part: unknown, partIdx: number): string {
  const p = (part ?? {}) as PartLike;
  const type = typeof p.type === "string" ? p.type : "unknown";
  if (
    (type.startsWith("tool-") || type === "dynamic-tool") &&
    typeof p.toolCallId === "string" &&
    p.toolCallId
  ) {
    return `call:${p.toolCallId}`;
  }
  return `${type}#${partIdx}`;
}

/**
 * Which parts a mark may touch. `data-*` parts (charter, output target,
 * folder context) are composer-level choices with their own controls;
 * `step-start` and source parts carry nothing the model reads.
 */
export function isMarkablePart(part: unknown): boolean {
  const type = (part as PartLike)?.type;
  if (typeof type !== "string") return false;
  if (type.startsWith("data-")) return false;
  if (type === "step-start" || type === "source-url" || type === "source-document") {
    return false;
  }
  return true;
}

/** Tolerant read: rows of any age, absent key ⇒ no marks. */
export function readContextMarks(message: UIMessage | undefined | null): ContextMarks {
  const meta = (message as { metadata?: unknown } | null | undefined)?.metadata;
  if (!meta || typeof meta !== "object") return {};
  const raw = (meta as Record<string, unknown>)[CONTEXT_MARKS_KEY];
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const removed = Array.isArray(r.removed)
    ? r.removed.filter((k): k is string => typeof k === "string" && k.length > 0)
    : undefined;
  return {
    ...(removed && removed.length > 0 ? { removed } : {}),
    ...(r.lineAbove === true ? { lineAbove: true } : {}),
  };
}

/** A new message whose metadata carries `marks` (empty marks drop the key). */
export function withContextMarks(message: UIMessage, marks: ContextMarks): UIMessage {
  const meta = ((message as { metadata?: unknown }).metadata ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...meta };
  const clean: ContextMarks = {
    ...(marks.removed && marks.removed.length > 0 ? { removed: [...marks.removed] } : {}),
    ...(marks.lineAbove ? { lineAbove: true } : {}),
  };
  if (Object.keys(clean).length === 0) delete next[CONTEXT_MARKS_KEY];
  else next[CONTEXT_MARKS_KEY] = clean;
  return { ...message, metadata: next } as UIMessage;
}

/** Merge a mark patch into existing marks (server and client share this). */
export function mergeContextMarks(
  current: ContextMarks,
  patch: { add?: string[]; remove?: string[]; lineAbove?: boolean },
): ContextMarks {
  const removed = new Set(current.removed ?? []);
  for (const k of patch.add ?? []) removed.add(k);
  for (const k of patch.remove ?? []) removed.delete(k);
  const lineAbove = patch.lineAbove === undefined ? current.lineAbove === true : patch.lineAbove;
  return {
    ...(removed.size > 0 ? { removed: [...removed] } : {}),
    ...(lineAbove ? { lineAbove: true } : {}),
  };
}

/** Index of the latest user message — the start of the live tail. */
export function lastUserMessageIndex(messages: UIMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i;
  }
  return -1;
}

/**
 * The line: index of the latest user message flagged `lineAbove`, or null.
 * The flag on the live user message is legal ("forget everything before
 * this ask"); flags on hidden/truncated rows never reach the client.
 */
export function contextLineIndex(messages: UIMessage[]): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && readContextMarks(m).lineAbove) return i;
  }
  return null;
}
