/**
 * Input Trace Types (Development Only)
 *
 * Shapes for the keystroke → ProseMirror transaction correlation log used to
 * diagnose TipTap formatting quirks. Deliberately free of React, Prisma and
 * TipTap runtime imports so the recorder can run anywhere an editor does and
 * the report can be re-read by tooling.
 */

export type InputTraceEventKind =
  | "key"
  | "beforeinput"
  | "composition"
  | "paste"
  | "transaction";

/**
 * The two mark sets ProseMirror tracks. `stored` is the pending set applied to
 * the next inserted character and is `null` unless something pinned it — it is
 * the usual culprit when formatting "turns itself off".
 */
export interface InputTraceMarkState {
  stored: string[] | null;
  resolved: string[];
}

export interface InputTracePathEntry {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface InputTraceSnapshot {
  from: number;
  to: number;
  empty: boolean;
  /** Ancestor chain from the doc root down to the selection head. */
  path: InputTracePathEntry[];
  marks: InputTraceMarkState;
  parentType: string;
  parentText: string;
  /** Selection class name — TextSelection / NodeSelection / GapCursor. */
  selectionType: string;
}

export interface InputTraceStep {
  /** ProseMirror stepType: "replace", "replaceAround", "addMark", "attr", … */
  stepType: string;
  /** One-line human summary, e.g. `replace 118..118 ← <paragraph>`. */
  summary: string;
  /** Raw `step.toJSON()`, with long slices truncated. */
  raw: Record<string, unknown>;
}

export interface InputTraceTransactionInfo {
  /** Transactions attributed to this event (appendedTransaction adds more). */
  count: number;
  docChanged: boolean;
  selectionSet: boolean;
  storedMarksSet: boolean;
  steps: InputTraceStep[];
  /** Transaction meta keys, with primitive values inlined. */
  meta: string[];
}

export interface InputTraceEvent {
  seq: number;
  /** Milliseconds since recording started. */
  t: number;
  kind: InputTraceEventKind;
  /** Which editor produced it — content id, or a label for standalone mounts. */
  source: string;
  key?: string;
  code?: string;
  mods: string[];
  /** `beforeinput` inputType — the most reliable signal of browser intent. */
  inputType?: string;
  /** Text the browser intended to insert (`beforeinput` data). */
  data?: string;
  isComposing?: boolean;
  clipboard?: { types: string[]; text?: string; html?: string };
  before: InputTraceSnapshot | null;
  after: InputTraceSnapshot | null;
  tx: InputTraceTransactionInfo | null;
  /**
   * Derived diagnostics — dropped marks, node-path changes, keystrokes that
   * produced no transaction. This is the field to read first.
   */
  notes: string[];
}

export interface InputTraceSessionMeta {
  startedAt: string;
  stoppedAt: string | null;
  durationMs: number;
  eventCount: number;
  /** Events evicted because the buffer hit `maxEvents`. */
  droppedCount: number;
  redacted: boolean;
  userAgent: string;
  url: string;
  schemaVersion: string;
  /** Extension names registered on the recorded editor(s). */
  extensions: string[];
}

export interface InputTraceSession {
  meta: InputTraceSessionMeta;
  events: InputTraceEvent[];
}

export interface InputTraceOptions {
  /** Replace document/clipboard text with bullets, keeping structure intact. */
  redactText: boolean;
  maxEvents: number;
}
