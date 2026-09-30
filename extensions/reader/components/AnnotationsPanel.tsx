"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bookmark, FileText, NotebookPen, Send, Trash2 } from "lucide-react";
import { syncTreeQuietly } from "@/lib/features/content/tree-optimistic";
import { useContentStore } from "@/state/content-store";
import {
  READER_HIGHLIGHT_COLORS,
  type ReaderAnnotationDto,
} from "@/lib/domain/reader/types";
import { readerApi } from "../lib/api";
import { MARK_SWATCH, markValue, parseMark } from "../lib/marks";


interface AnnotationsPanelProps {
  annotations: ReaderAnnotationDto[];
  onGo: (annotation: ReaderAnnotationDto) => void;
  onDelete: (annotation: ReaderAnnotationDto) => void;
  onUpdate: (annotation: ReaderAnnotationDto, input: { color?: string; body?: string | null }) => void;
  onSent: (annotation: ReaderAnnotationDto) => void;
  /** Hide the "Highlights & notes" title (the host already labels it). */
  hideTitle?: boolean;
  className?: string;
}

function position(annotation: ReaderAnnotationDto): number {
  return annotation.locator.locations.totalProgression ?? Number.POSITIVE_INFINITY;
}

export function AnnotationsPanel({
  annotations,
  onGo,
  onDelete,
  onUpdate,
  onSent,
  hideTitle,
  className,
}: AnnotationsPanelProps) {
  const [filter, setFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...annotations]
        .filter((annotation) => !filter || parseMark(annotation.color).color === filter || (filter === "bookmark" && annotation.kind === "bookmark"))
        .sort((a, b) => position(a) - position(b)),
    [annotations, filter]
  );

  const send = async (annotation: ReaderAnnotationDto) => {
    setSending(annotation.id);
    try {
      const result = await readerApi.sendToNote(annotation.id);
      onSent({ ...annotation, noteContentId: result.noteContentId });
      syncTreeQuietly();
      toast.success(result.created ? "Created your notes for this book" : "Added to your notes", {
        action: {
          label: "Open",
          onClick: () =>
            useContentStore.getState().setSelectedContentId(result.noteContentId, {
              contentType: "note",
              pin: true,
            }),
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send to note");
    } finally {
      setSending(null);
    }
  };

  return (
    <div className={`flex min-h-0 flex-col ${className ?? "h-full"}`}>
      <div className="flex items-center gap-1 border-b border-black/10 p-2 dark:border-white/10">
        <span className="mr-auto text-xs font-semibold">{hideTitle ? "" : "Highlights & notes"}</span>
        <button type="button" onClick={() => setFilter(null)} className={`rounded px-1.5 text-[11px] ${filter === null ? "bg-black/10 dark:bg-white/10" : ""}`}>
          All
        </button>
        {READER_HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            onClick={() => setFilter(filter === color ? null : color)}
            className={`h-3.5 w-3.5 rounded-full border ${filter === color ? "border-foreground" : "border-transparent"}`}
            style={{ background: MARK_SWATCH[color] }}
          />
        ))}
        <button type="button" title="Bookmarks" onClick={() => setFilter(filter === "bookmark" ? null : "bookmark")} className={`rounded p-0.5 ${filter === "bookmark" ? "bg-black/10 dark:bg-white/10" : ""}`}>
          <Bookmark className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 space-y-2 overflow-auto p-2">
        {sorted.length === 0 && (
          <p className="p-2 text-xs text-muted-foreground">
            Select text in the book to highlight it or add a note.
          </p>
        )}
        {sorted.map((annotation) => (
          <div key={annotation.id} className="group rounded-md border border-black/10 p-2 text-xs dark:border-white/10">
            <button type="button" onClick={() => onGo(annotation)} className="block w-full text-left">
              {annotation.kind === "bookmark" ? (
                <span className="flex items-center gap-1 font-medium">
                  <Bookmark className="h-3.5 w-3.5" /> {annotation.locator.label ?? "Bookmark"}
                </span>
              ) : (
                <MarkQuote value={annotation.color} text={annotation.locator.text?.highlight} />
              )}
            </button>
            {editing === annotation.id ? (
              <form
                className="mt-1 space-y-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  onUpdate(annotation, { body: draft.trim() || null });
                  setEditing(null);
                }}
              >
                <textarea autoFocus rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} className="w-full resize-none rounded border border-black/10 bg-transparent p-1 dark:border-white/10" />
                <div className="flex justify-end gap-1">
                  <button type="button" onClick={() => setEditing(null)} className="px-1 text-muted-foreground">Cancel</button>
                  <button type="submit" className="rounded bg-primary px-2 text-primary-foreground">Save</button>
                </div>
              </form>
            ) : (
              annotation.body && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{annotation.body}</p>
            )}
            <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="mr-auto truncate">
                {annotation.locator.label ?? ""}
                {annotation.source !== "reader" ? ` · ${annotation.source}` : ""}
              </span>
              {annotation.kind !== "bookmark" &&
                READER_HIGHLIGHT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={`Recolor ${color}`}
                    onClick={() => onUpdate(annotation, { color: markValue(parseMark(annotation.color).style, color) })}
                    className="hidden h-2.5 w-2.5 rounded-full group-hover:inline-block"
                    style={{ background: MARK_SWATCH[color] }}
                  />
                ))}
              <button
                type="button"
                title="Edit note"
                onClick={() => {
                  setEditing(annotation.id);
                  setDraft(annotation.body ?? "");
                }}
                className="rounded p-0.5 hover:text-foreground"
              >
                <NotebookPen className="h-3 w-3" />
              </button>
              {annotation.kind !== "bookmark" && (
                <button
                  type="button"
                  title={annotation.noteContentId ? "Send again to your notes" : "Send to your notes for this book"}
                  disabled={sending === annotation.id}
                  onClick={() => void send(annotation)}
                  className="rounded p-0.5 hover:text-foreground"
                >
                  {annotation.noteContentId ? <FileText className="h-3 w-3 text-primary" /> : <Send className="h-3 w-3" />}
                </button>
              )}
              <button type="button" title="Delete" onClick={() => onDelete(annotation)} className="rounded p-0.5 hover:text-red-500">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The quoted passage, marked the way it is in the book (bar for highlights, underline for underlines). */
function MarkQuote({ value, text }: { value: string | null; text?: string }) {
  const { style, color } = parseMark(value);
  if (style === "underline") {
    return (
      <span className="line-clamp-4 pl-2">
        <span
          className="underline decoration-2 underline-offset-4"
          style={{ textDecorationColor: MARK_SWATCH[color] }}
        >
          {text}
        </span>
      </span>
    );
  }
  return (
    <span className="line-clamp-4 border-l-2 pl-2" style={{ borderColor: MARK_SWATCH[color] }}>
      {text}
    </span>
  );
}
