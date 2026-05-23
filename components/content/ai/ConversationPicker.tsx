/**
 * ConversationPicker — Session 4a.
 *
 * Modal-ish picker triggered by "+ Pin" in the sidebar tab strip. Lists
 * all the user's conversations (most-recent first) with search-by-title.
 * Selecting one creates manual associations from the open content
 * node(s) to that conversation, then activates it as the current tab.
 *
 * Renders as a floating panel positioned below the trigger via fixed
 * positioning + close-on-outside-click. Simpler than full modal
 * machinery; matches the model/make picker pattern.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Loader2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { toast } from "sonner";

interface ConversationListItem {
  id: string;
  title: string | null;
  updatedAt: string;
  /**
   * Source of this entry:
   *   - conversation : first-class Conversation entity (can be pinned)
   *   - archived     : `chat`-type ContentNode saved via the legacy
   *                    "Save conversation" flow. Selecting one navigates
   *                    to its content viewer (not pinnable here).
   */
  source: "conversation" | "archived";
}

interface ConversationPickerProps {
  /** Content node ids to pin the selected conversation to. */
  contentNodeIds: string[];
  /** Conversation ids already associated with the current panel set — used to dim them. */
  alreadyPinnedIds?: string[];
  onClose: () => void;
  /** Called after successful pin with the activated conversation id. */
  onPick: (conversationId: string) => void;
}

export function ConversationPicker({
  contentNodeIds,
  alreadyPinnedIds = [],
  onClose,
  onPick,
}: ConversationPickerProps) {
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Re-fetch when the search query changes so we get server-side
  // matches that aren't in the first page of recent items.
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const q = query.trim();
          // Conversations API supports cursor/limit but no `search` yet —
          // we still send the limit; client filter handles narrowing.
          const convsURL = "/api/conversations?limit=100";
          // Content API uses `type` (not `contentType`) and supports
          // `search` against the title — let the server filter when
          // the user has typed something.
          const contentParams = new URLSearchParams({
            type: "chat",
            limit: "100",
          });
          if (q.length > 0) contentParams.set("search", q);
          const contentURL = `/api/content/content?${contentParams.toString()}`;

          const [convsRes, archivedRes] = await Promise.all([
            fetch(convsURL, { credentials: "include" }),
            fetch(contentURL, { credentials: "include" }),
          ]);
          const convsBody = await convsRes.json().catch(() => null);
          const archivedBody = await archivedRes.json().catch(() => null);

          if (cancelled) return;

          const convs: ConversationListItem[] = (
            convsBody?.data?.items ?? []
          ).map(
            (c: { id: string; title: string | null; updatedAt: string }) => ({
              id: c.id,
              title: c.title,
              updatedAt: c.updatedAt,
              source: "conversation" as const,
            }),
          );

          const archived: ConversationListItem[] = (
            archivedBody?.data?.items ?? []
          ).map(
            (n: {
              id: string;
              title: string;
              updatedAt: string;
              contentType?: string;
            }) => ({
              id: n.id,
              title: n.title,
              updatedAt: n.updatedAt,
              source: "archived" as const,
            }),
          );

          // Merge + dedupe by id (Conversations win in tie)
          const seen = new Set<string>();
          const merged: ConversationListItem[] = [];
          for (const c of [...convs, ...archived]) {
            if (seen.has(c.id)) continue;
            seen.add(c.id);
            merged.push(c);
          }
          merged.sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          );
          setItems(merged);
        } catch (e) {
          if (!cancelled) {
            toast.error(e instanceof Error ? e.message : "Load failed");
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, query.length > 0 ? 200 : 0);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  // Close on outside click / Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      (i.title ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  const alreadySet = useMemo(() => new Set(alreadyPinnedIds), [alreadyPinnedIds]);

  const handlePick = useCallback(
    async (item: ConversationListItem) => {
      // Archived ContentNode chat: promote to a live Conversation
      // server-side (idempotent — re-picks the same archived chat
      // return the same conversation), then activate it as the side tab.
      // This is the route that replaces the previous "open in main
      // panel" behavior the user reported as a bug.
      if (item.source === "archived") {
        setBusyId(item.id);
        try {
          const res = await fetch("/api/conversations", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fromContentNodeId: item.id,
              snapshotContentNodeIds: contentNodeIds,
              title: item.title,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.error ?? "Promotion failed");
          }
          const data = await res.json();
          const newId: string | undefined = data?.data?.id;
          if (newId) {
            toast.success("Chat pinned as live conversation");
            onPick(newId);
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Promotion failed");
        } finally {
          setBusyId(null);
        }
        return;
      }

      if (alreadySet.has(item.id)) {
        onPick(item.id);
        return;
      }
      setBusyId(item.id);
      try {
        // Create a manual association per open content node.
        await Promise.all(
          contentNodeIds.map((cid) =>
            fetch(
              `/api/conversations/${encodeURIComponent(item.id)}/associations`,
              {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contentNodeId: cid }),
              },
            ),
          ),
        );
        toast.success("Chat pinned");
        onPick(item.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Pin failed");
      } finally {
        setBusyId(null);
      }
    },
    [contentNodeIds, alreadySet, onPick],
  );

  return (
    <div
      ref={containerRef}
      className="absolute top-full left-2 right-2 mt-1 rounded-xl border border-white/10 bg-[#1a1a1a] shadow-2xl z-50 overflow-hidden flex flex-col"
      style={{ maxHeight: "60vh", maxWidth: "calc(100% - 1rem)" }}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <Search className="h-3.5 w-3.5 text-gray-500" />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats…"
          className="flex-1 bg-transparent text-xs text-white placeholder-gray-500 focus:outline-none"
        />
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-gray-500">
            {query ? "No chats match that search." : "No chats yet. Start one with “New”."}
          </div>
        ) : (
          <ul>
            {filtered.map((item) => {
              const alreadyPinned =
                item.source === "conversation" && alreadySet.has(item.id);
              const isBusy = busyId === item.id;
              return (
                <li key={`${item.source}:${item.id}`}>
                  <button
                    onClick={() => handlePick(item)}
                    disabled={isBusy}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
                      "hover:bg-white/[0.04]",
                      alreadyPinned && "opacity-50",
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-white truncate">
                        {item.title || "Untitled chat"}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {formatRelative(item.updatedAt)}
                      </div>
                    </div>
                    {alreadyPinned && (
                      <span className="text-[10px] text-gray-500">pinned</span>
                    )}
                    {isBusy && (
                      <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}
