"use client";

import { useState } from "react";
import { BookOpen, Download, Loader2 } from "lucide-react";
import { LICENSE_LABELS } from "./CatalogEntryCard";

/**
 * A book as a cover tile — the same card language as the folder Gallery view
 * (bordered tile, fixed aspect, hover ring, caption over a bottom gradient),
 * so the Library reads like the rest of the main panel. Details and actions
 * live in the right sidebar; the tile only selects (plus an optional quick
 * add on hover).
 */
interface BookTileProps {
  title: string;
  authors: string[];
  coverUrl?: string | null;
  badge?: string | null;
  status?: string | null;
  selected?: boolean;
  onSelect: () => void;
  onOpen?: () => void;
  /** Quick "Add to library" shown on hover (catalog results). */
  onQuickAdd?: () => Promise<void>;
}

export function BookTile({
  title,
  authors,
  coverUrl,
  badge,
  status,
  selected,
  onSelect,
  onOpen,
  onQuickAdd,
}: BookTileProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const showCover = Boolean(coverUrl) && !coverFailed;

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border transition-all ${
        selected
          ? "border-primary ring-2 ring-primary"
          : "border-black/10 hover:ring-2 hover:ring-primary/50 dark:border-white/10"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={onOpen}
        title={onOpen ? `${title} — double-click to read` : title}
        className="block w-full text-left"
      >
        <div className="relative aspect-[2/3] bg-black/5 dark:bg-white/5">
          {showCover ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote catalog covers, arbitrary hosts
            <img
              src={coverUrl ?? undefined}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setCoverFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
              <span className="line-clamp-4 text-xs font-medium text-muted-foreground">{title}</span>
            </div>
          )}
          {badge && LICENSE_LABELS[badge] && (
            <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
              {LICENSE_LABELS[badge]}
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent p-2 pt-6">
            <p className="line-clamp-2 text-xs font-semibold leading-snug text-white">{title}</p>
            {authors.length > 0 && (
              <p className="truncate text-[11px] text-white/80">{authors.join(", ")}</p>
            )}
            {status && <p className="text-[10px] font-medium text-amber-200">{status}</p>}
          </div>
        </div>
      </button>
      {onQuickAdd && (
        <button
          type="button"
          title="Add to library"
          aria-label={`Add ${title} to library`}
          disabled={adding}
          onClick={async (event) => {
            event.stopPropagation();
            setAdding(true);
            try {
              await onQuickAdd();
            } finally {
              setAdding(false);
            }
          }}
          className={`absolute right-1.5 top-1.5 rounded-full bg-primary p-1.5 text-primary-foreground shadow transition-opacity ${
            adding ? "opacity-100" : "opacity-0 focus:opacity-100 group-hover:opacity-100"
          }`}
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

/** Responsive tile grid — tiles keep their size; columns reflow. */
export const BOOK_TILE_GRID = "grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4";
