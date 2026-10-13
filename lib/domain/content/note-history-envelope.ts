/**
 * Note history envelopes — the PURE half of the conversion backup.
 *
 * Owner direction (2026-10-12): the lossless markdown round trip is trusted,
 * not proven, so every write that REPLACES or APPENDS to an existing note as
 * the result of a markdown → TipTap conversion first keeps the document it
 * is about to change. `ContentHistory` existed in the schema with no writer;
 * this is its writer's vocabulary. Only serializer-driven writes record —
 * ordinary editor keystrokes are the Y.Doc's business, not history's.
 *
 * No server imports here: the gate loads this file under tsx.
 */

import type { JSONContent } from "@tiptap/core";

/** Where the pre-write document came from. */
export type NoteHistorySource =
  | "write-note-content"
  | "source-view"
  | "content-patch-markdown"
  | "run-ledger";

/**
 * How long a snapshot lives (owner, 2026-10-12: one day). A snapshot is a
 * recovery window, not an archive — long enough to notice a bad round trip
 * the same day, short enough that history never becomes a second copy of
 * the garden. Pruned on each record and by the daily sweep.
 */
export const NOTE_HISTORY_TTL_MS = 24 * 60 * 60 * 1000;

/** Safety cap within the day; a note rewritten 200 times keeps the last 20. */
export const NOTE_HISTORY_KEEP = 20;

/** Snapshots captured before this instant are expired. */
export function historyCutoff(now: Date, ttlMs: number = NOTE_HISTORY_TTL_MS): Date {
  return new Date(now.getTime() - ttlMs);
}

export interface NoteHistoryEnvelope {
  kind: "note-snapshot";
  source: NoteHistorySource;
  /** The edit that prompted the snapshot, when the caller knows it. */
  mode?: "replace" | "append";
  /** Which path performed the write, when the caller knows it. */
  route?: string;
  capturedAt: string;
  tiptapJson: JSONContent;
}

/** A doc with no blocks has nothing to recover — never record one. */
export function isEmptyDoc(json: JSONContent | null | undefined): boolean {
  if (!json || typeof json !== "object") return true;
  const content = (json as { content?: unknown }).content;
  return !Array.isArray(content) || content.length === 0;
}

/**
 * The stored shape, or null when there is nothing worth storing. `capturedAt`
 * is injected so the pure function stays deterministic under test.
 */
export function buildNoteHistoryEnvelope(opts: {
  source: NoteHistorySource;
  tiptapJson: JSONContent | null | undefined;
  mode?: "replace" | "append";
  route?: string;
  capturedAt: Date;
}): NoteHistoryEnvelope | null {
  if (isEmptyDoc(opts.tiptapJson)) return null;
  return {
    kind: "note-snapshot",
    source: opts.source,
    ...(opts.mode ? { mode: opts.mode } : {}),
    ...(opts.route ? { route: opts.route } : {}),
    capturedAt: opts.capturedAt.toISOString(),
    tiptapJson: opts.tiptapJson as JSONContent,
  };
}

/** Versions at or below this are pruned once `latest` has been written. */
export function pruneBelowVersion(latest: number, keep: number = NOTE_HISTORY_KEEP): number {
  return latest - keep;
}
