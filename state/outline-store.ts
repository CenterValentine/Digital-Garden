/**
 * Outline Store
 *
 * Manages the current document's outline (table of contents).
 * Supports both note outlines (heading hierarchy) and chat outlines (message list).
 *
 * Updated by MainPanelContent (notes) or ChatViewer (chats).
 * Consumed by RightSidebarContent for the Outline panel.
 */

import { create } from "zustand";
import type { OutlineHeading } from "@/lib/domain/content/outline-extractor";
import type {
  ChatOutlineEntry,
  ChatOutlineGranularity,
} from "@/lib/domain/ai/chat-outline";

interface OutlineStore {
  // ─── Note outline ───
  /** Current outline headings (for notes) */
  outline: OutlineHeading[];
  /** Currently active heading ID (for highlight in outline panel) */
  activeHeadingId: string | null;
  /** Update the note outline */
  setOutline: (outline: OutlineHeading[]) => void;
  /** Set the active heading (clicked or scrolled-to) */
  setActiveHeadingId: (id: string | null) => void;

  // ─── Chat outline (Sprint 41) ───
  /** Current chat outline entries */
  chatOutline: ChatOutlineEntry[];
  /** Active chat outline entry ID */
  activeChatEntryId: string | null;
  /** Granularity toggle: "compact" or "expanded" */
  chatOutlineGranularity: ChatOutlineGranularity;
  /** Update the chat outline */
  setChatOutline: (entries: ChatOutlineEntry[]) => void;
  /** Set active chat outline entry */
  setActiveChatEntryId: (id: string | null) => void;
  /** Toggle granularity between compact and expanded */
  toggleChatOutlineGranularity: () => void;
  /** Set granularity directly */
  setChatOutlineGranularity: (g: ChatOutlineGranularity) => void;

  // ─── Shared ───
  /** Clear all outline state (when no content selected) */
  clearOutline: () => void;
}

export const useOutlineStore = create<OutlineStore>((set) => ({
  // Note outline
  outline: [],
  activeHeadingId: null,
  setOutline: (outline) => set({ outline }),
  setActiveHeadingId: (activeHeadingId) => set({ activeHeadingId }),

  // Chat outline
  chatOutline: [],
  activeChatEntryId: null,
  chatOutlineGranularity: "compact",
  setChatOutline: (chatOutline) => set({ chatOutline }),
  setActiveChatEntryId: (activeChatEntryId) => set({ activeChatEntryId }),
  toggleChatOutlineGranularity: () =>
    set((s) => ({
      chatOutlineGranularity:
        s.chatOutlineGranularity === "compact" ? "expanded" : "compact",
    })),
  setChatOutlineGranularity: (chatOutlineGranularity) =>
    set({ chatOutlineGranularity }),

  // Clear all
  clearOutline: () =>
    set({
      outline: [],
      activeHeadingId: null,
      chatOutline: [],
      activeChatEntryId: null,
    }),
}));
