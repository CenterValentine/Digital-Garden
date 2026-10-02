import { create } from "zustand";
import { parseLinkAnchor, type LinkAnchor } from "@/lib/domain/content/link-anchor";

/**
 * Hand-off for "open this content AT this spot" (a wiki-link anchor —
 * lib/domain/content/link-anchor.ts). The link click requests it; the viewer
 * that shows the content takes it (once) and jumps there. Keyed by content id
 * so a request for one tab never lands in another.
 */
interface ContentAnchorState {
  pending: Record<string, LinkAnchor>;
  request: (contentId: string, anchor: string) => void;
  /** Read and clear the pending anchor for this content, if any. */
  take: (contentId: string) => LinkAnchor | null;
}

export const useContentAnchorStore = create<ContentAnchorState>()((set, get) => ({
  pending: {},
  request: (contentId, anchor) => {
    const parsed = parseLinkAnchor(anchor);
    if (!parsed) return;
    set((state) => ({ pending: { ...state.pending, [contentId]: parsed } }));
  },
  take: (contentId) => {
    const anchor = get().pending[contentId] ?? null;
    if (anchor) {
      set((state) => {
        const next = { ...state.pending };
        delete next[contentId];
        return { pending: next };
      });
    }
    return anchor;
  },
}));
