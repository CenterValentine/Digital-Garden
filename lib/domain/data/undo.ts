/**
 * Grid undo — the command stack and its safety rules.
 *
 * A grid with no undo reads as broken next to an editor that gets full
 * history free from TipTap. But an undo that is subtly WRONG is worse than
 * none: the user believes they reverted and did not. So the design here is
 * built around two invariants (plan B4):
 *
 *  1. Every inverse carries the value it EXPECTS to find. The server applies
 *     it only if the current value still matches. That is compare-and-swap at
 *     cell granularity, and it makes the collaborative clobber structurally
 *     impossible rather than merely unlikely — with per-cell last-write-wins
 *     (plan D5), a naive inverse would silently overwrite whatever someone
 *     else did in between.
 *
 *  2. Three outcomes, never two: applied / skipped-stale / failed. A silent
 *     no-op is exactly the failure that makes undo untrustworthy, so it is
 *     not a representable state.
 *
 * Only ops THIS client issued this session ever enter the stack — a rule
 * about what goes in is more reliable than a check on the way out.
 *
 * Pure — no I/O. The executor is injected, so this is fully testable.
 */

import { canonicalize } from "./cells";
import type { CellValue, RowData } from "./types";

// ── Operations ───────────────────────────────────────────────────────────

export interface CellEdit {
  rowId: string;
  columnKey: string;
  /** What we wrote — the CAS precondition on undo. `undefined` = key absent. */
  after: CellValue | undefined;
  /** What was there before — what undo restores. */
  before: CellValue | undefined;
}

export type UndoOp =
  /** One or many cell writes. A pasted range is ONE op, never forty. */
  | { kind: "setCells"; edits: CellEdit[]; label: string }
  | { kind: "addRows"; rowIds: string[]; label: string }
  | { kind: "deleteRows"; rowIds: string[]; label: string }
  | { kind: "addColumn"; columnId: string; label: string }
  | { kind: "deleteColumn"; columnId: string; label: string }
  | { kind: "reorderRow"; rowId: string; fromSortKey: string; toSortKey: string; label: string };

export interface UndoEntry {
  op: UndoOp;
  /** Ordering metadata a durable log would need — recorded from day one. */
  clientId: string;
  seq: number;
  at: number;
}

// ── Execution contract ───────────────────────────────────────────────────

export type UndoOutcome =
  | { status: "applied" }
  /** The world moved under us. Never overwrite silently — report and stop. */
  | { status: "skipped-stale"; detail: string }
  | { status: "failed"; detail: string };

/**
 * Applies an inverse against the server. Injected so the stack stays pure.
 *
 * Implementations MUST honour the CAS preconditions carried on the op and
 * return `skipped-stale` — not `applied` — when they do not hold.
 */
export type UndoExecutor = (op: UndoOp) => Promise<UndoOutcome>;

// ── Inversion ────────────────────────────────────────────────────────────

/**
 * The op that undoes `op`.
 *
 * Note the asymmetry between edits and deletes, which is deliberate (plan
 * B4.5): restores are idempotent `deletedAt = null` flips and need no CAS,
 * while cell writes need it. Column delete inverts to a metadata flip
 * precisely because `DataColumn` soft-deletes — that decision paying off.
 */
export function invert(op: UndoOp): UndoOp {
  switch (op.kind) {
    case "setCells":
      return {
        kind: "setCells",
        label: op.label,
        edits: op.edits.map((e) => ({
          rowId: e.rowId,
          columnKey: e.columnKey,
          // Swapped: undo writes the old value, and expects to find the new.
          before: e.after,
          after: e.before,
        })),
      };
    case "addRows":
      return { kind: "deleteRows", rowIds: op.rowIds, label: op.label };
    case "deleteRows":
      return { kind: "addRows", rowIds: op.rowIds, label: op.label };
    case "addColumn":
      return { kind: "deleteColumn", columnId: op.columnId, label: op.label };
    case "deleteColumn":
      return { kind: "addColumn", columnId: op.columnId, label: op.label };
    case "reorderRow":
      return {
        kind: "reorderRow",
        rowId: op.rowId,
        fromSortKey: op.toSortKey,
        toSortKey: op.fromSortKey,
        label: op.label,
      };
  }
}

// ── Building ops from a row diff ─────────────────────────────────────────

/** The edits that turn `before` into `after` — the basis for any cell op. */
export function diffRow(
  rowId: string,
  before: RowData,
  after: RowData
): CellEdit[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const edits: CellEdit[] = [];
  for (const columnKey of keys) {
    const b = before[columnKey];
    const a = after[columnKey];
    if (canonicalize(b) === canonicalize(a)) continue;
    edits.push({ rowId, columnKey, before: b, after: a });
  }
  return edits;
}

// ── The stack ────────────────────────────────────────────────────────────

/** Bounded so a long session cannot grow memory without limit. */
export const UNDO_STACK_LIMIT = 100;

export interface UndoStackState {
  undo: UndoEntry[];
  redo: UndoEntry[];
  seq: number;
}

export function createUndoStack(): UndoStackState {
  return { undo: [], redo: [], seq: 0 };
}

export function pushOp(
  state: UndoStackState,
  op: UndoOp,
  clientId: string,
  at: number
): UndoStackState {
  const entry: UndoEntry = { op, clientId, seq: state.seq + 1, at };
  const undo = [...state.undo, entry].slice(-UNDO_STACK_LIMIT);
  // Any new local edit invalidates redo — the branch it belonged to is gone.
  return { undo, redo: [], seq: state.seq + 1 };
}

/**
 * Drop redo entries touching cells that changed remotely.
 *
 * CAS protects undo, but redo re-applies a FORWARD write, so it needs its own
 * guard: without this, redo silently reasserts a value someone else has since
 * replaced (plan B4.6).
 */
export function invalidateRedoForRemoteChange(
  state: UndoStackState,
  changed: Array<{ rowId: string; columnKey: string }>
): UndoStackState {
  if (state.redo.length === 0 || changed.length === 0) return state;
  const touched = new Set(changed.map((c) => `${c.rowId}:${c.columnKey}`));
  const redo = state.redo.filter((entry) => {
    if (entry.op.kind !== "setCells") return true;
    return !entry.op.edits.some((e) => touched.has(`${e.rowId}:${e.columnKey}`));
  });
  return redo.length === state.redo.length ? state : { ...state, redo };
}

export interface UndoStepResult {
  state: UndoStackState;
  outcome: UndoOutcome | null;
  /** What to tell the user. Null when there was nothing to undo. */
  message: string | null;
}

async function step(
  state: UndoStackState,
  from: "undo" | "redo",
  execute: UndoExecutor
): Promise<UndoStepResult> {
  const source = state[from];
  if (source.length === 0) {
    return { state, outcome: null, message: null };
  }

  const entry = source[source.length - 1];
  const remaining = source.slice(0, -1);
  const opToRun = from === "undo" ? invert(entry.op) : entry.op;

  const outcome = await execute(opToRun);

  if (outcome.status === "failed") {
    // Put it back. A consumed-but-unapplied entry is a lie about state, and
    // the user should be able to retry once the network recovers.
    return {
      state,
      outcome,
      message: `Could not ${from === "undo" ? "undo" : "redo"} ${entry.op.label}: ${outcome.detail}`,
    };
  }

  const moved: UndoEntry = { ...entry, op: entry.op };
  const next: UndoStackState =
    from === "undo"
      ? { ...state, undo: remaining, redo: [...state.redo, moved] }
      : { ...state, redo: remaining, undo: [...state.undo, moved] };

  if (outcome.status === "skipped-stale") {
    // Consume rather than retry: the entry can never apply now, and leaving
    // it would make the next Ctrl+Z hit the same wall.
    return {
      state: next,
      outcome,
      message: `Skipped ${entry.op.label} — ${outcome.detail}`,
    };
  }

  return { state: next, outcome, message: `Undid ${entry.op.label}` };
}

export function undo(
  state: UndoStackState,
  execute: UndoExecutor
): Promise<UndoStepResult> {
  return step(state, "undo", execute);
}

export function redo(
  state: UndoStackState,
  execute: UndoExecutor
): Promise<UndoStepResult> {
  return step(state, "redo", execute);
}

// ── Labels ───────────────────────────────────────────────────────────────

/** Human phrasing for a toast. Plural-aware so "1 rows" never ships. */
export function describeOp(op: UndoOp): string {
  switch (op.kind) {
    case "setCells": {
      const n = op.edits.length;
      const rows = new Set(op.edits.map((e) => e.rowId)).size;
      if (n === 1) return "cell edit";
      return rows > 1 ? `${n} cells across ${rows} rows` : `${n} cells`;
    }
    case "addRows":
      return op.rowIds.length === 1 ? "new row" : `${op.rowIds.length} new rows`;
    case "deleteRows":
      return op.rowIds.length === 1
        ? "deleted row"
        : `${op.rowIds.length} deleted rows`;
    case "addColumn":
      return "new column";
    case "deleteColumn":
      return "deleted column";
    case "reorderRow":
      return "row move";
  }
}
