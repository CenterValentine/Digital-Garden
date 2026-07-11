/**
 * Inbox View Store
 *
 * Drives the in-workspace Inbox surface (left rail view "inbox"): which
 * sub-tab is active, the selected DM thread, and the notification-
 * preferences sub-view. Kept separate from content-store selection (which
 * drives the editor) so the inbox never touches document state.
 *
 * `openInbox` also flips the left-panel `activeView` to "inbox" so a single
 * call from the bell popover or a notification click-through both activates
 * the surface and jumps to the right tab/thread. Callers still handle any
 * route navigation (e.g. router.push("/content")) since stores can't route.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { useLeftPanelViewStore } from "./left-panel-view-store";

export const INBOX_VIEW = "inbox";

export type InboxTab = "notifications" | "messages" | "connections";

interface InboxViewState {
  tab: InboxTab;
  threadId: string | null;
  showPreferences: boolean;
  setTab: (tab: InboxTab) => void;
  openThread: (threadId: string) => void;
  closeThread: () => void;
  openPreferences: () => void;
  closePreferences: () => void;
  /** Activate the inbox view and optionally jump to a tab/thread. */
  openInbox: (tab?: InboxTab, threadId?: string | null) => void;
}

export const useInboxViewStore = create<InboxViewState>()(
  persist(
    (set) => ({
      tab: "notifications",
      threadId: null,
      showPreferences: false,
      setTab: (tab) => set({ tab, showPreferences: false }),
      openThread: (threadId) =>
        set({ tab: "messages", threadId, showPreferences: false }),
      closeThread: () => set({ threadId: null }),
      openPreferences: () => set({ showPreferences: true }),
      closePreferences: () => set({ showPreferences: false }),
      openInbox: (tab, threadId) => {
        useLeftPanelViewStore.getState().setActiveView(INBOX_VIEW);
        set((state) => ({
          tab: tab ?? state.tab,
          threadId: threadId !== undefined ? threadId : state.threadId,
          showPreferences: false,
        }));
      },
    }),
    {
      name: "inbox-view",
      version: 1,
      // Only remember the last tab; thread selection + prefs view are ephemeral.
      partialize: (state) => ({ tab: state.tab }),
    },
  ),
);
