/**
 * Note save coordinator — ONE place per NOTE (not per pane, not per editor)
 * that knows whether a REST save of it is running, what is waiting behind
 * it, and which version of it the server holds as far as this browser
 * knows. Client-side, in-memory, module scope.
 *
 * Why (prod, 2026-10-09): "This note changed elsewhere" fired after nearly
 * every edit with nobody else editing. Saves take 2.5–5.5 s on production
 * and autosave fires ~2.5 s after a pause, so a second save left while the
 * first was running and carried the version stamp (`bodyHash`, sent as
 * `X-Body-Hash`) from BEFORE the first one committed: a 409 against the
 * user's own write. A per-pane fix still failed when the note moved panes
 * mid-save (the old pane's stamp was never advanced, the new pane had its
 * own) or was open in a Note Window too. Owning the queue and the stamp per
 * note makes every editor of that note in this browser agree.
 *
 * The stamp only ever learns from two sources:
 *   - this browser's OWN successful saves (`saved`), and
 *   - FRESH loads from the server (`loaded`), unless a save started or
 *     finished since the load was requested (its result is newer), or one is
 *     running now.
 * A change made by another device never enters it, so that still draws an
 * honest 409. A copy painted from cache (`cached`) sets the stamp only when
 * this browser knows nothing about the note yet.
 *
 * Two browser sessions are out of scope by construction (separate memory):
 * that case is handled by promoting both to live collaboration.
 */

interface NoteSaveState {
  /** Latest version this browser knows the server holds (null = unknown). */
  bodyHash: string | null;
  /**
   * Bumped when a save STARTS and when it FINISHES. A load requested before
   * a save started is stale (the save is newer); so is one requested WHILE a
   * save ran — the server may have answered with the pre-save version, and
   * its reply can land after the save finished.
   */
  generation: number;
  running: boolean;
  /** The ONE save waiting behind the running one — newest wins. */
  pending: (() => Promise<void>) | null;
}

const notes = new Map<string, NoteSaveState>();

function stateOf(contentId: string): NoteSaveState {
  let state = notes.get(contentId);
  if (!state) {
    state = { bodyHash: null, generation: 0, running: false, pending: null };
    notes.set(contentId, state);
  }
  return state;
}

/** The stamp to send as `X-Body-Hash` — read at SEND time, never cached. */
export function noteBodyHash(contentId: string): string | null {
  return notes.get(contentId)?.bodyHash ?? null;
}

/** Capture before requesting a load; pass to `loaded` with its result. */
export function noteSaveGeneration(contentId: string): number {
  return notes.get(contentId)?.generation ?? 0;
}

/** A fresh server load resolved. Ignored if a save began since it was asked. */
export function noteLoaded(
  contentId: string,
  bodyHash: string | null,
  generationAtRequest: number
): void {
  const state = stateOf(contentId);
  if (state.running || state.generation !== generationAtRequest) return;
  state.bodyHash = bodyHash;
}

/** A copy painted from cache: only a first impression, never a rollback. */
export function noteCached(contentId: string, bodyHash: string | null): void {
  const state = stateOf(contentId);
  if (state.bodyHash === null && !state.running) state.bodyHash = bodyHash;
}

/** This browser's save succeeded — the server now holds this version. */
export function noteSaved(contentId: string, bodyHash: string | null | undefined): void {
  if (bodyHash) stateOf(contentId).bodyHash = bodyHash;
}

/** "Keep mine": deliberately base the next save on the server's version. */
export function noteAdoptServerVersion(contentId: string, bodyHash: string): void {
  stateOf(contentId).bodyHash = bodyHash;
}

/**
 * Run a save of this note — at once if none is running, otherwise as THE
 * pending one (replacing any earlier pending save: each save carries the
 * whole note, so only the newest matters). A `keepalive` save (the page is
 * going away) cannot wait and runs at once, outside the queue.
 *
 * The returned promise settles when THIS save ran — or immediately when it
 * was parked (its outcome is reported by the save itself when it runs).
 */
export function runNoteSave(
  contentId: string,
  save: () => Promise<void>,
  options?: { keepalive?: boolean }
): Promise<void> {
  if (options?.keepalive) return save();
  const state = stateOf(contentId);
  if (state.running) {
    state.pending = save;
    return Promise.resolve();
  }
  return start(contentId, state, save);
}

async function start(
  contentId: string,
  state: NoteSaveState,
  save: () => Promise<void>
): Promise<void> {
  state.running = true;
  state.generation += 1;
  try {
    await save();
  } finally {
    state.running = false;
    state.generation += 1;
    const next = state.pending;
    state.pending = null;
    if (next) {
      void start(contentId, state, next).catch(() => {
        // The save reports its own failure (logging, unsaved state).
      });
    }
  }
}

/** Whether a save of this note is running or waiting (UI "saving…"). */
export function noteSaveBusy(contentId: string): boolean {
  const state = notes.get(contentId);
  return Boolean(state && (state.running || state.pending));
}
