/**
 * Model-context publication — the bridge between a chat surface and the
 * right sidebar's "What the model sees" tab (CONTEXT-WINDOW-EDITOR-PLAN §7).
 *
 * Same shape as the chat outline sync: the surface that owns the engine
 * publishes its live messages plus the mark actions under its content id;
 * the sidebar tab reads the publication for the selected content. Nothing
 * here persists — marks persist through the binding's marks ref.
 */

import { create } from "zustand";
import type { UIMessage } from "ai";

export interface ContextMarkActions {
  /** Mark (or unmark) one part of a message by its mark key. */
  togglePart: (messageId: string, key: string, removed: boolean) => void;
  /** Mark (or unmark) every markable part of a user+assistant exchange. */
  dropExchange: (assistantMessageId: string, removed: boolean) => void;
  /** Put "the model reads from here" above a user message, or clear it. */
  setLine: (userMessageId: string | null) => void;
}

export interface ModelContextPublication {
  contentId: string;
  conversationId: string | null;
  messages: UIMessage[];
  /** Executed vendor of the active selection (reasoning rules key off it). */
  vendor: string;
  actions: ContextMarkActions;
}

interface ModelContextState {
  publications: Record<string, ModelContextPublication>;
  publish: (publication: ModelContextPublication) => void;
  clear: (contentId: string) => void;
}

export const useModelContextStore = create<ModelContextState>()((set) => ({
  publications: {},
  publish: (publication) =>
    set((state) => ({
      publications: { ...state.publications, [publication.contentId]: publication },
    })),
  clear: (contentId) =>
    set((state) => {
      if (!(contentId in state.publications)) return state;
      const next = { ...state.publications };
      delete next[contentId];
      return { publications: next };
    }),
}));
