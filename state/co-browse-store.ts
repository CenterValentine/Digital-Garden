/**
 * Co-browse session store (Agentic Browsing Phase 2b, Slice 5d).
 *
 * Tracks whether a co-browse session is ACTIVE and which host it's driving, so the
 * panel can show an in-app indicator + Stop — the reliable, cross-browser "the
 * agent is driving / halt it" affordance (the chrome.debugger banner is subtle and
 * varies by browser, notably dark/easy-to-miss in Vivaldi).
 *
 * The engine flags start (on co_browse_open / navigate) via the non-hook helpers;
 * the session ends on the user's Stop or the extension's out-of-band session-ended
 * broadcast (banner Cancel, tab close), relayed through the panel host.
 */

import { create } from "zustand";

interface CoBrowseState {
  /** A co-browse session is driving a tab right now. */
  active: boolean;
  /** Host of the driven page (for the indicator label), or null. */
  host: string | null;
  /** Epoch ms when the current timed-review wait ends, or null (T1). */
  waitUntil: number | null;
  /** Short label for the current wait (e.g. the item name), or null. */
  waitLabel: string | null;
  start: (host: string | null) => void;
  stop: () => void;
  beginWait: (seconds: number, label: string | null) => void;
  endWait: () => void;
}

export const useCoBrowseStore = create<CoBrowseState>((set) => ({
  active: false,
  host: null,
  waitUntil: null,
  waitLabel: null,
  start: (host) => set({ active: true, host }),
  stop: () => set({ active: false, host: null, waitUntil: null, waitLabel: null }),
  beginWait: (seconds, label) =>
    set({ waitUntil: Date.now() + seconds * 1000, waitLabel: label }),
  endWait: () => set({ waitUntil: null, waitLabel: null }),
}));

/** Non-hook flag (engine runs outside React render). */
export function markCoBrowseActive(host: string | null): void {
  useCoBrowseStore.getState().start(host);
}

export function markCoBrowseInactive(): void {
  useCoBrowseStore.getState().stop();
}

export function beginCoBrowseWait(seconds: number, label: string | null): void {
  useCoBrowseStore.getState().beginWait(seconds, label);
}

export function endCoBrowseWait(): void {
  useCoBrowseStore.getState().endWait();
}
