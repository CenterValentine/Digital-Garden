/**
 * AssociatedContentChips — Session 4b (reverse view).
 *
 * The mirror image of the sidebar tab strip: where the sidebar shows
 * "which chats are pinned to THIS content," this row — rendered on the
 * full-page ChatViewer header — shows "which content THIS chat is pinned
 * to." One chip per association.
 *
 * Reads from the shared `conversation-cache-store` (not props) so it
 * stays in sync with the sidebar, picker, and any other open surface via
 * the SSE event bus. Clicking a chip navigates to that content; the
 * hover "×" unpins it.
 *
 * Source glyphs match the tab strip: auto associations get a subtle `↪`;
 * snapshot/manual show none. Soft-deleted targets render dimmed and
 * non-navigable (the content is gone, but the pin record explains why a
 * past reference existed).
 */

"use client";

import { useEffect } from "react";
import { FileText, X, CornerDownRight } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { toast } from "sonner";
import { useConversationCacheStore } from "@/state/conversation-cache-store";
import { useContentStore } from "@/state/content-store";

interface Props {
  conversationId: string;
}

export function AssociatedContentChips({ conversationId }: Props) {
  const chips = useConversationCacheStore(
    (s) => s.associationsByConversation[conversationId],
  );
  const loadAssociations = useConversationCacheStore(
    (s) => s.loadAssociations,
  );
  const connect = useConversationCacheStore((s) => s.connect);
  const disconnect = useConversationCacheStore((s) => s.disconnect);

  // Open the shared SSE stream while this surface is mounted (refcounted
  // in the store, so it coexists with the sidebar's own connection).
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  useEffect(() => {
    void loadAssociations(conversationId);
  }, [conversationId, loadAssociations]);

  if (!chips || chips.length === 0) return null;

  const handleOpen = (contentNodeId: string, deleted: boolean) => {
    if (deleted) return;
    useContentStore.getState().setSelectedContentId(contentNodeId);
  };

  const handleUnpin = async (contentNodeId: string) => {
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/associations/${encodeURIComponent(contentNodeId)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) throw new Error("Unpin failed");
      // SSE will refetch, but force it too in case the event is delayed
      // (cross-instance) so the chip disappears immediately.
      void loadAssociations(conversationId, true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unpin failed");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-500 mr-0.5">
        Pinned to
      </span>
      {chips.map((chip) => (
        <div
          key={chip.contentNodeId}
          className={cn(
            "group/chip inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
            chip.contentDeleted
              ? "border-black/10 dark:border-white/10 text-gray-400 dark:text-gray-600 line-through cursor-default"
              : "border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-black/[0.04] dark:hover:bg-white/10 cursor-pointer",
          )}
          onClick={() => handleOpen(chip.contentNodeId, chip.contentDeleted)}
          title={
            chip.contentDeleted
              ? "This content was deleted"
              : `Open ${chip.contentTitle ?? "content"}`
          }
        >
          <FileText className="h-3 w-3 shrink-0 opacity-70" />
          <span className="max-w-[160px] truncate">
            {chip.contentTitle ?? "Untitled"}
          </span>
          {chip.source === "auto" && (
            <CornerDownRight className="h-2.5 w-2.5 shrink-0 opacity-60" />
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleUnpin(chip.contentNodeId);
            }}
            className="opacity-0 group-hover/chip:opacity-100 text-gray-500 hover:text-red-400 transition-opacity"
            title="Unpin from this chat"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
