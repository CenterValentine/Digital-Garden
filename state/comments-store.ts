/**
 * Comments store — the client's copy of each note's threads plus the view
 * state the editor draws over the `comment` marks (active / hovered thread,
 * show-resolved) and the composer hand-off between the chord, the context
 * menu and the toolbelt.
 *
 * Not persisted: threads are fetched per note; the editor's marks are the
 * source of truth for WHERE a thread is, the server for WHAT it says. A mark
 * arriving through Y.js with an unknown id is the "new thread" signal (the
 * decoration plugin calls `load` quietly); replies and resolves are polled by
 * the Comments tab while it is open. Plan: COMMENTS-ANNOTATIONS-PLAN.md §7.
 */

import { create } from "zustand";
import type { Editor } from "@tiptap/core";
import { commentsApi } from "@/lib/domain/comments/client";
import type { CommentThreadDto, CreateThreadInput } from "@/lib/domain/comments/types";

interface CommentsState {
  threadsByContentId: Record<string, CommentThreadDto[]>;
  /** Set once a note's threads were fetched (even if none); unset = unknown. */
  loadedAt: Record<string, number>;
  /** The thread open in a pinned card or selected in the tab (the active ring). */
  activeThreadId: string | null;
  showResolved: boolean;
  /** A request to open a thread in place; the editor's hover plugin answers it. */
  openRequest: { threadId: string; nonce: number } | null;
  /** The editor whose selection the composer is for (the toolbelt hosts it). */
  composerEditor: Editor | null;
  composerNonce: number;

  load: (contentId: string, options?: { quiet?: boolean }) => Promise<void>;
  create: (contentId: string, input: CreateThreadInput) => Promise<CommentThreadDto>;
  reply: (contentId: string, threadId: string, body: string, mentions?: string[]) => Promise<void>;
  setResolved: (contentId: string, threadId: string, resolved: boolean) => Promise<void>;
  removeThread: (contentId: string, threadId: string) => Promise<void>;
  editComment: (contentId: string, commentId: string, body: string) => Promise<void>;
  deleteComment: (contentId: string, threadId: string, commentId: string) => Promise<{ threadDeleted: boolean }>;

  setActiveThread: (threadId: string | null) => void;
  setShowResolved: (show: boolean) => void;
  requestOpen: (threadId: string) => void;
  openComposer: (editor: Editor) => void;
  closeComposer: () => void;
}

const inflight = new Map<string, Promise<void>>();

function upsert(list: CommentThreadDto[], thread: CommentThreadDto): CommentThreadDto[] {
  const index = list.findIndex((t) => t.id === thread.id);
  if (index === -1) return [...list, thread];
  const next = list.slice();
  next[index] = thread;
  return next;
}

export const useCommentsStore = create<CommentsState>()((set) => ({
  threadsByContentId: {},
  loadedAt: {},
  activeThreadId: null,
  showResolved: false,
  openRequest: null,
  composerEditor: null,
  composerNonce: 0,

  load: (contentId, options) => {
    const running = inflight.get(contentId);
    if (running) return running;
    const promise = commentsApi
      .list(contentId)
      .then((threads) => {
        set((state) => ({
          threadsByContentId: { ...state.threadsByContentId, [contentId]: threads },
          loadedAt: { ...state.loadedAt, [contentId]: Date.now() },
        }));
      })
      .catch((error: unknown) => {
        // A failed fetch never changes what we know; a quiet caller (the
        // decoration plugin) must not surface it.
        if (!options?.quiet) throw error;
      })
      .finally(() => {
        inflight.delete(contentId);
      });
    inflight.set(contentId, promise);
    return promise;
  },

  create: async (contentId, input) => {
    const thread = await commentsApi.create(contentId, input);
    set((state) => ({
      threadsByContentId: {
        ...state.threadsByContentId,
        [contentId]: upsert(state.threadsByContentId[contentId] ?? [], thread),
      },
      loadedAt: { ...state.loadedAt, [contentId]: state.loadedAt[contentId] ?? Date.now() },
    }));
    return thread;
  },

  reply: async (contentId, threadId, body, mentions = []) => {
    const thread = await commentsApi.reply(threadId, body, mentions);
    set((state) => ({
      threadsByContentId: {
        ...state.threadsByContentId,
        [contentId]: upsert(state.threadsByContentId[contentId] ?? [], thread),
      },
    }));
  },

  setResolved: async (contentId, threadId, resolved) => {
    // Optimistic: the decoration quiets at once; the server's row replaces it.
    const stamp = resolved ? new Date().toISOString() : null;
    set((state) => ({
      threadsByContentId: {
        ...state.threadsByContentId,
        [contentId]: (state.threadsByContentId[contentId] ?? []).map((t) =>
          t.id === threadId ? { ...t, resolvedAt: stamp } : t,
        ),
      },
    }));
    try {
      const thread = await commentsApi.setResolved(threadId, resolved);
      set((state) => ({
        threadsByContentId: {
          ...state.threadsByContentId,
          [contentId]: upsert(state.threadsByContentId[contentId] ?? [], thread),
        },
      }));
    } catch (error) {
      set((state) => ({
        threadsByContentId: {
          ...state.threadsByContentId,
          [contentId]: (state.threadsByContentId[contentId] ?? []).map((t) =>
            t.id === threadId ? { ...t, resolvedAt: resolved ? null : stamp ?? new Date().toISOString() } : t,
          ),
        },
      }));
      throw error;
    }
  },

  removeThread: async (contentId, threadId) => {
    await commentsApi.deleteThread(threadId);
    set((state) => ({
      threadsByContentId: {
        ...state.threadsByContentId,
        [contentId]: (state.threadsByContentId[contentId] ?? []).filter((t) => t.id !== threadId),
      },
      activeThreadId: state.activeThreadId === threadId ? null : state.activeThreadId,
    }));
  },

  editComment: async (contentId, commentId, body) => {
    const thread = await commentsApi.editComment(commentId, body);
    set((state) => ({
      threadsByContentId: {
        ...state.threadsByContentId,
        [contentId]: upsert(state.threadsByContentId[contentId] ?? [], thread),
      },
    }));
  },

  deleteComment: async (contentId, threadId, commentId) => {
    const result = await commentsApi.deleteComment(commentId);
    set((state) => {
      const list = state.threadsByContentId[contentId] ?? [];
      return {
        threadsByContentId: {
          ...state.threadsByContentId,
          [contentId]: result.thread ? upsert(list, result.thread) : list.filter((t) => t.id !== threadId),
        },
        activeThreadId: result.threadDeleted && state.activeThreadId === threadId ? null : state.activeThreadId,
      };
    });
    return { threadDeleted: result.threadDeleted };
  },

  setActiveThread: (threadId) => set((state) => (state.activeThreadId === threadId ? state : { activeThreadId: threadId })),
  setShowResolved: (show) => set((state) => (state.showResolved === show ? state : { showResolved: show })),
  requestOpen: (threadId) => set((state) => ({ openRequest: { threadId, nonce: (state.openRequest?.nonce ?? 0) + 1 } })),
  openComposer: (editor) => set((state) => ({ composerEditor: editor, composerNonce: state.composerNonce + 1 })),
  closeComposer: () => set((state) => (state.composerEditor ? { composerEditor: null } : state)),
}));

/** The thread with this id, wherever it was loaded. */
export function findThread(
  state: Pick<CommentsState, "threadsByContentId">,
  threadId: string | null | undefined,
): { thread: CommentThreadDto; contentId: string } | null {
  if (!threadId) return null;
  const id = threadId.toLowerCase();
  for (const [contentId, threads] of Object.entries(state.threadsByContentId)) {
    const thread = threads.find((t) => t.id === id);
    if (thread) return { thread, contentId };
  }
  return null;
}

/** Thread ids the server knows for a note — null until the note was fetched. */
export function knownThreadIds(
  state: Pick<CommentsState, "threadsByContentId" | "loadedAt">,
  contentId: string | null | undefined,
): Set<string> | null {
  if (!contentId || !state.loadedAt[contentId]) return null;
  return new Set((state.threadsByContentId[contentId] ?? []).map((t) => t.id));
}

/** Unresolved threads on a note (the rail badge). */
export function useOpenCommentCount(contentId: string | null | undefined): number {
  return useCommentsStore((state) =>
    contentId ? (state.threadsByContentId[contentId] ?? []).filter((t) => !t.resolvedAt).length : 0,
  );
}
