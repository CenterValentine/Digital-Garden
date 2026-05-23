/**
 * SidebarChatTabs — Session 4a.
 *
 * Tab strip at the top of the right-sidebar chat panel. Each tab is a
 * conversation associated with the currently-open content. The "+"
 * button opens the conversation picker. The "✨ New" button creates a
 * new conversation with a snapshot association to the open content.
 *
 * Tab source indicator (subtle):
 *   snapshot/manual → no glyph
 *   auto            → `↪` (this conversation was auto-bound here)
 *
 * Right-click on a tab opens the action menu (pin/unpin/delete).
 * For Session 4a we ship a simpler explicit-button row instead — the
 * full context menu lands in 4b once the cache store is in place.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Sparkles, X, Pin } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { toast } from "sonner";
import { getProviderTheme } from "@/lib/design/system/ai-providers";

export interface SidebarTabEntry {
  conversationId: string;
  title: string | null;
  /** Source of the association binding this conversation to the current panel. */
  source: "snapshot" | "manual" | "auto";
  /**
   * Active provider id for the conversation (drives tab color).
   * Resolved on activation as: session override (if this tab is the
   * active one) → `lastProviderId` (the chat's last stamp) → settings
   * default → "anthropic".
   */
  providerId?: string | null;
  /** Last *stamped* provider id from this conversation's history. */
  lastProviderId?: string | null;
  /** Last *stamped* model id from this conversation's history. */
  lastModelId?: string | null;
}

interface SidebarChatTabsProps {
  tabs: SidebarTabEntry[];
  activeConversationId: string | null;
  onActivate: (conversationId: string) => void;
  onNew: () => void;
  onPick: () => void;
  onUnpin?: (conversationId: string) => void;
  /**
   * Rename a conversation. Called when the user double-clicks a tab,
   * edits the title, and confirms (Enter / blur). Parent issues the
   * PATCH and refreshes the tab list.
   */
  onRename?: (conversationId: string, newTitle: string) => Promise<void> | void;
  /** Max visible tabs before overflow menu (defaults to 5). */
  maxVisible?: number;
}

export function SidebarChatTabs({
  tabs,
  activeConversationId,
  onActivate,
  onNew,
  onPick,
  onUnpin,
  onRename,
  maxVisible = 5,
}: SidebarChatTabsProps) {
  const visible = tabs.slice(0, maxVisible);
  const overflow = tabs.slice(maxVisible);
  const [overflowOpen, setOverflowOpen] = useState(false);

  return (
    <div className="flex shrink-0 items-end border-b border-black/10 dark:border-white/10 px-2 pt-1.5 gap-2">
      {/* Scrollable tab list — fills available width, scrolls horizontally
          on overflow. min-w-0 is critical to let flex-1 actually shrink
          past content width and trigger the inner overflow. y-axis is
          locked so accidental vertical overflow can't draw a track; the
          x-axis scrollbar is hidden cross-browser so the strip blends
          into the painted surface beneath it. Users still scroll via
          wheel/trackpad gestures. */}
      <div
        className="scrollbar-hide flex items-end gap-px flex-1 min-w-0 overflow-x-auto overflow-y-hidden"
      >
        {visible.map((t) => (
          <TabButton
            key={t.conversationId}
            tab={t}
            active={t.conversationId === activeConversationId}
            onActivate={() => onActivate(t.conversationId)}
            onUnpin={onUnpin}
            onRename={onRename}
          />
        ))}

        {overflow.length > 0 && (
          <div className="relative shrink-0">
            <button
              onClick={() => setOverflowOpen((v) => !v)}
              className="rounded-full px-2 py-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-300 hover:bg-white/10 transition-colors"
              title={`${overflow.length} more`}
            >
              …
            </button>
            {overflowOpen && (
              <div className="absolute top-full right-0 mt-1 min-w-[180px] rounded-lg border border-white/10 bg-[#1a1a1a] shadow-xl z-50 overflow-hidden">
                {overflow.map((t) => (
                  <button
                    key={t.conversationId}
                    onClick={() => {
                      onActivate(t.conversationId);
                      setOverflowOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors",
                      t.conversationId === activeConversationId
                        ? "bg-white/10 text-white"
                        : "text-gray-600 dark:text-gray-400 hover:bg-white/5 hover:text-gray-200",
                    )}
                  >
                    <span className="truncate">
                      {tabLabel(t)} {t.source === "auto" && "↪"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Single + affordance — opens a small menu with New / Pin.
          Frozen via shrink-0 so it's never compressed off-screen when
          the tab list overflows. Replaces the previous two-button row
          for a less crowded action area. */}
      <div className="pb-1 shrink-0">
        <AddMenu onNew={onNew} onPick={onPick} />
      </div>
    </div>
  );
}

/**
 * Compact dropdown anchored to the `+` button. Two actions:
 *   - "New chat" (Sparkles icon) creates a fresh conversation.
 *   - "Pin existing chat" (Pin icon) opens the conversation picker.
 *
 * Closes on outside click or Escape. Menu is positioned below the
 * trigger and right-aligned so it doesn't clip on narrow sidebars.
 */
function AddMenu({ onNew, onPick }: { onNew: () => void; onPick: () => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Add chat"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "rounded-md p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-300 hover:bg-white/10 transition-colors",
          open && "bg-white/10 text-gray-200",
        )}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 mt-1 min-w-[160px] rounded-lg border border-white/10 bg-[#1a1a1a] shadow-xl z-50 overflow-hidden py-1"
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNew();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            New chat
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onPick();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-colors"
          >
            <Pin className="h-3.5 w-3.5" />
            Pin existing chat
          </button>
        </div>
      )}
    </div>
  );
}

function TabButton({
  tab,
  active,
  onActivate,
  onUnpin,
  onRename,
}: {
  tab: SidebarTabEntry;
  active: boolean;
  onActivate: () => void;
  onUnpin?: (conversationId: string) => void;
  onRename?: (conversationId: string, newTitle: string) => Promise<void> | void;
}) {
  const theme = getProviderTheme(tab.providerId);
  const label = tabLabel(tab);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  const beginEdit = useCallback(() => {
    if (!onRename) return;
    setDraft(label);
    setEditing(true);
    // Focus + select-all after render
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [label, onRename]);

  const commitEdit = useCallback(() => {
    if (!onRename) return;
    const next = draft.trim();
    setEditing(false);
    if (next.length === 0 || next === label) return;
    void onRename(tab.conversationId, next);
  }, [draft, label, onRename, tab.conversationId]);

  const cancelEdit = useCallback(() => {
    setDraft(label);
    setEditing(false);
  }, [label]);

  // Browser-tab styling. Double-click swaps the label for an inline
  // text input; Enter/blur commits, Escape cancels.
  return (
    <div
      className={cn(
        "group/tab relative inline-flex items-center gap-1 px-2.5 py-1.5",
        "rounded-t-md border border-b-0 text-[11px] transition-colors max-w-[180px] shrink-0",
        active
          ? "z-10"
          : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-300 hover:bg-white/[0.04]",
        editing ? "cursor-text" : "cursor-pointer",
      )}
      style={
        active
          ? {
              // Transparent — the gradient lives on the MultiConversationSidebar
              // wrapper that contains both the tab strip and the chat area, so
              // the active tab just shows the continuous painted surface
              // through itself. Border + brand-tinted text mark it as active.
              background: "transparent",
              borderColor: theme.brandColor + "55",
              color: theme.brandColor,
              marginBottom: "-1px",
              paddingBottom: "calc(0.375rem + 1px)",
            }
          : undefined
      }
      onClick={editing ? undefined : onActivate}
      onDoubleClick={beginEdit}
      title={editing ? "Rename — Enter to save, Esc to cancel" : label}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitEdit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelEdit();
            }
          }}
          onBlur={commitEdit}
          onClick={(e) => e.stopPropagation()}
          // Auto-size to text so the input matches the view-mode label
          // footprint. Capped by the same max-w as the static label.
          // No visible border — the input feels like the label became
          // editable in place.
          size={Math.max(1, draft.length)}
          className="bg-transparent border-0 outline-none p-0 m-0 truncate max-w-[130px]"
          style={{ width: `${Math.max(1, draft.length)}ch` }}
        />
      ) : (
        <>
          <span className="truncate min-w-0 max-w-[130px] pointer-events-none">
            {label}
            {tab.source === "auto" && (
              <span className="ml-0.5 opacity-70">↪</span>
            )}
          </span>
          {onUnpin && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onUnpin(tab.conversationId);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onUnpin(tab.conversationId);
                }
              }}
              className="opacity-0 group-hover/tab:opacity-100 text-gray-500 hover:text-red-400 transition-opacity"
              title="Unpin from this content"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </>
      )}
    </div>
  );
}

function tabLabel(t: SidebarTabEntry): string {
  if (t.title && t.title.trim().length > 0) return t.title;
  return "Untitled";
}

// ─── Helper hooks consumed by the wrapper ──────────────────────────────

/** Pin a conversation to a content node via the manual association endpoint. */
export async function pinConversationToContent(
  conversationId: string,
  contentNodeId: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/conversations/${encodeURIComponent(conversationId)}/associations`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentNodeId }),
      },
    );
    if (!res.ok) throw new Error("Pin failed");
    return true;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Pin failed");
    return false;
  }
}

/** Remove the association between a conversation and a content node. */
export async function unpinConversationFromContent(
  conversationId: string,
  contentNodeId: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/conversations/${encodeURIComponent(conversationId)}/associations/${encodeURIComponent(contentNodeId)}`,
      { method: "DELETE", credentials: "include" },
    );
    if (!res.ok) throw new Error("Unpin failed");
    return true;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Unpin failed");
    return false;
  }
}

/** Lookup conversations associated with the given content node set. */
export async function fetchTabsForContent(
  contentNodeIds: string[],
): Promise<
  Array<{
    conversationId: string;
    title: string | null;
    updatedAt: string;
    sources: Record<string, "snapshot" | "manual" | "auto">;
    /** Last stamped provider id, preloaded so the sidebar can style the
     *  active tab + surface gradient before the chat history loads. */
    lastProviderId: string | null;
    /** Last stamped model id (paired with `lastProviderId`). */
    lastModelId: string | null;
  }>
> {
  if (contentNodeIds.length === 0) return [];
  const url = `/api/conversations/by-content?ids=${encodeURIComponent(contentNodeIds.join(","))}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return [];
  const body = await res.json();
  const items = body?.data?.items ?? [];
  return items.map((it: {
    conversationId: string;
    title: string | null;
    updatedAt: string;
    lastProviderId?: string | null;
    lastModelId?: string | null;
    associations: Array<{ contentNodeId: string; source: "snapshot" | "manual" | "auto" }>;
  }) => ({
    conversationId: it.conversationId,
    title: it.title,
    updatedAt: it.updatedAt,
    sources: Object.fromEntries(it.associations.map((a) => [a.contentNodeId, a.source])),
    lastProviderId: it.lastProviderId ?? null,
    lastModelId: it.lastModelId ?? null,
  }));
}

