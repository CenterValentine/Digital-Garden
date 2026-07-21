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
import type { PanelPageContext } from "@/lib/domain/browser-extension/page-context";

interface PanelPageContextState {
  /** Latest captured context, or null when nothing is attached. */
  pageContext: PanelPageContext | null;
  /** Whether the user wants it included in chat turns. */
  attached: boolean;
  setPageContext: (ctx: PanelPageContext | null) => void;
  setAttached: (attached: boolean) => void;
  clear: () => void;
}

export const usePanelPageContextStore = create<PanelPageContextState>((set) => ({
  pageContext: null,
  attached: false,
  setPageContext: (pageContext) => set({ pageContext }),
  setAttached: (attached) => set({ attached }),
  clear: () => set({ pageContext: null, attached: false }),
}));

/** Non-hook read for the engine's body resolver (runs outside React render). */
export function getAttachedPageContext(): PanelPageContext | null {
  const { pageContext, attached } = usePanelPageContextStore.getState();
  return attached ? pageContext : null;
}
