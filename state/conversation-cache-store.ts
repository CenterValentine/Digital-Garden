/**
 * Conversation cache store — Session 4b.
 *
 * Single client-side source of truth for conversation *associations*
 * across every chat surface:
 *   - sidebar tab strip (tabs for the open content panel)
 *   - full-page ChatViewer header (reverse-view chips: which content a
 *     conversation is pinned to)
 *   - conversation picker
 *
 * Before this store, each surface fetched independently and refreshed
 * via prop callbacks (`onTitleChanged`, manual `loadTabs()` chains). The
 * store replaces that props-drilling with one cache that:
 *   1. Caches `tabsByContent` and `associationsByConversation`.
 *   2. Subscribes ONCE to the `/api/conversations/events` SSE stream and
 *      reacts to mutations (created / updated / deleted / appended /
 *      association changed) by patching cache slices in place or
 *      refetching the affected ones.
 *   3. Exposes optimistic helpers so the surface that performs a
 *      mutation updates instantly, before the SSE round-trip.
 *
 * Serverless fallback: the SSE bus only delivers same-instance events
 * (see `lib/features/conversations/events.ts`). `refetchAllCached()` runs
 * on window focus to catch mutations that happened on another instance
 * while this tab was backgrounded.
 */

import { create } from "zustand";
import type {
  ConversationEvent,
  ConversationAssociationSourceLiteral,
} from "@/lib/features/conversations/event-types";

export interface CachedTab {
  conversationId: string;
  title: string | null;
  source: ConversationAssociationSourceLiteral;
  lastProviderId: string | null;
  lastModelId: string | null;
  updatedAt: string;
}

export interface AssociationChip {
  contentNodeId: string;
  contentTitle: string | null;
  contentType: string | null;
  contentDeleted: boolean;
  source: ConversationAssociationSourceLiteral;
}

interface ConversationCacheState {
  tabsByContent: Record<string, CachedTab[]>;
  associationsByConversation: Record<string, AssociationChip[]>;
  loadingTabs: Record<string, boolean>;
  loadingAssociations: Record<string, boolean>;

  // Reads (fetch + cache).
  loadTabs: (contentNodeId: string, force?: boolean) => Promise<CachedTab[]>;
  loadAssociations: (
    conversationId: string,
    force?: boolean,
  ) => Promise<AssociationChip[]>;

  // Event reaction (called by the SSE subscriber).
  applyEvent: (event: ConversationEvent) => void;

  // Cross-instance fallback — refetch everything currently cached.
  refetchAllCached: () => void;

  // SSE lifecycle (refcounted; many surfaces, one stream).
  connect: () => void;
  disconnect: () => void;
}

// ─── Fetchers (data layer, self-contained) ──────────────────────────────

async function fetchTabs(contentNodeId: string): Promise<CachedTab[]> {
  const url = `/api/conversations/by-content?ids=${encodeURIComponent(contentNodeId)}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return [];
  const body = await res.json();
  const items: Array<{
    conversationId: string;
    title: string | null;
    updatedAt: string;
    lastProviderId?: string | null;
    lastModelId?: string | null;
    associations: Array<{
      contentNodeId: string;
      source: ConversationAssociationSourceLiteral;
    }>;
  }> = body?.data?.items ?? [];
  return items.map((it) => ({
    conversationId: it.conversationId,
    title: it.title,
    updatedAt: it.updatedAt,
    lastProviderId: it.lastProviderId ?? null,
    lastModelId: it.lastModelId ?? null,
    source:
      it.associations.find((a) => a.contentNodeId === contentNodeId)?.source ??
      "manual",
  }));
}

async function fetchAssociations(
  conversationId: string,
): Promise<AssociationChip[]> {
  const url = `/api/conversations/${encodeURIComponent(conversationId)}/associations`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return [];
  const body = await res.json();
  const items: Array<{
    contentNodeId: string;
    source: ConversationAssociationSourceLiteral;
    contentTitle?: string | null;
    contentType?: string | null;
    contentDeleted?: boolean;
  }> = body?.data?.items ?? [];
  return items.map((it) => ({
    contentNodeId: it.contentNodeId,
    contentTitle: it.contentTitle ?? null,
    contentType: it.contentType ?? null,
    contentDeleted: Boolean(it.contentDeleted),
    source: it.source,
  }));
}

// ─── Module-scope SSE plumbing (shared across all store consumers) ───────
// Kept outside Zustand state because an EventSource isn't serializable
// React state — it's an imperative resource we ref-count.

let eventSource: EventSource | null = null;
let refCount = 0;
let focusHandlerBound = false;

export const useConversationCacheStore = create<ConversationCacheState>(
  (set, get) => ({
    tabsByContent: {},
    associationsByConversation: {},
    loadingTabs: {},
    loadingAssociations: {},

    loadTabs: async (contentNodeId, force = false) => {
      if (!force) {
        const cached = get().tabsByContent[contentNodeId];
        if (cached) return cached;
      }
      set((s) => ({
        loadingTabs: { ...s.loadingTabs, [contentNodeId]: true },
      }));
      const tabs = await fetchTabs(contentNodeId);
      set((s) => ({
        tabsByContent: { ...s.tabsByContent, [contentNodeId]: tabs },
        loadingTabs: { ...s.loadingTabs, [contentNodeId]: false },
      }));
      return tabs;
    },

    loadAssociations: async (conversationId, force = false) => {
      if (!force) {
        const cached = get().associationsByConversation[conversationId];
        if (cached) return cached;
      }
      set((s) => ({
        loadingAssociations: {
          ...s.loadingAssociations,
          [conversationId]: true,
        },
      }));
      const chips = await fetchAssociations(conversationId);
      set((s) => ({
        associationsByConversation: {
          ...s.associationsByConversation,
          [conversationId]: chips,
        },
        loadingAssociations: {
          ...s.loadingAssociations,
          [conversationId]: false,
        },
      }));
      return chips;
    },

    applyEvent: (event) => {
      switch (event.type) {
        case "conversation.created": {
          // Refetch tabs for any affected content we're currently caching.
          for (const cid of event.contentNodeIds) {
            if (get().tabsByContent[cid]) void get().loadTabs(cid, true);
          }
          break;
        }

        case "conversation.updated": {
          // Patch the title in-place across every cached tab list.
          set((s) => {
            const next: Record<string, CachedTab[]> = {};
            for (const [cid, tabs] of Object.entries(s.tabsByContent)) {
              next[cid] = tabs.map((t) =>
                t.conversationId === event.conversationId
                  ? { ...t, title: event.title }
                  : t,
              );
            }
            return { tabsByContent: next };
          });
          break;
        }

        case "conversation.deleted": {
          set((s) => {
            const nextTabs: Record<string, CachedTab[]> = {};
            for (const [cid, tabs] of Object.entries(s.tabsByContent)) {
              nextTabs[cid] = tabs.filter(
                (t) => t.conversationId !== event.conversationId,
              );
            }
            const nextAssoc = { ...s.associationsByConversation };
            delete nextAssoc[event.conversationId];
            return {
              tabsByContent: nextTabs,
              associationsByConversation: nextAssoc,
            };
          });
          break;
        }

        case "message.appended": {
          // Update last-used stamp so tab styling tracks the new turn.
          if (!event.providerId || !event.modelId) break;
          set((s) => {
            const next: Record<string, CachedTab[]> = {};
            for (const [cid, tabs] of Object.entries(s.tabsByContent)) {
              next[cid] = tabs.map((t) =>
                t.conversationId === event.conversationId
                  ? {
                      ...t,
                      lastProviderId: event.providerId,
                      lastModelId: event.modelId,
                    }
                  : t,
              );
            }
            return { tabsByContent: next };
          });
          break;
        }

        case "association.changed": {
          // Structural change — refetch the two affected slices if cached.
          if (get().tabsByContent[event.contentNodeId]) {
            void get().loadTabs(event.contentNodeId, true);
          }
          if (get().associationsByConversation[event.conversationId]) {
            void get().loadAssociations(event.conversationId, true);
          }
          break;
        }
      }
    },

    refetchAllCached: () => {
      const { tabsByContent, associationsByConversation } = get();
      for (const cid of Object.keys(tabsByContent)) {
        void get().loadTabs(cid, true);
      }
      for (const convId of Object.keys(associationsByConversation)) {
        void get().loadAssociations(convId, true);
      }
    },

    connect: () => {
      if (typeof window === "undefined") return;
      refCount += 1;
      if (eventSource) return; // already connected — just bumped refcount

      eventSource = new EventSource("/api/conversations/events", {
        withCredentials: true,
      });
      eventSource.addEventListener("conversation", (e) => {
        try {
          const event = JSON.parse(
            (e as MessageEvent).data,
          ) as ConversationEvent;
          get().applyEvent(event);
        } catch {
          /* malformed frame — ignore */
        }
      });
      // EventSource auto-reconnects on transport errors; no manual retry.

      if (!focusHandlerBound) {
        window.addEventListener("focus", get().refetchAllCached);
        focusHandlerBound = true;
      }
    },

    disconnect: () => {
      refCount = Math.max(0, refCount - 1);
      if (refCount > 0) return; // other surfaces still using the stream
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (focusHandlerBound) {
        window.removeEventListener("focus", get().refetchAllCached);
        focusHandlerBound = false;
      }
    },
  }),
);
