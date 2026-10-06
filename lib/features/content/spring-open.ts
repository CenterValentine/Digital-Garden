/**
 * Spring-loaded rows: during a drag, a collapsed row held under the pointer
 * opens by itself, and closes again once the pointer leaves it.
 *
 * Owner, 2026-10-06: "When a user hovers D+D in the file tree over a collapsed
 * item for a period of short time, it should automatically expand. If a user
 * retracts the item from being over the file tree, the item should recollapse.
 * This behavior should work for multiple nested collapsed content. It
 * shouldn't [close] unless it leaves the displayed bounds of a respective
 * folder."
 *
 * The rules:
 *  - A row opens after the pointer has stayed over its MIDDLE band — the same
 *    band react-arborist reads as "into this row" — for SPRING_OPEN_DELAY_MS.
 *    The top and bottom quarters mean "beside it", so pausing there to drop
 *    between rows never opens anything. Moving to another row restarts the
 *    wait; only rows that show they open (collapsed, with something inside)
 *    qualify, and never a row being dragged.
 *  - A row this drag opened stays open while the pointer is anywhere in its
 *    displayed bounds — its own row or any row shown inside it — so opening
 *    nests: A, then B inside A, then C inside B. Leaving a row's bounds closes
 *    it (and whatever this drag opened inside it); leaving the tree closes all.
 *  - Dropping in the tree keeps what is open (you can see where it landed). A
 *    drag that ends anywhere else — cancelled, or dropped on another surface —
 *    closes everything it opened. Rows that were open before the drag are
 *    never closed.
 *
 * Pure: the hook in FileTree turns DOM drag events into `SpringEvent`s and
 * carries out the effects. `tree:smooth:check` drives it.
 */

/** How long the pointer must rest on a collapsed row before it opens. */
export const SPRING_OPEN_DELAY_MS = 500;

/**
 * Whether a pointer at `y` is in the middle band of a row at `top` of
 * `height` — react-arborist's "into this row" zone (compute-drop: a quarter
 * of the height in from each edge).
 */
export function inMiddleBand(y: number, top: number, height: number): boolean {
  const offset = y - top;
  const pad = height / 4;
  return offset > pad && offset < height - pad;
}

export interface SpringState {
  /** Rows this drag opened, outermost first (each sits inside the ones before it). */
  opened: string[];
  /** The row waiting to open, if the pointer is resting on one. */
  pendingId: string | null;
}

export const SPRING_IDLE: SpringState = Object.freeze({ opened: [], pendingId: null }) as SpringState;

export type SpringEvent =
  /**
   * The pointer moved (or rested) during a drag. `rowId`: the row under it,
   * null when it isn't over a row of the tree. `opensHere`: that row would
   * open and the pointer is in its middle band.
   */
  | { kind: "over"; rowId: string | null; opensHere: boolean }
  /** The wait for `rowId` ran out. */
  | { kind: "elapsed"; rowId: string }
  /** The drag dropped — in the tree or elsewhere. */
  | { kind: "drop"; inTree: boolean }
  /** The drag ended without a drop in the tree (cancelled, or dropped elsewhere). */
  | { kind: "end" };

export interface SpringEffects {
  /** Rows to close, deepest first. */
  close: string[];
  /** A row to open now. */
  open: string | null;
  /** Start waiting on this row (replacing any wait); null = stop waiting; undefined = unchanged. */
  wait?: string | null;
}

const NONE: SpringEffects = Object.freeze({ close: [], open: null }) as SpringEffects;

/** `within(rowId, ancestorId)`: the row is that row, or is shown inside it. */
export type ShownWithin = (rowId: string, ancestorId: string) => boolean;

/** The rows this drag opened that the pointer has left, deepest first. */
export function springRowsLeft(
  opened: readonly string[],
  rowId: string | null,
  within: ShownWithin,
): string[] {
  return opened.filter((id) => rowId === null || !within(rowId, id)).reverse();
}

export function springStep(
  state: SpringState,
  event: SpringEvent,
  within: ShownWithin,
): { state: SpringState; effects: SpringEffects } {
  switch (event.kind) {
    case "over": {
      const close = springRowsLeft(state.opened, event.rowId, within);
      const opened = close.length > 0 ? state.opened.filter((id) => !close.includes(id)) : state.opened;
      const target = event.opensHere ? event.rowId : null;
      if (target === state.pendingId) {
        return close.length > 0
          ? { state: { ...state, opened }, effects: { close, open: null } }
          : { state, effects: NONE };
      }
      return { state: { opened, pendingId: target }, effects: { close, open: null, wait: target } };
    }
    case "elapsed": {
      // A wait that was replaced or cancelled since it started.
      if (event.rowId !== state.pendingId) return { state, effects: NONE };
      return {
        state: { opened: [...state.opened, event.rowId], pendingId: null },
        effects: { close: [], open: event.rowId, wait: null },
      };
    }
    case "drop":
      return {
        state: SPRING_IDLE,
        effects: { close: event.inTree ? [] : [...state.opened].reverse(), open: null, wait: null },
      };
    case "end":
      return { state: SPRING_IDLE, effects: { close: [...state.opened].reverse(), open: null, wait: null } };
  }
}
