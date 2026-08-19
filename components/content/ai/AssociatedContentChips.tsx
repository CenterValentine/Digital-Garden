/**
 * AssociatedContentChips — Session 4b (reverse view).
 *
 * The mirror image of the sidebar tab strip: where the sidebar shows
 * "which chats are pinned to THIS content," this row — rendered on the
 * full-page ChatViewer header — shows "which content THIS chat is pinned
 * to."
 *
 * Space budget: this sits in the same header row as the operating-folder
 * and output-target chips, and that row is often only a few hundred px
 * wide (extension side panel, narrow panes). It therefore never wraps:
 *   - one pin  → a single inline chip (click opens, hover × unpins)
 *   - many pins → one `Pinned to N` trigger chip; the full list lives in a
 *                 portaled menu (open / unpin per row)
 *
 * Reads from the shared `conversation-cache-store` (not props) so it
 * stays in sync with the sidebar, picker, and any other open surface via
 * the SSE event bus.
 *
 * Source glyphs match the tab strip: auto associations get a subtle `↪`;
 * snapshot/manual show none. Soft-deleted targets render dimmed and
 * non-navigable (the content is gone, but the pin record explains why a
 * past reference existed).
 */

"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { FileText, X, CornerDownRight, Pin, ChevronDown } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { toast } from "sonner";
import { useAnchoredMenu } from "@/lib/core/use-anchored-menu";
import {
  useConversationCacheStore,
  type AssociationChip,
} from "@/state/conversation-cache-store";
import { useContentStore } from "@/state/content-store";

const MENU_WIDTH = 260;
const MENU_MAX_HEIGHT = 320;

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
  // Destructured on purpose — see the note in ContentPathBreadcrumb: passing
  // a hook-return object's field as `ref=` makes the React Compiler treat
  // the whole object as a ref.
  const {
    open: menuOpen,
    toggle: toggleMenu,
    close: closeMenu,
    triggerRef: menuTriggerRef,
    menuRef,
    menuStyle,
  } = useAnchoredMenu({ width: MENU_WIDTH, maxHeight: MENU_MAX_HEIGHT });

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
    closeMenu();
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

  // Single pin: keep the direct affordance — no menu round-trip for one item.
  if (chips.length === 1) {
    const chip = chips[0];
    return (
      <PinChip
        chip={chip}
        onOpen={() => handleOpen(chip.contentNodeId, chip.contentDeleted)}
        onUnpin={() => void handleUnpin(chip.contentNodeId)}
        className="max-w-[180px]"
      />
    );
  }

  return (
    <div className="relative min-w-0">
      <button
        ref={menuTriggerRef}
        type="button"
        onClick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={`Pinned to ${chips.length} items — click to see them`}
        className={cn(
          "flex max-w-[160px] items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition-colors",
          "border-black/10 dark:border-white/15 text-gray-500 dark:text-gray-400",
          "hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer",
          menuOpen && "bg-black/[0.04] dark:bg-white/[0.06]",
        )}
      >
        <Pin className="h-3 w-3 shrink-0" />
        <span className="truncate">Pinned to {chips.length}</span>
        <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60" />
      </button>

      {menuOpen &&
        menuStyle &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={menuStyle}
            className="z-[130] flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-[#1a1a1a]"
          >
            <div className="border-b border-black/5 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:border-white/5">
              Pinned to · {chips.length}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {chips.map((chip) => (
                <PinRow
                  key={chip.contentNodeId}
                  chip={chip}
                  onOpen={() =>
                    handleOpen(chip.contentNodeId, chip.contentDeleted)
                  }
                  onUnpin={() => void handleUnpin(chip.contentNodeId)}
                />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Inline chip — the single-pin presentation (and the pre-collapse look). */
function PinChip({
  chip,
  onOpen,
  onUnpin,
  className,
}: {
  chip: AssociationChip;
  onOpen: () => void;
  onUnpin: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group/chip inline-flex min-w-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition-colors",
        chip.contentDeleted
          ? "border-black/10 dark:border-white/10 text-gray-400 dark:text-gray-600 line-through cursor-default"
          : "border-black/10 dark:border-white/15 text-gray-500 dark:text-gray-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer",
        className,
      )}
      onClick={onOpen}
      title={
        chip.contentDeleted
          ? "This content was deleted"
          : `Pinned to ${chip.contentTitle ?? "content"} — click to open`
      }
    >
      <Pin className="h-3 w-3 shrink-0" />
      <span className="truncate">{chip.contentTitle ?? "Untitled"}</span>
      {chip.source === "auto" && (
        <CornerDownRight className="h-2.5 w-2.5 shrink-0 opacity-60" />
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onUnpin();
        }}
        className="shrink-0 opacity-0 transition-opacity group-hover/chip:opacity-100 focus-visible:opacity-100 text-gray-500 hover:text-red-400"
        title="Unpin from this chat"
        aria-label="Unpin from this chat"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/** Menu row — one pinned item inside the collapsed list. */
function PinRow({
  chip,
  onOpen,
  onUnpin,
}: {
  chip: AssociationChip;
  onOpen: () => void;
  onUnpin: () => void;
}) {
  return (
    <div
      role="menuitem"
      tabIndex={chip.contentDeleted ? -1 : 0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      title={
        chip.contentDeleted
          ? "This content was deleted"
          : `Open ${chip.contentTitle ?? "content"}`
      }
      className={cn(
        "group/row flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors outline-none",
        chip.contentDeleted
          ? "text-gray-400 dark:text-gray-600 line-through cursor-default"
          : "text-gray-600 dark:text-gray-300 hover:bg-black/[0.04] dark:hover:bg-white/5 focus-visible:bg-black/[0.04] dark:focus-visible:bg-white/5 cursor-pointer",
      )}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1 truncate">
        {chip.contentTitle ?? "Untitled"}
      </span>
      {chip.source === "auto" && (
        <CornerDownRight
          className="h-3 w-3 shrink-0 opacity-50"
          aria-label="Pinned automatically"
        />
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onUnpin();
        }}
        className="shrink-0 rounded p-0.5 text-gray-400 opacity-60 transition-opacity hover:text-red-400 hover:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100"
        title="Unpin from this chat"
        aria-label="Unpin from this chat"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
