import { create } from "zustand";

/**
 * Full-screen content: the main panel (content toolbar + viewer) fills the
 * window, and the browser goes full screen where it allows it. Toggled from
 * the content toolbar, so every content type gets it; viewers read `active`
 * to adapt (the reader shows its right-sidebar views as a drawer, since the
 * sidebar is out of view).
 */
interface ContentFullscreenState {
  active: boolean;
  /** The content shown full screen (a pane showing anything else stays put). */
  contentId: string | null;
  /** We put the browser into full screen (so leaving ours leaves it too). */
  enteredBrowser: boolean;
  enter: (contentId: string) => void;
  exit: () => void;
}

export const useContentFullscreenStore = create<ContentFullscreenState>()((set, get) => ({
  active: false,
  contentId: null,
  enteredBrowser: false,
  enter: (contentId) => {
    set({ active: true, contentId });
    const root = document.documentElement;
    if (root.requestFullscreen && !document.fullscreenElement) {
      root
        .requestFullscreen()
        .then(() => set({ enteredBrowser: true }))
        // Not allowed (iOS Safari, iframes): the in-app full-window view still works.
        .catch(() => undefined);
    }
  },
  exit: () => {
    const { enteredBrowser } = get();
    set({ active: false, contentId: null, enteredBrowser: false });
    if (enteredBrowser && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  },
}));
