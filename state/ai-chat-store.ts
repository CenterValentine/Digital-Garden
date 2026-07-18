/**
 * AI Chat Store
 *
 * Manages chat session state for both the right sidebar panel
 * and the full ChatViewer. Chat messages are persisted to ChatPayload
 * via the API, not localStorage. The ONLY persisted slice is the user's
 * last EXPLICIT model pick (v3.1 R3 — model-selection stickiness):
 * session state stays ephemeral, but "which model did I choose" survives
 * reloads and seeds new chats.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AIChatState {
  /** ContentNode ID of the active chat (for ChatViewer) */
  activeContentId: string | null;
  /** ContentNode ID of the content being viewed (sidebar context) */
  sidebarContextContentId: string | null;
  /** Whether the AI is currently streaming a response */
  isStreaming: boolean;
  /** Last error message */
  error: string | null;

  /**
   * Active session-scope provider/model selection. Shared between the
   * make/model picker inside ChatPanel and the sidebar tab strip so
   * the tab styling reflects the currently-selected provider in real
   * time. Initialized from the last explicit pick (falling back to
   * `useSettingsStore`) on first use, then updated by
   * `useModelSelection.handleChange`.
   */
  activeProviderId: string | null;
  activeModelId: string | null;

  /**
   * The user's last EXPLICIT pick (v3.1 R3) — written only when the user
   * chooses a model in the picker, never by conversation seeding.
   * Persisted (the only persisted field): seeds blank chats and survives
   * reloads. Stickiness chain: per-conversation stamp > this > settings
   * default. Deleting a connection does NOT rewrite it — an unservable
   * pick surfaces as MODEL_UNAVAILABLE (straight-faced), never a silent
   * flip.
   */
  lastExplicitProviderId: string | null;
  lastExplicitModelId: string | null;

  // Actions
  setActiveContentId: (id: string | null) => void;
  setSidebarContext: (contentId: string | null) => void;
  setIsStreaming: (streaming: boolean) => void;
  setError: (error: string | null) => void;
  /**
   * Update the active selection. Pass `{ explicit: true }` ONLY for
   * user-initiated picks (the picker's handleChange) — those also update
   * the persisted last-explicit-pick. Programmatic seeding (conversation
   * stamps, settings hydration) omits it.
   */
  setActiveModelSelection: (
    providerId: string,
    modelId: string,
    opts?: { explicit?: boolean },
  ) => void;
  reset: () => void;
}

export const useAIChatStore = create<AIChatState>()(
  persist(
    (set) => ({
      activeContentId: null,
      sidebarContextContentId: null,
      isStreaming: false,
      error: null,
      activeProviderId: null,
      activeModelId: null,
      lastExplicitProviderId: null,
      lastExplicitModelId: null,

      setActiveContentId: (id) => set({ activeContentId: id }),
      setSidebarContext: (contentId) =>
        set({ sidebarContextContentId: contentId }),
      setIsStreaming: (streaming) => set({ isStreaming: streaming }),
      setError: (error) => set({ error }),
      setActiveModelSelection: (providerId, modelId, opts) =>
        set({
          activeProviderId: providerId,
          activeModelId: modelId,
          ...(opts?.explicit
            ? {
                lastExplicitProviderId: providerId,
                lastExplicitModelId: modelId,
              }
            : {}),
        }),
      reset: () =>
        set({
          activeContentId: null,
          sidebarContextContentId: null,
          isStreaming: false,
          error: null,
          activeProviderId: null,
          activeModelId: null,
          // lastExplicit* intentionally survives reset — it's the
          // stickiness memory, not session state.
        }),
    }),
    {
      name: "ai-chat-selection",
      version: 1,
      // Persist ONLY the explicit pick — session state stays ephemeral.
      partialize: (state) => ({
        lastExplicitProviderId: state.lastExplicitProviderId,
        lastExplicitModelId: state.lastExplicitModelId,
      }),
    },
  ),
);
