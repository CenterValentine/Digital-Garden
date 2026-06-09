"use client";

/**
 * MediaInjectFlyout
 *
 * Opened from a generated audio/image card's "Add to…" button. Lets the user
 * pick ANY content (every type has a TipTap sidecar note) and inject the media
 * into that content's note via POST /api/ai/inject-media. An optional inline
 * instruction guides placement / caption; empty = default (drop in if blank,
 * else AI best-place). Styled to match FolderSearchFlyout.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/core/utils";

export interface InjectMedia {
  kind: "audio" | "image";
  url: string;
  contentId?: string;
  mimeType?: string;
  filename?: string;
  alt?: string;
  durationSeconds?: number | null;
}

interface SearchItem {
  id: string;
  title: string;
  contentType: string;
  path?: string;
}

export function MediaInjectFlyout({
  media,
  anchor,
  onClose,
}: {
  media: InjectMedia;
  /** Viewport coords to anchor the popover (typically the button's bottom-left). */
  anchor: { x: number; y: number };
  onClose: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [injectingId, setInjectingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside-click / Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [onClose]);

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
        const res = await fetch(
          `/api/content/search?query=${encodeURIComponent(q)}`,
          { credentials: "include" },
        );
        const json = (await res.json().catch(() => null)) as {
          data?: { items?: SearchItem[] };
        } | null;
        setResults(json?.data?.items ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 150);
  }, []);

  const handleInject = useCallback(
    async (target: SearchItem) => {
      if (injectingId) return;
      setInjectingId(target.id);
      const toastId = toast.loading(`Adding ${media.kind} to "${target.title}"…`);
      try {
        const res = await fetch("/api/ai/inject-media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            targetContentId: target.id,
            media,
            instruction: instruction.trim() || undefined,
          }),
        });
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          error?: string;
        } | null;
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Couldn't add the media");
        }
        toast.success(`Added to "${target.title}"`, { id: toastId });
        onClose();
      } catch (error) {
        toast.error("Couldn't add the media", {
          id: toastId,
          description: error instanceof Error ? error.message : undefined,
        });
        setInjectingId(null);
      }
    },
    [injectingId, media, instruction, onClose],
  );

  // Clamp the popover into the viewport.
  const style = useMemo<React.CSSProperties>(() => {
    const width = 288;
    const left = Math.min(anchor.x, window.innerWidth - width - 8);
    return {
      left: `${Math.max(8, left)}px`,
      top: `${anchor.y + 4}px`,
      width: `${width}px`,
    };
  }, [anchor]);

  return createPortal(
    <div
      ref={rootRef}
      className="fixed z-[140] flex flex-col overflow-hidden rounded-md border border-white/20 bg-white/95 shadow-lg backdrop-blur-sm dark:bg-gray-900/95"
      style={{ ...style, maxHeight: "380px" }}
    >
      {/* Instruction (optional) */}
      <div className="flex items-start gap-1.5 border-b border-gray-200/60 p-1.5 dark:border-gray-700/60">
        <Sparkles className="mt-1.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="What to add / where (optional)"
          className="w-full rounded bg-gray-100 px-2 py-1 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none dark:bg-white/10 dark:text-gray-100 dark:placeholder:text-gray-500"
        />
      </div>

      {/* Search */}
      <div className="flex items-center gap-1.5 border-b border-gray-200/60 p-1.5 dark:border-gray-700/60">
        <Search className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            runSearch(e.target.value);
          }}
          placeholder="Search notes, chats, files…"
          className="w-full rounded bg-gray-100 px-2 py-1 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none dark:bg-white/10 dark:text-gray-100 dark:placeholder:text-gray-500"
        />
      </div>

      {/* Results */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {loading && (
          <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-gray-500 dark:text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
          </div>
        )}
        {!loading && query.trim().length === 0 && (
          <div className="px-2.5 py-2 text-xs text-gray-500 dark:text-gray-400">
            Type to find a note, chat, or any content to add this {media.kind} to.
          </div>
        )}
        {!loading && query.trim().length > 0 && results.length === 0 && (
          <div className="px-2.5 py-2 text-xs text-gray-500 dark:text-gray-400">
            No matching content.
          </div>
        )}
        {results.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={injectingId !== null}
            onClick={() => void handleInject(item)}
            className={cn(
              "flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-primary/5 disabled:opacity-50",
            )}
          >
            {injectingId === item.id ? (
              <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-primary" />
            ) : (
              <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded bg-primary/10 text-center text-[9px] leading-4 uppercase text-primary">
                {item.contentType.slice(0, 1)}
              </span>
            )}
            <span className="flex min-w-0 flex-col">
              {item.path && (
                <span className="truncate text-[10px] text-gray-400 dark:text-gray-500">
                  {item.path}
                </span>
              )}
              <span className="truncate text-sm text-gray-900 dark:text-gray-100">
                {item.title}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
