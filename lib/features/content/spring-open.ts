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
 *    nests: A, then B inside A, then C inside B.
 *  - It closes when the pointer moves ABOVE it, when the drag leaves the tree,
 *    or when the drag ends. Not when the pointer passes BELOW it: closing it
 *    then pulls every row under the pointer up, so the pointer lands on a
 *    different row than the one it was aiming at (owner report, 2026-10-06 —
 *    leaving a nested folder downward closed it, the rows jumped, and the
 *    pointer landed outside the outer folder, closing that too). Closing a row
 *    above the pointer moves nothing above it.
 *  - Over the tree but not over a row (its padding, the space below the last
 *    row) says nothing about where the pointer is aiming: nothing closes.
 *  - Dropping in the tree keeps open what holds the drop, so you see where it
 *    landed; anything else it opened closes once the drop is done. A drag
 *    that ends anywhere else — cancelled, or dropped on another surface —
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
   * The pointer moved (or rested) during a drag. `inTree`: it is over the
   * tree. `rowId`: the row under it, null when it isn't over a row.
   * `opensHere`: that row would open and the pointer is in its middle band.
   */
  | { kind: "over"; inTree: boolean; rowId: string | null; opensHere: boolean }
  /** The wait for `rowId` ran out. */
  | { kind: "elapsed"; rowId: string }
  /** The drag dropped — in the tree (on `rowId`, if over a row) or elsewhere. */
  | { kind: "drop"; inTree: boolean; rowId: string | null }
  /** The drag ended without a drop in the tree (cancelled, or dropped elsewhere). */
  | { kind: "end" };

export interface SpringEffects {
  /** Rows to close now, deepest first. */
  close: string[];
  /** Rows to close once the drop has been handled (so nothing moves under it), deepest first. */
  closeAfterDrop: string[];
  /** A row to open now. */
  open: string | null;
  /** Start waiting on this row (replacing any wait); null = stop waiting; undefined = unchanged. */
  wait?: string | null;
}

const NONE: SpringEffects = Object.freeze({ close: [], closeAfterDrop: [], open: null }) as SpringEffects;

/**
 * Where a hovered row is relative to a row the drag opened: inside its
 * displayed bounds (that row, or shown inside it), or above or below them.
 */
export type RowPlace = "inside" | "above" | "below";
export type PlaceOf = (rowId: string, openedId: string) => RowPlace;

/** The rows this drag opened that the pointer is now above — safe to close (deepest first). */
export function springRowsToClose(
  opened: readonly string[],
  rowId: string,
  placeOf: PlaceOf,
): string[] {
  return opened.filter((id) => placeOf(rowId, id) === "above").reverse();
}

const all = (state: SpringState) => [...state.opened].reverse();

export function springStep(
  state: SpringState,
  event: SpringEvent,
  placeOf: PlaceOf,
): { state: SpringState; effects: SpringEffects } {
  switch (event.kind) {
    case "over": {
      const close = !event.inTree
        ? all(state)
        : event.rowId === null
          ? []
          : springRowsToClose(state.opened, event.rowId, placeOf);
      const opened = close.length > 0 ? state.opened.filter((id) => !close.includes(id)) : state.opened;
      const target = event.inTree && event.opensHere ? event.rowId : null;
      if (target === state.pendingId) {
        return close.length > 0
          ? { state: { ...state, opened }, effects: { close, closeAfterDrop: [], open: null } }
          : { state, effects: NONE };
      }
      return {
        state: { opened, pendingId: target },
        effects: { close, closeAfterDrop: [], open: null, wait: target },
      };
    }
    case "elapsed": {
      // A wait that was replaced or cancelled since it started.
      if (event.rowId !== state.pendingId) return { state, effects: NONE };
      return {
        state: { opened: [...state.opened, event.rowId], pendingId: null },
        effects: { close: [], closeAfterDrop: [], open: event.rowId, wait: null },
      };
    }
    case "drop": {
      if (!event.inTree) {
        return { state: SPRING_IDLE, effects: { close: all(state), closeAfterDrop: [], open: null, wait: null } };
      }
      // Keep what holds the drop; the rest closes once the drop is handled.
      const dropRow = event.rowId;
      const closeAfterDrop = state.opened
        .filter((id) => dropRow === null || placeOf(dropRow, id) !== "inside")
        .reverse();
      return { state: SPRING_IDLE, effects: { close: [], closeAfterDrop, open: null, wait: null } };
    }
    case "end":
      return { state: SPRING_IDLE, effects: { close: all(state), closeAfterDrop: [], open: null, wait: null } };
  }
}
