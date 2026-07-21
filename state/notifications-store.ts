/**
 * Notifications store — bell badge + inbox list state.
 *
 * Not persisted: the server is the source of truth and the badge poll
 * repopulates within seconds of mount. All mutations are optimistic with
 * rollback; callers surface failures via sonner using the boolean returns.
 */

import { create } from "zustand";
import type {
  NotificationDTO,
  NotificationListFilter,
} from "@/lib/domain/notifications/types";

interface NotificationsStore {
  unreadCount: number;
  latestCreatedAt: string | null;
  items: NotificationDTO[];
  filter: NotificationListFilter;
  isLoading: boolean;
  nextCursor: string | null;
  hasLoaded: boolean;

  applyPoll: (summary: {
    unreadCount: number;
    latestCreatedAt: string | null;
  }) => void;
  loadList: (filter?: NotificationListFilter) => Promise<void>;
  loadMore: () => Promise<void>;
  setRead: (id: string, read: boolean) => Promise<boolean>;
  archive: (id: string) => Promise<boolean>;
  markAllRead: () => Promise<boolean>;
}

async function patchNotification(
  id: string,
  body: { read?: boolean; archived?: boolean },
): Promise<boolean> {
  try {
    const response = await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export const useNotificationsStore = create<NotificationsStore>()(
  (set, get) => ({
    unreadCount: 0,
    latestCreatedAt: null,
    items: [],
    filter: "all",
    isLoading: false,
    nextCursor: null,
    hasLoaded: false,

    applyPoll: (summary) =>
      set({
        unreadCount: summary.unreadCount,
        latestCreatedAt: summary.latestCreatedAt,
      }),

    loadList: async (filter) => {
      const nextFilter = filter ?? get().filter;
      set({ isLoading: true, filter: nextFilter });
      try {
        const response = await fetch(
          `/api/notifications?filter=${nextFilter}&limit=15`,
          { credentials: "include" },
        );
        if (!response.ok) return;
        const json = (await response.json()) as {
          success: boolean;
          data?: { items: NotificationDTO[]; nextCursor: string | null };
        };
        if (json.success && json.data) {
          set({
            items: json.data.items,
            nextCursor: json.data.nextCursor,
            hasLoaded: true,
          });
        }
      } catch {
        // List load failures leave prior items visible; badge poll recovers.
      } finally {
        set({ isLoading: false });
      }
    },

    loadMore: async () => {
      const { nextCursor, filter, items, isLoading } = get();
      if (!nextCursor || isLoading) return;
      set({ isLoading: true });
      try {
        const response = await fetch(
          `/api/notifications?filter=${filter}&limit=15&cursor=${encodeURIComponent(nextCursor)}`,
          { credentials: "include" },
        );
        if (!response.ok) return;
        const json = (await response.json()) as {
          success: boolean;
          data?: { items: NotificationDTO[]; nextCursor: string | null };
        };
        if (json.success && json.data) {
          set({
            items: [...items, ...json.data.items],
            nextCursor: json.data.nextCursor,
          });
        }
      } catch {
        // Keep the current page on failure.
      } finally {
        set({ isLoading: false });
      }
    },

    setRead: async (id, read) => {
      const before = get().items;
      const target = before.find((item) => item.id === id);
      if (!target) return false;
      const wasUnread = target.readAt === null;

      set((state) => ({
        items: state.items.map((item) =>
          item.id === id
            ? { ...item, readAt: read ? new Date().toISOString() : null }
            : item,
        ),
        unreadCount: Math.max(
          0,
          state.unreadCount + (read && wasUnread ? -1 : !read && !wasUnread ? 1 : 0),
        ),
      }));

      const ok = await patchNotification(id, { read });
      if (!ok) {
        set((state) => ({
          items: state.items.map((item) => (item.id === id ? target : item)),
          unreadCount: Math.max(
            0,
            state.unreadCount + (read && wasUnread ? 1 : !read && !wasUnread ? -1 : 0),
          ),
        }));
      }
      return ok;
    },

    archive: async (id) => {
      const before = get().items;
      const target = before.find((item) => item.id === id);
      if (!target) return false;
      const wasUnread = target.readAt === null;

      set((state) => ({
        items: state.items.filter((item) => item.id !== id),
        unreadCount: Math.max(0, state.unreadCount - (wasUnread ? 1 : 0)),
      }));

      const ok = await patchNotification(id, { archived: true });
      if (!ok) {
        set({
          items: before,
          unreadCount: get().unreadCount + (wasUnread ? 1 : 0),
        });
      }
      return ok;
    },

    markAllRead: async () => {
      const before = get().items;
      const beforeCount = get().unreadCount;
      const now = new Date().toISOString();
      set((state) => ({
        items: state.items.map((item) =>
          item.readAt === null ? { ...item, readAt: now } : item,
        ),
        unreadCount: 0,
      }));
      try {
        const response = await fetch("/api/notifications/mark-all-read", {
          method: "POST",
          credentials: "include",
        });
        if (!response.ok) throw new Error("failed");
        return true;
      } catch {
        set({ items: before, unreadCount: beforeCount });
        return false;
      }
    },
  }),
);
