/**
 * MultiConversationSidebar — Session 4a.
 *
 * Replaces the bare `ChatPanel` mount inside `RightSidebarContent`.
 * Manages the tab strip + the active conversation, delegating actual
 * message rendering to `ChatPanel`.
 *
 * Modes:
 *   - No conversations associated yet → transient `ChatPanel` (existing
 *     behavior). Picker + "New" affordances still visible at the top.
 *   - One or more associated → tab strip across the top, ChatPanel
 *     bound to the active conversation id.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChatPanel } from "./ChatPanel";
import {
  SidebarChatTabs,
  unpinConversationFromContent,
  type SidebarTabEntry,
} from "./SidebarChatTabs";
import { ConversationPicker } from "./ConversationPicker";
import { useSettingsStore } from "@/state/settings-store";
import { useAIChatStore } from "@/state/ai-chat-store";
import { useContentStore } from "@/state/content-store";
import { useConversationCacheStore } from "@/state/conversation-cache-store";
import { buildSurfaceBackground } from "@/lib/design/system/ai-providers";
import { useResolvedTheme } from "@/lib/features/theme/useResolvedTheme";
import type { AIProviderId } from "@/lib/domain/ai/types";

interface Props {
  contentId?: string | null;
  /**
   * Monotonic counter that, when it increases, forces creation of a fresh
   * conversation on the current `contentId`. Drives "Ask AI about this page"
   * (the panel resolves the page's content node, points us at it, then bumps
   * this to start a new chat). Ignored until `contentId` is set.
   */
  newChatNonce?: number;
  /**
   * Optional opener to pre-fill (not send) into the newly created conversation
   * when `newChatNonce` fires. Seeded as the conversation's composer draft.
   */
  newChatPrefill?: string;
}

export function MultiConversationSidebar({
  contentId,
  newChatNonce,
  newChatPrefill,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  // A transient chat is rebound to its newly-created conversation before the
  // tab cache necessarily contains that id. Preserve that activation through
  // any older in-flight tab response; otherwise the validity effect below can
  // switch the panel back to an existing chat and send the queued first turn
  // with that chat's output target.
  const pendingPromotionIdRef = useRef<string | null>(null);
  // Active provider drives the active-tab bg so it merges with the
  // chat surface below. Reads from the shared session store first
  // (which `useModelSelection` writes to on every picker change), and
  // falls back to the user's default settings provider before
  // anything has been picked this session.
  const sessionProviderId = useAIChatStore((s) => s.activeProviderId);
  const defaultProviderId = useSettingsStore((s) => s.ai?.providerId);
  const defaultModelId = useSettingsStore((s) => s.ai?.modelId);
  const setActiveModelSelection = useAIChatStore(
    (s) => s.setActiveModelSelection,
  );
  const activeProviderId = sessionProviderId ?? defaultProviderId;
  const resolvedTheme = useResolvedTheme();

  // ─── Cache store: tabs come from the shared store, kept in sync via
  // the SSE event bus (no more prop-drilled `onTitleChanged` reloads). ──
  const cachedTabs = useConversationCacheStore((s) =>
    contentId ? s.tabsByContent[contentId] : undefined,
  );
  const loadTabsCache = useConversationCacheStore((s) => s.loadTabs);
  const connect = useConversationCacheStore((s) => s.connect);
  const disconnect = useConversationCacheStore((s) => s.disconnect);

  // Open the shared SSE stream while mounted (refcounted in the store).
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Initial / content-switch load.
  useEffect(() => {
    pendingPromotionIdRef.current = null;
    if (contentId) void loadTabsCache(contentId);
  }, [contentId, loadTabsCache]);

  // ─── Recursion guard ───
  // If the open content is itself a chat node backed by a Conversation
  // (its full-page ChatViewer is the main panel), that conversation must
  // not appear as its own redundant side tab. Resolve the self-id and
  // filter it out below.
  const [selfConversationId, setSelfConversationId] = useState<string | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    setSelfConversationId(null);
    if (!contentId) return;
    (async () => {
      try {
        const res = await fetch(
          `/api/conversations/by-archived-content?contentId=${encodeURIComponent(contentId)}`,
          { credentials: "include" },
        );
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (!cancelled) {
          setSelfConversationId(body?.data?.conversationId ?? null);
        }
      } catch {
        /* best-effort — no guard applied on failure */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  // Derived tab list (recursion-guarded). CachedTab is a structural
  // superset of SidebarTabEntry, so this maps cleanly.
  const tabs = useMemo<SidebarTabEntry[]>(() => {
    const list = cachedTabs ?? [];
    const filtered = selfConversationId
      ? list.filter((t) => t.conversationId !== selfConversationId)
      : list;
    return filtered.map((t) => ({
      conversationId: t.conversationId,
      title: t.title,
      source: t.source,
      lastProviderId: t.lastProviderId,
      lastModelId: t.lastModelId,
    }));
  }, [cachedTabs, selfConversationId]);

  // Keep activeId valid as the tab list changes (load, delete, unpin).
  useEffect(() => {
    const pendingPromotionId = pendingPromotionIdRef.current;
    setActiveId((prev) => {
      if (prev && prev === pendingPromotionId) return prev;
      if (prev && tabs.some((t) => t.conversationId === prev)) return prev;
      return tabs[0]?.conversationId ?? null;
    });
  }, [tabs]);

  // Force-refresh helper for the acting surface (mutations below). SSE
  // keeps OTHER surfaces in sync; this gives the acting one immediacy.
  const reloadTabs = useCallback(() => {
    if (contentId) return loadTabsCache(contentId, true);
    return Promise.resolve([]);
  }, [contentId, loadTabsCache]);

  // Tab-activation seeding: when activeId transitions, push the tab's
  // preloaded last provider/model into the shared session store so the
  // surface gradient and active-tab brand color paint correctly BEFORE
  // ChatPanel mounts and fetches the conversation. ChatPanel's own
  // load effect confirms with API data afterwards; in steady state
  // both write the same value, so there's no flicker.
  //
  // The ref gate ensures we only seed on actual transitions — a user's
  // explicit picker change (which also updates the session) should NOT
  // be reverted just because `tabs` refreshed.
  const seededForRef = useRef<string | null>(null);

  const seedSessionForTab = useCallback(
    (id: string, source: SidebarTabEntry[]) => {
      const tab = source.find((t) => t.conversationId === id);
      if (!tab) return false;
      if (tab.lastProviderId && tab.lastModelId) {
        setActiveModelSelection(tab.lastProviderId, tab.lastModelId);
      } else if (defaultProviderId && defaultModelId) {
        // Empty conversation — fall back to the user's settings default.
        setActiveModelSelection(defaultProviderId, defaultModelId);
      }
      seededForRef.current = id;
      return true;
    },
    [setActiveModelSelection, defaultProviderId, defaultModelId],
  );

  // Backstop for the auto-activation case (loadTabs picks the first
  // tab without going through `handleActivate`). The inline seed in
  // `handleActivate` covers explicit clicks with zero flash via React
  // batching; this effect catches everything else after one frame.
  useEffect(() => {
    if (!activeId) {
      seededForRef.current = null;
      return;
    }
    if (seededForRef.current === activeId) return;
    if (tabs.length === 0) return;
    seedSessionForTab(activeId, tabs);
  }, [activeId, tabs, seedSessionForTab]);

  // Explicit tab activation — batches `setActiveId` and the session
  // seed into a single React update, so the surface paints in the new
  // tab's color on the FIRST render after the click. No 1-frame flash.
  const handleActivate = useCallback(
    (id: string) => {
      pendingPromotionIdRef.current = null;
      setActiveId(id);
      seedSessionForTab(id, tabs);
    },
    [tabs, seedSessionForTab],
  );

  const handleNew = useCallback(
    async (options?: { prefillDraft?: string }) => {
      if (!contentId) return;
      setCreatingNew(true);
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            snapshotContentNodeIds: [contentId],
          }),
        });
        if (!res.ok) throw new Error("Create failed");
        const body = await res.json();
        const newId: string | undefined = body?.data?.id;
        if (newId) {
          // Seed the composer draft BEFORE activating, so the engine hydrates
          // it as it re-keys to the new conversation. Pre-fill (not send) —
          // used by "Ask AI about this page" for a short opener.
          const prefill = options?.prefillDraft?.trim();
          if (prefill) {
            try {
              window.localStorage.setItem(`dg:chat-draft:conv:${newId}`, prefill);
            } catch {
              // Non-fatal — the composer just opens empty.
            }
          }
          await reloadTabs();
          pendingPromotionIdRef.current = null;
          setActiveId(newId);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Create failed");
      } finally {
        setCreatingNew(false);
      }
    },
    [contentId, reloadTabs],
  );

  // "Ask AI about this page" seam: a bumped nonce forces a fresh conversation
  // on the now-anchored page node. Guarded by a ref so it fires exactly once
  // per bump, and only once `contentId` is present (the panel points us at the
  // page node before bumping, so handleNew snapshots the right node).
  const handledNewChatNonceRef = useRef<number>(0);
  useEffect(() => {
    if (!newChatNonce || newChatNonce === handledNewChatNonceRef.current) return;
    if (!contentId) return;
    handledNewChatNonceRef.current = newChatNonce;
    void handleNew({ prefillDraft: newChatPrefill });
  }, [newChatNonce, contentId, handleNew, newChatPrefill]);

  const handlePick = useCallback(
    (conversationId: string) => {
      setPickerOpen(false);
      void (async () => {
        await reloadTabs();
        pendingPromotionIdRef.current = null;
        setActiveId(conversationId);
      })();
    },
    [reloadTabs],
  );

  const handleUnpin = useCallback(
    async (conversationId: string) => {
      if (!contentId) return;
      // Orphan-unpin safety only applies to reference-only chats — i.e.,
      // conversations that have no chat ContentNode anchor of their own.
      // If `archivedToContentNodeId` is set, the chat lives in the file
      // tree as its own surface (the cascade keeps that node alive while
      // the conversation is alive), so unpinning here just drops the
      // association — the chat stays reachable via the file tree.
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversationId)}`,
          { credentials: "include" },
        );
        if (res.ok) {
          const body = await res.json();
          const data = body?.data ?? {};
          const hasAnchor = Boolean(data.archivedToContentNodeId);
          const total = (data.associations ?? []).length as number;
          if (!hasAnchor && total <= 1) {
            toast.message("This is the chat's only pin", {
              description:
                "Use the trash icon in the chat header to delete it entirely, or leave it pinned.",
            });
            return;
          }
        }
      } catch {
        /* fall through and attempt — best-effort orphan check */
      }
      const ok = await unpinConversationFromContent(conversationId, contentId);
      if (!ok) return;
      if (pendingPromotionIdRef.current === conversationId) {
        pendingPromotionIdRef.current = null;
      }
      toast.success("Unpinned from this content");
      await reloadTabs();
    },
    [contentId, reloadTabs],
  );

  const handleRename = useCallback(
    async (conversationId: string, newTitle: string) => {
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversationId)}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: newTitle }),
          },
        );
        if (!res.ok) throw new Error("Rename failed");
        // The PATCH publishes `conversation.updated` → the cache store
        // patches the title in place across surfaces. Force-refresh too
        // for the acting surface's immediacy.
        await reloadTabs();
        // If this conversation is archive-linked to a chat ContentNode,
        // the server also renamed that node. Notify the file tree +
        // workspace tabs (both ContentNode-driven) via the shared
        // `content-updated` event so they update without a refetch.
        const body = await res.json().catch(() => null);
        const archivedId: string | null =
          body?.data?.archivedToContentNodeId ?? null;
        if (archivedId) {
          // Tree node title (LeftSidebarContent listens) — and the
          // selected-tab title (MainPanelContent listens).
          window.dispatchEvent(
            new CustomEvent("content-updated", {
              detail: { contentId: archivedId, updates: { title: newTitle } },
            }),
          );
          // Also patch the workspace tab directly: the event handler only
          // updates the tab when the renamed node is the *selected* one,
          // but it may be an open-but-unselected tab.
          useContentStore.getState().updateContentTab(archivedId, {
            title: newTitle,
          });
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Rename failed");
      }
    },
    [reloadTabs],
  );

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversationId)}`,
          { method: "DELETE", credentials: "include" },
        );
        if (!res.ok) throw new Error("Delete failed");
        toast.success("Chat deleted");
        if (activeId === conversationId) {
          pendingPromotionIdRef.current = null;
          setActiveId(null);
        }
        await reloadTabs();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    },
    [activeId, reloadTabs],
  );

  // The provider's surface gradient lives on THIS wrapper so the tab
  // strip and the chat content share one continuous painted surface.
  // ChatPanel itself paints transparent on its root, and the active
  // tab paints transparent inside its border — the wrapper's gradient
  // shows through both, so the active tab feels like a notch cut into
  // the tab strip exposing the chat surface below.
  const surfaceBackground = buildSurfaceBackground(
    activeProviderId ?? null,
    [(activeProviderId ?? "anthropic") as AIProviderId],
    resolvedTheme,
  );

  // Tabs not yet known for this content → show a skeleton, NOT the empty
  // "How can I help?" chat. The empty/transient ChatPanel is a terminal state
  // (rendered below once cachedTabs === [] — i.e. we KNOW there are no
  // conversations). Showing it while cachedTabs is still undefined produces the
  // blank-chat flash before history loads. (Side-panel cascade rule: render a
  // loader, not a terminal state, while data is loading.) A force-reload keeps
  // the prior cachedTabs, so this doesn't flash on background refresh.
  if (contentId && cachedTabs === undefined) {
    return (
      <div
        className="flex h-full flex-col"
        style={{ background: surfaceBackground }}
        aria-busy="true"
        aria-label="Loading conversations"
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-3">
          <div className="h-5 w-24 animate-pulse rounded bg-black/10 dark:bg-white/10" />
          <div className="h-5 w-16 animate-pulse rounded bg-black/5 dark:bg-white/5" />
        </div>
        <div className="min-h-0 flex-1 space-y-3 p-4">
          <div className="h-4 w-1/2 animate-pulse rounded bg-black/5 dark:bg-white/5" />
          <div className="ml-auto h-16 w-3/4 animate-pulse rounded-lg bg-black/10 dark:bg-white/10" />
          <div className="h-20 w-4/5 animate-pulse rounded-lg bg-black/5 dark:bg-white/5" />
          <div className="ml-auto h-12 w-2/3 animate-pulse rounded-lg bg-black/10 dark:bg-white/10" />
        </div>
        <div className="h-12 shrink-0 border-t border-black/10 dark:border-white/10 p-2">
          <div className="h-8 w-full animate-pulse rounded-lg bg-black/5 dark:bg-white/5" />
        </div>
      </div>
    );
  }

  // Header: tabs + pick/new. Below: ChatPanel rendering the active
  // conversation (or transient if no active yet).
  return (
    <div
      className="flex h-full flex-col"
      style={{ background: surfaceBackground }}
      // useResolvedTheme has no `window` during SSR and returns "light", so
      // the server paints the light gradient while the client paints dark.
      // The client value is correct and wins on the next render; suppress the
      // unavoidable first-paint attribute diff rather than warn on every mount.
      suppressHydrationWarning
    >
      <div className="relative">
        <SidebarChatTabs
          tabs={tabs.map((t) =>
            t.conversationId === activeId
              ? { ...t, providerId: activeProviderId ?? t.providerId }
              : t,
          )}
          activeConversationId={activeId}
          onActivate={handleActivate}
          onNew={() => void handleNew()}
          onPick={() => setPickerOpen(true)}
          onUnpin={(id) => void handleUnpin(id)}
          onRename={handleRename}
        />
        {pickerOpen && contentId && (
          <ConversationPicker
            contentNodeIds={[contentId]}
            alreadyPinnedIds={tabs.map((t) => t.conversationId)}
            onClose={() => setPickerOpen(false)}
            onPick={handlePick}
          />
        )}
      </div>

      <div className="flex-1 min-h-0">
        {/*
          Stage 2: dropped the `key={activeId ?? "transient"}` remount on
          purpose. With it, the panel would unmount/remount on every
          conversation switch (and on the transient→bound promote), and
          the in-flight first message would be lost across the remount.
          Without it, the ChatPanel rebinds in place — useChat re-keys
          internally on conversationKey change, but the surrounding
          refs (pendingTransientInputRef, etc.) survive so the queued
          first send can fire after the conversationId catches up.
        */}
        <ChatPanel
          contentId={contentId}
          conversationId={activeId}
          onDeleteConversation={handleDeleteConversation}
          onForked={(newId) => {
            void (async () => {
              await reloadTabs();
              pendingPromotionIdRef.current = null;
              setActiveId(newId);
            })();
          }}
          onTransientPromoted={(newId) => {
            // Rebind immediately: the first prompt is already queued against
            // this id. Tab refresh is presentation state and must never gate
            // message delivery (a slow/failed refresh previously stranded the
            // submission in transient mode). Mark the id as pending first so
            // an older initial tab request cannot reject it before the forced
            // refresh observes the newly-created association.
            pendingPromotionIdRef.current = newId;
            setActiveId(newId);
            void reloadTabs();
          }}
        />
      </div>

      {creatingNew && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <div className="rounded-md bg-black/60 px-2.5 py-1 text-xs text-gray-100">
            Creating chat…
          </div>
        </div>
      )}
    </div>
  );
}
