/**
 * DM store — thread list + per-thread message state for the inbox.
 *
 * Not persisted; the server is the source of truth. Live updates arrive via
 * the NotificationTransport fast poll (appendLiveMessages). Sends are
 * optimistic: a temp-id message renders immediately and is reconciled with
 * the server DTO (or removed on failure).
 */

import { create } from "zustand";
import type {
  DmMessageDTO,
  ThreadListItemDTO,
} from "@/lib/domain/messaging/types";

interface DmStore {
  threads: ThreadListItemDTO[];
  messagesByThread: Record<string, DmMessageDTO[]>;
  nextCursorByThread: Record<string, string | null>;
  activeThreadId: string | null;
  isLoadingThreads: boolean;
  isLoadingMessages: boolean;

  loadThreads: () => Promise<void>;
  openThread: (threadId: string) => Promise<void>;
  closeThread: () => void;
  loadOlderMessages: (threadId: string) => Promise<void>;
  appendLiveMessages: (threadId: string, messages: DmMessageDTO[]) => void;
  sendMessage: (
    threadId: string,
    body: string,
    senderId?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  deleteMessage: (threadId: string, messageId: string) => Promise<boolean>;
  deleteThread: (threadId: string) => Promise<boolean>;
  startThreadWith: (userId: string) => Promise<string | null>;
}

function mergeMessages(
  existing: DmMessageDTO[],
  incoming: DmMessageDTO[],
): DmMessageDTO[] {
  const byId = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

export const useDmStore = create<DmStore>()((set, get) => ({
  threads: [],
  messagesByThread: {},
  nextCursorByThread: {},
  activeThreadId: null,
  isLoadingThreads: false,
  isLoadingMessages: false,

  loadThreads: async () => {
    set({ isLoadingThreads: true });
    try {
      const response = await fetch("/api/messages/threads", {
        credentials: "include",
      });
      if (!response.ok) return;
      const json = (await response.json()) as {
        success: boolean;
        data?: { threads: ThreadListItemDTO[] };
      };
      if (json.success && json.data) set({ threads: json.data.threads });
    } catch {
      // Thread list failures keep prior state; next open retries.
    } finally {
      set({ isLoadingThreads: false });
    }
  },

  openThread: async (threadId) => {
    set({ activeThreadId: threadId, isLoadingMessages: true });
    try {
      const response = await fetch(`/api/messages/threads/${threadId}`, {
        credentials: "include",
      });
      if (!response.ok) return;
      const json = (await response.json()) as {
        success: boolean;
        data?: { messages: DmMessageDTO[]; nextCursor: string | null };
      };
      if (json.success && json.data) {
        set((state) => ({
          messagesByThread: {
            ...state.messagesByThread,
            [threadId]: json.data ? json.data.messages : [],
          },
          nextCursorByThread: {
            ...state.nextCursorByThread,
            [threadId]: json.data ? json.data.nextCursor : null,
          },
          // Opening a thread clears its unread badge locally; the server
          // cursor is updated by the explicit /read call below.
          threads: state.threads.map((thread) =>
            thread.id === threadId ? { ...thread, unreadCount: 0 } : thread,
          ),
        }));
        void fetch(`/api/messages/threads/${threadId}/read`, {
          method: "POST",
          credentials: "include",
        }).catch(() => undefined);
      }
    } catch {
      // Leave the pane empty; the fast poll will backfill new messages.
    } finally {
      set({ isLoadingMessages: false });
    }
  },

  closeThread: () => {
    const { activeThreadId } = get();
    if (activeThreadId) {
      void fetch(`/api/messages/threads/${activeThreadId}/read`, {
        method: "POST",
        credentials: "include",
      }).catch(() => undefined);
    }
    set({ activeThreadId: null });
  },

  loadOlderMessages: async (threadId) => {
    const cursor = get().nextCursorByThread[threadId];
    if (!cursor) return;
    try {
      const response = await fetch(
        `/api/messages/threads/${threadId}?cursor=${encodeURIComponent(cursor)}`,
        { credentials: "include" },
      );
      if (!response.ok) return;
      const json = (await response.json()) as {
        success: boolean;
        data?: { messages: DmMessageDTO[]; nextCursor: string | null };
      };
      if (json.success && json.data) {
        set((state) => ({
          messagesByThread: {
            ...state.messagesByThread,
            [threadId]: mergeMessages(
              json.data ? json.data.messages : [],
              state.messagesByThread[threadId] ?? [],
            ),
          },
          nextCursorByThread: {
            ...state.nextCursorByThread,
            [threadId]: json.data ? json.data.nextCursor : null,
          },
        }));
      }
    } catch {
      // Pagination failure is retryable by scrolling again.
    }
  },

  appendLiveMessages: (threadId, messages) => {
    set((state) => {
      const merged = mergeMessages(
        state.messagesByThread[threadId] ?? [],
        messages,
      );
      const newest = merged[merged.length - 1];
      return {
        messagesByThread: { ...state.messagesByThread, [threadId]: merged },
        threads: state.threads.map((thread) =>
          thread.id === threadId && newest
            ? {
                ...thread,
                lastMessageAt: newest.createdAt,
                lastMessagePreview: newest.body.slice(0, 140),
              }
            : thread,
        ),
      };
    });
  },

  sendMessage: async (threadId, body, senderId) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tempMessage: DmMessageDTO = {
      id: tempId,
      threadId,
      senderId: senderId ?? null,
      senderUsername: null,
      body,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
    };
    set((state) => ({
      messagesByThread: {
        ...state.messagesByThread,
        [threadId]: [...(state.messagesByThread[threadId] ?? []), tempMessage],
      },
    }));

    try {
      const response = await fetch(
        `/api/messages/threads/${threadId}/messages`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      const json = (await response.json()) as {
        success: boolean;
        data?: DmMessageDTO;
        error?: string;
      };
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "Failed to send");
      }
      const sent = json.data;
      set((state) => ({
        messagesByThread: {
          ...state.messagesByThread,
          [threadId]: mergeMessages(
            (state.messagesByThread[threadId] ?? []).filter(
              (message) => message.id !== tempId,
            ),
            [sent],
          ),
        },
        threads: state.threads.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                lastMessageAt: sent.createdAt,
                lastMessagePreview: sent.body.slice(0, 140),
              }
            : thread,
        ),
      }));
      return { ok: true };
    } catch (error) {
      set((state) => ({
        messagesByThread: {
          ...state.messagesByThread,
          [threadId]: (state.messagesByThread[threadId] ?? []).filter(
            (message) => message.id !== tempId,
          ),
        },
      }));
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to send",
      };
    }
  },

  deleteMessage: async (threadId, messageId) => {
    try {
      const response = await fetch(
        `/api/messages/threads/${threadId}/messages/${messageId}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!response.ok) return false;
      set((state) => ({
        messagesByThread: {
          ...state.messagesByThread,
          [threadId]: (state.messagesByThread[threadId] ?? []).map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  body: "",
                  deletedAt: new Date().toISOString(),
                }
              : message,
          ),
        },
      }));
      return true;
    } catch {
      return false;
    }
  },

  deleteThread: async (threadId) => {
    try {
      const response = await fetch(`/api/messages/threads/${threadId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) return false;
      set((state) => ({
        threads: state.threads.filter((thread) => thread.id !== threadId),
        activeThreadId:
          state.activeThreadId === threadId ? null : state.activeThreadId,
      }));
      return true;
    } catch {
      return false;
    }
  },

  startThreadWith: async (userId) => {
    try {
      const response = await fetch("/api/messages/threads", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = (await response.json()) as {
        success: boolean;
        data?: { id: string };
      };
      if (!response.ok || !json.success || !json.data) return null;
      await get().loadThreads();
      return json.data.id;
    } catch {
      return null;
    }
  },
}));
