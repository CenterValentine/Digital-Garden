/**
 * AI Chat Store
 *
 * Manages chat session state for both the right sidebar panel
 * and the full ChatViewer. No persistence — chat messages are
 * persisted to ChatPayload via the API, not localStorage.
 */

import { create } from "zustand";

export interface AIChatState {
  /** ContentNode ID of the active chat (for ChatViewer) */
  activeContentId: string | null;
  /** ContentNode ID of the content being viewed (sidebar context) */
  sidebarContextContentId: string | null;
  /** Whether the AI is currently streaming a response */
  isStreaming: boolean;
  /** Last error message */
  error: string | null;

  // Actions
  setActiveContentId: (id: string | null) => void;
  setSidebarContext: (contentId: string | null) => void;
  setIsStreaming: (streaming: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useAIChatStore = create<AIChatState>((set) => ({
  activeContentId: null,
  sidebarContextContentId: null,
  isStreaming: false,
  error: null,

  setActiveContentId: (id) => set({ activeContentId: id }),
  setSidebarContext: (contentId) =>
    set({ sidebarContextContentId: contentId }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      activeContentId: null,
      sidebarContextContentId: null,
      isStreaming: false,
      error: null,
    }),
}));
