/**
 * Panel page-context store (BROWSER-REACH B2).
 *
 * The side-panel shell writes the page context the extension captured; the
 * conversation engine reads it into every chat request's body so the model
 * can reason about the page the user is on. A module store rather than a prop
 * chain because the writer (PanelShellClient) and reader (useConversationEngine)
 * sit on opposite sides of MultiConversationSidebar → ChatPanel.
 *
 * Only the panel ever writes here, so outside the panel it stays null and
 * contributes nothing to other chat surfaces.
 */

import { create } from "zustand";
import type {
  PanelPageContext,
  PageContextScope,
} from "@/lib/domain/browser-extension/page-context";

interface PanelPageContextState {
  /** Latest captured context, or null when nothing is attached. */
  pageContext: PanelPageContext | null;
  /** Whether the user wants it included in chat turns. */
  attached: boolean;
  /** A capture is in flight (host → content script round-trip). */
  busy: boolean;
  /** Last capture error, cleared on the next attempt. */
  error: string | null;
  /** Scope of the in-flight or last capture. */
  scope: PageContextScope;
  setPageContext: (ctx: PanelPageContext | null) => void;
  setAttached: (attached: boolean) => void;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  setScope: (scope: PageContextScope) => void;
  clear: () => void;
}

export const usePanelPageContextStore = create<PanelPageContextState>((set) => ({
  pageContext: null,
  attached: false,
  busy: false,
  error: null,
  scope: "full",
  setPageContext: (pageContext) => set({ pageContext }),
  setAttached: (attached) => set({ attached }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
  setScope: (scope) => set({ scope }),
  clear: () => set({ pageContext: null, attached: false, error: null }),
}));

/** Non-hook read for the engine's body resolver (runs outside React render). */
export function getAttachedPageContext(): PanelPageContext | null {
  const { pageContext, attached } = usePanelPageContextStore.getState();
  return attached ? pageContext : null;
}
