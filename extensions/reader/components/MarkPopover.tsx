"use client";

import { useState } from "react";
import { Copy, Highlighter, MessageSquarePlus, NotebookPen, Underline } from "lucide-react";
import { READER_HIGHLIGHT_COLORS, type ReaderHighlightColor } from "@/lib/domain/reader/types";
import { MARK_SWATCH, type MarkStyle } from "../lib/marks";

/**
 * The popover over a text selection in any reader (books, scriptures):
 * highlight or underline in a color, highlight with a note, copy with
 * citation. Positioned by the host (x = center, y = top of the selection,
 * both relative to the host's positioned box).
 */
export function MarkPopover({
  x,
  y,
  highlightColor,
  onMark,
  onNote,
  onCopy,
}: {
  x: number;
  y: number;
  highlightColor: string;
  onMark: (style: MarkStyle, color: ReaderHighlightColor) => void;
  onNote: (body: string) => void;
  onCopy: () => void;
}) {
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  return (
    <div
      className="absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-black/10 bg-background p-1 font-sans text-foreground shadow-lg dark:border-white/10"
      style={{ left: x, top: Math.max(8, y - 6) }}
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLTextAreaElement)) event.preventDefault();
      }}
    >
      {noteDraft === null ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <Highlighter className="mx-0.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            {READER_HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                title={`Highlight ${color}`}
                onClick={() => onMark("highlight", color)}
                className={`h-5 w-5 rounded-full border ${color === highlightColor ? "border-foreground" : "border-transparent"}`}
                style={{ background: MARK_SWATCH[color] }}
              />
            ))}
            <span className="mx-1 h-4 w-px bg-black/10 dark:bg-white/10" />
            <button type="button" title="Highlight with a note" onClick={() => setNoteDraft("")} className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10">
              <MessageSquarePlus className="h-4 w-4" />
            </button>
            <button type="button" title="Copy with citation" onClick={onCopy} className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10">
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <Underline className="mx-0.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            {READER_HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                title={`Underline ${color}`}
                onClick={() => onMark("underline", color)}
                className="flex h-5 w-5 items-end justify-center rounded hover:bg-black/5 dark:hover:bg-white/10"
              >
                <span className="mb-1 h-0.5 w-3.5 rounded-full" style={{ background: MARK_SWATCH[color] }} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form
          className="flex w-72 flex-col gap-1 p-1"
          onSubmit={(event) => {
            event.preventDefault();
            onNote(noteDraft);
          }}
        >
          <textarea
            autoFocus
            rows={3}
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder="Your note…"
            className="w-full resize-none rounded border border-black/10 bg-transparent p-1.5 text-xs dark:border-white/10"
          />
          <div className="flex justify-end gap-1">
            <button type="button" onClick={() => setNoteDraft(null)} className="h-7 rounded px-2 text-xs text-muted-foreground">
              Cancel
            </button>
            <button type="submit" className="inline-flex h-7 items-center gap-1 rounded bg-primary px-2 text-xs text-primary-foreground">
              <NotebookPen className="h-3.5 w-3.5" /> Save note
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
