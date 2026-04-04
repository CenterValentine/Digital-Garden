/**
 * Outline Store
 *
 * Stores note/chat outline state per content id so switching tabs restores the
 * correct sidebar state instead of reusing a single global outline snapshot.
 */

import { create } from "zustand";
import type { OutlineHeading } from "@/lib/domain/content/outline-extractor";
import type {
  ChatOutlineEntry,
  ChatOutlineGranularity,
} from "@/lib/domain/ai/chat-outline";

export interface OutlineViewState {
  outline: OutlineHeading[];
  activeHeadingId: string | null;
  chatOutline: ChatOutlineEntry[];
  activeChatEntryId: string | null;
  chatOutlineGranularity: ChatOutlineGranularity;
}

interface OutlineStore {
  byContentId: Record<string, OutlineViewState>;
  getViewState: (contentId?: string | null) => OutlineViewState;
  setOutline: (contentId: string, outline: OutlineHeading[]) => void;
  setActiveHeadingId: (contentId: string, id: string | null) => void;
  setChatOutline: (contentId: string, entries: ChatOutlineEntry[]) => void;
  setActiveChatEntryId: (contentId: string, id: string | null) => void;
  toggleChatOutlineGranularity: (contentId: string) => void;
  setChatOutlineGranularity: (
    contentId: string,
    granularity: ChatOutlineGranularity
  ) => void;
  clearOutline: (contentId?: string | null) => void;
}

const DEFAULT_VIEW_STATE: OutlineViewState = {
  outline: [],
  activeHeadingId: null,
  chatOutline: [],
  activeChatEntryId: null,
  chatOutlineGranularity: "compact",
};

function getStoredViewState(
  byContentId: Record<string, OutlineViewState>,
  contentId?: string | null
) {
  if (!contentId) return DEFAULT_VIEW_STATE;
  return byContentId[contentId] ?? DEFAULT_VIEW_STATE;
}

export const useOutlineStore = create<OutlineStore>((set, get) => ({
  byContentId: {},

  getViewState: (contentId) => getStoredViewState(get().byContentId, contentId),

  setOutline: (contentId, outline) => {
    set((state) => {
      const current = getStoredViewState(state.byContentId, contentId);
      const activeHeadingId = outline.some(
        (heading) => heading.id === current.activeHeadingId
      )
        ? current.activeHeadingId
        : null;

      return {
        byContentId: {
          ...state.byContentId,
          [contentId]: {
            ...current,
            outline,
            activeHeadingId,
          },
        },
      };
    });
  },

  setActiveHeadingId: (contentId, id) => {
    set((state) => ({
      byContentId: {
        ...state.byContentId,
        [contentId]: {
          ...getStoredViewState(state.byContentId, contentId),
          activeHeadingId: id,
        },
      },
    }));
  },

  setChatOutline: (contentId, entries) => {
    set((state) => {
      const current = getStoredViewState(state.byContentId, contentId);
      const activeChatEntryId = entries.some(
        (entry) =>
          entry.id === current.activeChatEntryId ||
          entry.children?.some((child) => child.id === current.activeChatEntryId)
      )
        ? current.activeChatEntryId
        : null;

      return {
        byContentId: {
          ...state.byContentId,
          [contentId]: {
            ...current,
            chatOutline: entries,
            activeChatEntryId,
          },
        },
      };
    });
  },

  setActiveChatEntryId: (contentId, id) => {
    set((state) => ({
      byContentId: {
        ...state.byContentId,
        [contentId]: {
          ...getStoredViewState(state.byContentId, contentId),
          activeChatEntryId: id,
        },
      },
    }));
  },

  toggleChatOutlineGranularity: (contentId) => {
    set((state) => {
      const current = getStoredViewState(state.byContentId, contentId);
      return {
        byContentId: {
          ...state.byContentId,
          [contentId]: {
            ...current,
            chatOutlineGranularity:
              current.chatOutlineGranularity === "compact"
                ? "expanded"
                : "compact",
          },
        },
      };
    });
  },

  setChatOutlineGranularity: (contentId, chatOutlineGranularity) => {
    set((state) => ({
      byContentId: {
        ...state.byContentId,
        [contentId]: {
          ...getStoredViewState(state.byContentId, contentId),
          chatOutlineGranularity,
        },
      },
    }));
  },

  clearOutline: (contentId) => {
    if (!contentId) {
      set({ byContentId: {} });
      return;
    }

    set((state) => {
      const nextState = { ...state.byContentId };
      delete nextState[contentId];
      return { byContentId: nextState };
    });
  },
}));
