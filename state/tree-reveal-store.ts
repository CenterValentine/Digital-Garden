/**
 * Tree Reveal Store
 *
 * "Show this item in the file tree": one request channel for every surface
 * that wants the tree to open an item's ancestors, scroll it into view and
 * select it — the content toolbar's button, the breadcrumb, and the tree's
 * own follow-the-active-content behaviour.
 *
 * A store rather than a window event because the tree may not be mounted
 * when the request is made (sidebar collapsed, another left-panel view
 * showing, tree data still loading, the item not yet in the fetched tree).
 * The request stays pending until a mounted tree that HOLDS the item
 * consumes it, and a newer request simply replaces an older one.
 *
 * Not persisted: a reveal is a gesture, not state worth restoring.
 */

import { create } from "zustand";

/** react-window alignment: "auto" = only if out of view, "smart" = minimal
 *  when near / centred when far, "center" = always centre. */
export type TreeRevealAlign = "auto" | "smart" | "center";

export interface TreeRevealRequest {
  id: string;
  align: TreeRevealAlign;
  /** Pulse the row once it is on screen (the explicit "show me" gesture). */
  flash: boolean;
  /**
   * The user asked for it (button, breadcrumb) vs. the tree following the
   * active content on its own. Explicit requests widen a scoped tree to
   * Root when the item is outside the view and say so when it is nowhere;
   * implicit ones wait silently.
   */
  explicit: boolean;
  nonce: number;
}

interface TreeRevealState {
  request: TreeRevealRequest | null;
  /** Row currently pulsing (cleared automatically). */
  highlightId: string | null;
  requestReveal: (
    id: string,
    options?: Partial<Pick<TreeRevealRequest, "align" | "flash" | "explicit">>,
  ) => void;
  /** Clear the request — only if it is still the one identified by `nonce`. */
  consumeReveal: (nonce: number) => void;
  flashNode: (id: string) => void;
}

const FLASH_MS = 1600;
let flashTimer: ReturnType<typeof setTimeout> | null = null;
let nonceCounter = 0;

export const useTreeRevealStore = create<TreeRevealState>()((set, get) => ({
  request: null,
  highlightId: null,
  requestReveal: (id, options) =>
    set({
      request: {
        id,
        align: options?.align ?? "smart",
        flash: options?.flash ?? false,
        explicit: options?.explicit ?? false,
        nonce: ++nonceCounter,
      },
    }),
  consumeReveal: (nonce) => {
    if (get().request?.nonce === nonce) set({ request: null });
  },
  flashNode: (id) => {
    if (flashTimer) clearTimeout(flashTimer);
    set({ highlightId: id });
    flashTimer = setTimeout(() => {
      flashTimer = null;
      if (get().highlightId === id) set({ highlightId: null });
    }, FLASH_MS);
  },
}));
