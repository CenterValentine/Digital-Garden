/**
 * Content-driven right-sidebar panels.
 *
 * The existing `rightSidebarPanel` is keyed to a LEFT-nav view (calendar).
 * An extension that owns a content viewer (the reader) also needs the right
 * sidebar to follow the CONTENT it shows. The viewer claims the sidebar for
 * the content id it renders; RightSidebar then offers the extension's
 * `contentSidebarPanel` as its "extension" tab for that content. Claims are
 * released on unmount, so a disabled extension (no viewer) claims nothing.
 */

import { create } from "zustand";

interface ContentSidebarClaimState {
  /** contentId → extension id that currently renders it. */
  claims: Record<string, string>;
  claim: (contentId: string, extensionId: string) => void;
  release: (contentId: string, extensionId: string) => void;
}

export const useContentSidebarClaims = create<ContentSidebarClaimState>()((set) => ({
  claims: {},
  claim: (contentId, extensionId) =>
    set((state) =>
      state.claims[contentId] === extensionId
        ? state
        : { claims: { ...state.claims, [contentId]: extensionId } }
    ),
  release: (contentId, extensionId) =>
    set((state) => {
      if (state.claims[contentId] !== extensionId) return state;
      const next = { ...state.claims };
      delete next[contentId];
      return { claims: next };
    }),
}));
