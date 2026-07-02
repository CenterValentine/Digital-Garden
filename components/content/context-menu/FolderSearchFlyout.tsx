/**
 * FolderSearchFlyout
 *
 * The "Folder search" option of the file-tree Move menu. Renders as a
 * submenu-style flyout (same Liquid-Glass panel as `SubMenu`) hosting a
 * typeable, debounced folder search. Each result shows up to two parent
 * path segments; an empty query surfaces recent picks. Selecting a folder
 * moves the current selection into it.
 *
 * Positioned by the parent ContextMenu via the shared submenu-positioning
 * math, so it behaves like any other nested menu (hover bridge, flip, etc).
 */

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Clock, FolderInput, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/core/utils";
import {
  searchFolders,
  moveNodesToFolder,
  type FolderSearchResult,
} from "@/lib/features/content/move";
import { useFolderMoveStore } from "@/state/folder-move-store";
import { useFolderAssistantStore } from "@/state/folder-assistant-store";

const HOVER_BRIDGE_PX = 12;

interface FolderSearchFlyoutProps {
  position: { x: number; y: number; maxHeight?: number };
  selectedIds: string[];
  excludeIds: string[];
  /** Render the AI "Folder assistant" entry at the top of the flyout. */
  folderAssistant?: boolean;
  onClose: () => void;
  onMouseEnter: () => void;
}

export function FolderSearchFlyout({
  position,
  selectedIds,
  excludeIds,
  folderAssistant = false,
  onClose,
  onMouseEnter,
}: FolderSearchFlyoutProps) {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FolderSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [moving, setMoving] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);

  const recentFolders = useFolderMoveStore((s) => s.recentFolders);
  const pushRecent = useFolderMoveStore((s) => s.pushRecent);

  // Array props get fresh identities on each parent render; mirror them into
  // refs so the debounced search / select callbacks stay stable.
  const excludeRef = useRef(excludeIds);
  const selectedRef = useRef(selectedIds);
  useEffect(() => {
    excludeRef.current = excludeIds;
  }, [excludeIds]);
  useEffect(() => {
    selectedRef.current = selectedIds;
  }, [selectedIds]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (mounted) setTimeout(() => inputRef.current?.focus(), 30);
  }, [mounted]);

  // Debounced folder search (150ms — app-wide convention).
  const runSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const found = await searchFolders(q, excludeRef.current);
        setResults(found);
        setActiveIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 150);
  }, []);

  // When there's no query, show recent picks (filtered against excludes).
  const recentAsResults: FolderSearchResult[] = useMemo(
    () =>
      recentFolders
        .filter((r) => !excludeIds.includes(r.id))
        .map((r) => ({ id: r.id, title: r.title, parentPath: r.parentPath })),
    [recentFolders, excludeIds],
  );

  const showingRecents = query.trim().length === 0;
  const list = showingRecents ? recentAsResults : results;

  const handleSelect = useCallback(
    async (folder: FolderSearchResult) => {
      if (moving) return;
      setMoving(true);
      setMovingId(folder.id);
      // Immediate "system is thinking" affordances: a busy cursor at the
      // pointer + a loading toast that survives the menu closing.
      document.body.style.cursor = "progress";
      const ids = selectedRef.current;
      const count = (n: number) => (n === 1 ? "1 item" : `${n} items`);
      const toastId = toast.loading(
        `Moving ${count(ids.length)} to "${folder.title}"…`,
      );
      try {
        const { moved, failed } = await moveNodesToFolder(ids, folder.id);
        if (moved.length > 0) {
          pushRecent({
            id: folder.id,
            title: folder.title,
            parentPath: folder.parentPath,
          });
          window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
        }
        if (failed.length === 0) {
          toast.success(`Moved ${count(moved.length)} to "${folder.title}"`, {
            id: toastId,
          });
        } else if (moved.length === 0) {
          toast.error("Couldn't move the selection", {
            id: toastId,
            description: failed[0].message,
          });
        } else {
          toast.warning(
            `Moved ${count(moved.length)}; ${failed.length} couldn't be moved`,
            { id: toastId, description: failed[0].message },
          );
        }
      } finally {
        document.body.style.cursor = "";
        setMoving(false);
        setMovingId(null);
        onClose();
      }
    },
    [moving, pushRecent, onClose],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, list.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const folder = list[activeIndex];
      if (folder) void handleSelect(folder);
    }
  };

  if (!mounted) return null;

  const content = (
    <div
      data-context-menu
      className="fixed z-[130] overflow-visible"
      style={{
        left: `${position.x - HOVER_BRIDGE_PX}px`,
        top: `${position.y}px`,
        paddingLeft: `${HOVER_BRIDGE_PX}px`,
      }}
      onMouseEnter={onMouseEnter}
    >
      <div
        data-context-menu
        className={cn(
          "flex w-72 flex-col overflow-hidden rounded-md border border-white/20 bg-white/95 shadow-lg backdrop-blur-sm dark:bg-gray-900/95",
          moving && "cursor-progress",
        )}
        style={{ maxHeight: `${position.maxHeight || 380}px` }}
      >
        {/* AI Folder assistant — pinned above search + recents. */}
        {folderAssistant && (
          <button
            type="button"
            onClick={() => {
              useFolderAssistantStore.getState().openDialog(selectedRef.current);
              onClose();
            }}
            className="flex w-full items-center gap-2 border-b border-gray-200/60 px-2.5 py-2 text-left text-sm text-gray-900 transition-colors hover:bg-primary/5 dark:border-gray-700/60 dark:text-gray-100"
          >
            <Sparkles className="h-4 w-4 flex-shrink-0 text-primary" />
            Folder assistant
          </button>
        )}

        {/* Search input */}
        <div className="border-b border-gray-200/60 p-1.5 dark:border-gray-700/60">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              runSearch(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search folders…"
            className="w-full rounded bg-gray-100 px-2 py-1 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none dark:bg-white/10 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        </div>

        {/* Results / recents */}
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {showingRecents && recentAsResults.length > 0 && (
            <div className="flex items-center gap-1 px-2.5 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <Clock className="h-3 w-3" /> Recent
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-gray-500 dark:text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          )}

          {!loading && list.length === 0 && (
            <div className="px-2.5 py-2 text-xs text-gray-500 dark:text-gray-400">
              {showingRecents
                ? "Type to search folders."
                : "No matching folders."}
            </div>
          )}

          {list.map((folder, index) => (
            <button
              key={folder.id}
              type="button"
              disabled={moving}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => void handleSelect(folder)}
              className={cn(
                "flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition-colors disabled:opacity-50",
                index === activeIndex
                  ? "bg-primary/10"
                  : "hover:bg-primary/5",
              )}
            >
              {movingId === folder.id ? (
                <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-primary" />
              ) : (
                <FolderInput className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-500 dark:text-gray-400" />
              )}
              <span className="flex min-w-0 flex-col">
                {folder.parentPath.length > 0 && (
                  <span className="truncate text-[10px] text-gray-400 dark:text-gray-500">
                    {folder.parentPath.join(" / ")}
                  </span>
                )}
                <span className="truncate text-sm text-gray-900 dark:text-gray-100">
                  {folder.title}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
