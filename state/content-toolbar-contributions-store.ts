import type { ReactNode } from "react";
import { create } from "zustand";

/**
 * Tools a content viewer adds to the shared content toolbar for the item it
 * shows — so a viewer never grows a second toolbar of its own (the reader's
 * contents / details / bookmark / display / status controls are the worked
 * example). Keyed by content id; the viewer registers on mount and clears on
 * unmount.
 */
export interface ContentToolbarContribution {
  id: string;
  /** Tooltip / accessible label for an icon button. */
  title: string;
  icon?: ReactNode;
  onClick?: () => void;
  /** A custom control (e.g. a select) instead of an icon button. */
  render?: () => ReactNode;
}

interface ContentToolbarContributionsState {
  byContentId: Record<string, ContentToolbarContribution[]>;
  setContributions: (contentId: string, items: ContentToolbarContribution[] | null) => void;
}

export const useContentToolbarContributions = create<ContentToolbarContributionsState>()((set) => ({
  byContentId: {},
  setContributions: (contentId, items) =>
    set((state) => {
      const next = { ...state.byContentId };
      if (items?.length) next[contentId] = items;
      else delete next[contentId];
      return { byContentId: next };
    }),
}));

const NONE: ContentToolbarContribution[] = [];

export function useContentToolbarItems(contentId: string | null): ContentToolbarContribution[] {
  return useContentToolbarContributions((state) => (contentId ? state.byContentId[contentId] ?? NONE : NONE));
}
