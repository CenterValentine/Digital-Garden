"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Copy,
  Highlighter,
  Info,
  List,
  Loader2,
  MessageSquarePlus,
  NotebookPen,
  PanelRight,
  Settings2,
} from "lucide-react";
import type {
  FoliateAnnotation,
  FoliateRelocateDetail,
  FoliateTocItem,
  FoliateView,
} from "foliate-js/view.js";
import {
  contentTargetKey,
  READER_HIGHLIGHT_COLORS,
  type BookMetaDto,
  type ReaderAnnotationDto,
  type ReaderLocator,
  type ReadingStatus,
} from "@/lib/domain/reader/types";
import { ReaderApiError, readerApi } from "../lib/api";
import { attachSanitizer } from "../lib/sanitize";
import { useReaderPreferences, type ReaderTheme } from "../state/reader-store";
import { AnnotationsPanel } from "./AnnotationsPanel";
import { revealReaderSidebar } from "../lib/sidebar";
import { notifyBooksChanged } from "../state/bookshelf-store";
import { useReaderSession } from "../state/reader-store";

export const HIGHLIGHT_CSS: Record<string, string> = {
  yellow: "rgba(250, 204, 21, 0.45)",
  green: "rgba(74, 222, 128, 0.4)",
  blue: "rgba(96, 165, 250, 0.4)",
  pink: "rgba(244, 114, 182, 0.4)",
  purple: "rgba(192, 132, 252, 0.4)",
};

const THEME_COLORS: Record<Exclude<ReaderTheme, "system">, { bg: string; fg: string; link: string }> = {
  light: { bg: "#ffffff", fg: "#1f2328", link: "#0b62d6" },
  sepia: { bg: "#f4ecd8", fg: "#3b2f1e", link: "#8a4b0f" },
  dark: { bg: "#16181d", fg: "#d8dce3", link: "#8ab4ff" },
};

function resolveTheme(theme: ReaderTheme): Exclude<ReaderTheme, "system"> {
  if (theme !== "system") return theme;
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return "dark";
  }
  return "light";
}

function bookCss(fontSizePct: number, lineHeight: number, theme: ReaderTheme): string {
  const colors = THEME_COLORS[resolveTheme(theme)];
  return `
    html { color-scheme: ${resolveTheme(theme) === "dark" ? "dark" : "light"}; }
    html, body { background: ${colors.bg} !important; color: ${colors.fg} !important; }
    body { font-size: ${fontSizePct}% !important; }
    p, li, blockquote, dd { line-height: ${lineHeight} !important; }
    a:link, a:visited { color: ${colors.link} !important; }
    pre { white-space: pre-wrap !important; }
  `;
}

interface SelectionState {
  cfi: string;
  text: string;
  before: string;
  after: string;
  x: number;
  y: number;
  label?: string;
}

const STATUS_OPTIONS: Array<{ value: ReadingStatus | ""; label: string }> = [
  { value: "", label: "No status" },
  { value: "want", label: "Want to read" },
  { value: "reading", label: "Reading" },
  { value: "finished", label: "Finished" },
  { value: "reference", label: "Reference" },
];

function readerLocFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("readerLoc");
}

export function BookReader({ contentId }: { contentId: string }) {
  const targetKey = contentTargetKey(contentId);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const annotationsRef = useRef<ReaderAnnotationDto[]>([]);
  const persistRef = useRef(true);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [meta, setMeta] = useState<BookMetaDto | null>(null);
  const [toc, setToc] = useState<FoliateTocItem[]>([]);
  const [location, setLocation] = useState<{ fraction: number; label?: string }>({ fraction: 0 });
  const [annotations, setAnnotations] = useState<ReaderAnnotationDto[]>([]);
  const [panel, setPanel] = useState<"none" | "toc" | "notes" | "settings">("none");
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);

  const fontSizePct = useReaderPreferences((state) => state.fontSizePct);
  const lineHeight = useReaderPreferences((state) => state.lineHeight);
  const theme = useReaderPreferences((state) => state.theme);
  const flow = useReaderPreferences((state) => state.flow);
  const highlightColor = useReaderPreferences((state) => state.highlightColor);
  const setFontSizePct = useReaderPreferences((state) => state.setFontSizePct);
  const setLineHeight = useReaderPreferences((state) => state.setLineHeight);
  const setTheme = useReaderPreferences((state) => state.setTheme);
  const setFlow = useReaderPreferences((state) => state.setFlow);
  const setHighlightColor = useReaderPreferences((state) => state.setHighlightColor);

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  // ── Open the book ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    (async () => {
      let lastLocation = readerLocFromUrl();
      try {
        const info = await readerApi.book(contentId);
        if (cancelled) return;
        setMeta(info.meta);
        // The right sidebar's Book tab shows this book's details.
        useReaderSession.getState().setSidebarSelection(contentId, { kind: "book", book: info.meta });
        if (info.drmMessage) {
          setErrorMessage(info.drmMessage);
          setPhase("error");
          return;
        }
        lastLocation ??= info.progress?.locator.locations.cfi ?? null;
        const { annotations: saved } = await readerApi.annotations(targetKey);
        if (cancelled) return;
        setAnnotations(saved);
        annotationsRef.current = saved;
      } catch (error) {
        // The book is still readable without the reader tables — just no
        // saved progress / highlights.
        if (error instanceof ReaderApiError && error.code === "READER_NOT_MIGRATED") {
          persistRef.current = false;
        } else if (error instanceof ReaderApiError && error.status === 404) {
          setErrorMessage("This book could not be found.");
          setPhase("error");
          return;
        } else {
          persistRef.current = false;
        }
      }

      try {
        const response = await fetch(`/api/content/content/${contentId}/download?stream=true`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error(`Could not load the book file (${response.status})`);
        const blob = await response.blob();
        if (cancelled) return;

        const { makeBook } = await import("foliate-js/view.js");
        const { Overlayer } = await import("foliate-js/overlayer.js");
        const book = await makeBook(new File([blob], "book", { type: blob.type }));
        attachSanitizer(book.transformTarget);
        if (cancelled) return;

        const view = document.createElement("foliate-view") as FoliateView;
        view.style.display = "block";
        view.style.height = "100%";
        view.style.width = "100%";
        container.replaceChildren(view);
        viewRef.current = view;

        view.addEventListener("relocate", (event) => {
          const detail = (event as CustomEvent<FoliateRelocateDetail>).detail;
          setLocation({ fraction: detail.fraction ?? 0, label: detail.tocItem?.label });
          if (!persistRef.current) return;
          if (progressTimer.current) clearTimeout(progressTimer.current);
          progressTimer.current = setTimeout(() => {
            const locator: ReaderLocator = {
              locations: { cfi: detail.cfi, totalProgression: detail.fraction ?? 0 },
              label: detail.tocItem?.label,
            };
            void readerApi.saveProgress(targetKey, locator, detail.fraction ?? 0).catch(() => undefined);
          }, 1500);
        });

        view.addEventListener("load", (event) => {
          const { doc, index } = (event as CustomEvent<{ doc: Document; index: number }>).detail;
          doc.addEventListener("keydown", (keyEvent) => {
            if (keyEvent.key === "ArrowLeft") void view.goLeft();
            if (keyEvent.key === "ArrowRight") void view.goRight();
          });
          doc.addEventListener("pointerup", () => {
            // Let the selection settle before reading it.
            setTimeout(() => {
              const selected = doc.getSelection();
              if (!selected || selected.isCollapsed || !selected.toString().trim()) {
                setSelection(null);
                return;
              }
              const range = selected.getRangeAt(0);
              const rect = range.getBoundingClientRect();
              const frame = doc.defaultView?.frameElement?.getBoundingClientRect();
              const host = container.getBoundingClientRect();
              const startText = range.startContainer.textContent ?? "";
              const endText = range.endContainer.textContent ?? "";
              setSelection({
                cfi: view.getCFI(index, range),
                text: selected.toString().trim(),
                before: startText.slice(Math.max(0, range.startOffset - 80), range.startOffset),
                after: endText.slice(range.endOffset, range.endOffset + 80),
                x: (frame?.left ?? 0) + rect.left + rect.width / 2 - host.left,
                y: (frame?.top ?? 0) + rect.top - host.top,
                label: view.lastLocation?.tocItem?.label,
              });
            }, 10);
          });
        });

        view.addEventListener("create-overlay", () => {
          for (const annotation of annotationsRef.current) {
            const cfi = annotation.locator.locations.cfi;
            if (!cfi || annotation.kind === "bookmark") continue;
            void view
              .addAnnotation({ value: cfi, color: annotation.color ?? "yellow" })
              .catch(() => undefined);
          }
        });

        view.addEventListener("draw-annotation", (event) => {
          const { draw, annotation } = (
            event as CustomEvent<{
              draw: (drawer: unknown, options: Record<string, unknown>) => void;
              annotation: FoliateAnnotation;
            }>
          ).detail;
          draw(Overlayer.highlight, {
            color: HIGHLIGHT_CSS[annotation.color ?? "yellow"] ?? HIGHLIGHT_CSS.yellow,
          });
        });

        view.addEventListener("show-annotation", () => setPanel("notes"));

        await view.open(book);
        if (cancelled) return;
        setToc(view.book.toc ?? []);
        await view.init({ lastLocation, showTextStart: !lastLocation });
        setPhase("ready");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Could not open this book");
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      if (progressTimer.current) clearTimeout(progressTimer.current);
      viewRef.current?.close();
      viewRef.current?.remove();
      viewRef.current = null;
    };
  }, [contentId, targetKey]);

  // ── Typography / layout ─────────────────────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view || phase !== "ready") return;
    view.renderer.setStyles?.(bookCss(fontSizePct, lineHeight, theme));
    view.renderer.setAttribute("flow", flow);
    view.renderer.setAttribute("max-inline-size", "720px");
    view.renderer.setAttribute("gap", "6%");
  }, [fontSizePct, lineHeight, theme, flow, phase]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const clearSelection = useCallback(() => {
    setSelection(null);
    setNoteDraft(null);
    for (const { doc } of viewRef.current?.renderer.getContents() ?? []) {
      doc.getSelection()?.removeAllRanges();
    }
  }, []);

  const createAnnotation = useCallback(
    async (kind: "highlight" | "note", color: string, body?: string) => {
      const view = viewRef.current;
      if (!selection || !view) return;
      const locator: ReaderLocator = {
        locations: { cfi: selection.cfi, totalProgression: location.fraction },
        text: { before: selection.before, highlight: selection.text, after: selection.after },
        label: selection.label,
      };
      if (!persistRef.current) {
        toast.error("Highlights can't be saved until the reader migration is applied");
        return;
      }
      try {
        const { annotation } = await readerApi.createAnnotation({
          targetKey,
          kind,
          locator,
          color,
          body: body ?? null,
        });
        setAnnotations((current) => [...current, annotation]);
        await view.addAnnotation({ value: selection.cfi, color }).catch(() => undefined);
        clearSelection();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the highlight");
      }
    },
    [clearSelection, location.fraction, selection, targetKey]
  );

  const addBookmark = useCallback(async () => {
    const view = viewRef.current;
    const cfi = view?.lastLocation?.cfi;
    if (!cfi) return;
    if (!persistRef.current) {
      toast.error("Bookmarks can't be saved until the reader migration is applied");
      return;
    }
    try {
      const { annotation } = await readerApi.createAnnotation({
        targetKey,
        kind: "bookmark",
        locator: {
          locations: { cfi, totalProgression: location.fraction },
          label: location.label,
        },
      });
      setAnnotations((current) => [...current, annotation]);
      toast.success("Bookmarked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not bookmark");
    }
  }, [location.fraction, location.label, targetKey]);

  const removeAnnotation = useCallback(async (annotation: ReaderAnnotationDto) => {
    try {
      await readerApi.deleteAnnotation(annotation.id);
      setAnnotations((current) => current.filter((item) => item.id !== annotation.id));
      const cfi = annotation.locator.locations.cfi;
      if (cfi) await viewRef.current?.deleteAnnotation({ value: cfi }).catch(() => undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
    }
  }, []);

  const updateAnnotation = useCallback(
    async (annotation: ReaderAnnotationDto, input: { color?: string; body?: string | null }) => {
      try {
        const { annotation: updated } = await readerApi.updateAnnotation(annotation.id, input);
        setAnnotations((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        const cfi = updated.locator.locations.cfi;
        if (cfi && input.color) {
          await viewRef.current?.addAnnotation({ value: cfi, color: input.color }).catch(() => undefined);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not update");
      }
    },
    []
  );

  const goToAnnotation = useCallback((annotation: ReaderAnnotationDto) => {
    const cfi = annotation.locator.locations.cfi;
    if (cfi) void viewRef.current?.goTo(cfi);
    else toast.info("Imported highlight — no position in this file");
  }, []);

  const setStatus = useCallback(
    async (status: ReadingStatus | null) => {
      try {
        const result = await readerApi.setStatus(contentId, status);
        setMeta((current) => (current ? { ...current, readingStatus: status } : current));
        notifyBooksChanged();
        if (result.syncedToHardcover) toast.success("Status synced to Hardcover");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not update status");
      }
    },
    [contentId]
  );

  // Window-level arrow keys when focus is outside the book iframe.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (!containerRef.current?.closest("[data-reader-root]")?.contains(document.activeElement ?? null)) return;
      if (event.key === "ArrowLeft") void viewRef.current?.goLeft();
      if (event.key === "ArrowRight") void viewRef.current?.goRight();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const title = meta?.title ?? "Book";
  const renderToc = (items: FoliateTocItem[], depth = 0) => (
    <ul className={depth ? "ml-3 border-l border-black/10 pl-2 dark:border-white/10" : ""}>
      {items.map((item) => (
        <li key={`${item.href}-${item.label}`}>
          <button
            type="button"
            onClick={() => {
              void viewRef.current?.goTo(item.href);
              setPanel("none");
            }}
            className="w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5"
          >
            {item.label}
          </button>
          {item.subitems?.length ? renderToc(item.subitems, depth + 1) : null}
        </li>
      ))}
    </ul>
  );

  return (
    <div data-reader-root tabIndex={-1} className="flex h-full min-h-0 flex-col outline-none">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-black/10 px-3 py-1.5 dark:border-white/10">
        <button type="button" title="Contents" onClick={() => setPanel(panel === "toc" ? "none" : "toc")} className="rounded p-1.5 hover:bg-black/5 dark:hover:bg-white/10">
          <List className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <div className="truncate text-sm font-medium">{title}</div>
          {meta?.authors?.length ? (
            <div className="truncate text-[11px] text-muted-foreground">{meta.authors.join(", ")}</div>
          ) : null}
        </div>
        {meta && (
          <select
            aria-label="Reading status"
            value={meta.readingStatus ?? ""}
            onChange={(event) => void setStatus((event.target.value || null) as ReadingStatus | null)}
            className="h-7 rounded border border-black/10 bg-transparent px-1 text-xs dark:border-white/10"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
        <button type="button" title="About this book" onClick={() => revealReaderSidebar(contentId)} className="rounded p-1.5 hover:bg-black/5 dark:hover:bg-white/10">
          <Info className="h-4 w-4" />
        </button>
        <button type="button" title="Bookmark this page" onClick={() => void addBookmark()} className="rounded p-1.5 hover:bg-black/5 dark:hover:bg-white/10">
          <Bookmark className="h-4 w-4" />
        </button>
        <button type="button" title="Reading settings" onClick={() => setPanel(panel === "settings" ? "none" : "settings")} className="rounded p-1.5 hover:bg-black/5 dark:hover:bg-white/10">
          <Settings2 className="h-4 w-4" />
        </button>
        <button type="button" title="Highlights & notes" onClick={() => setPanel(panel === "notes" ? "none" : "notes")} className="relative rounded p-1.5 hover:bg-black/5 dark:hover:bg-white/10">
          <PanelRight className="h-4 w-4" />
          {annotations.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 rounded-full bg-primary px-1 text-[9px] leading-tight text-primary-foreground">
              {annotations.length}
            </span>
          )}
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {panel === "toc" && (
          <aside className="w-64 shrink-0 overflow-auto border-r border-black/10 p-2 dark:border-white/10">
            {toc.length ? renderToc(toc) : <p className="p-2 text-xs text-muted-foreground">No table of contents.</p>}
          </aside>
        )}

        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            aria-label="Previous page"
            onClick={() => void viewRef.current?.goLeft()}
            className="absolute left-0 top-0 z-10 flex h-full w-10 items-center justify-center text-muted-foreground opacity-0 transition hover:opacity-100"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div ref={containerRef} className="h-full w-full" />
          <button
            type="button"
            aria-label="Next page"
            onClick={() => void viewRef.current?.goRight()}
            className="absolute right-0 top-0 z-10 flex h-full w-10 items-center justify-center text-muted-foreground opacity-0 transition hover:opacity-100"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          {phase === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {phase === "error" && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-md text-center">
                <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />
                <p className="mt-2 text-sm">{errorMessage}</p>
              </div>
            </div>
          )}

          {selection && (
            <div
              className="absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-black/10 bg-background p-1 shadow-lg dark:border-white/10"
              style={{ left: selection.x, top: Math.max(8, selection.y - 6) }}
              onMouseDown={(event) => event.preventDefault()}
            >
              {noteDraft === null ? (
                <div className="flex items-center gap-1">
                  {READER_HIGHLIGHT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={`Highlight ${color}`}
                      onClick={() => {
                        setHighlightColor(color);
                        void createAnnotation("highlight", color);
                      }}
                      className={`h-5 w-5 rounded-full border ${color === highlightColor ? "border-foreground" : "border-transparent"}`}
                      style={{ background: HIGHLIGHT_CSS[color] }}
                    />
                  ))}
                  <span className="mx-1 h-4 w-px bg-black/10 dark:bg-white/10" />
                  <button type="button" title="Highlight with a note" onClick={() => setNoteDraft("")} className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10">
                    <MessageSquarePlus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Copy with citation"
                    onClick={() => {
                      const citation = `“${selection.text}” — ${title}${meta?.authors?.[0] ? `, ${meta.authors[0]}` : ""}`;
                      void navigator.clipboard.writeText(citation).then(() => toast.success("Copied"));
                      clearSelection();
                    }}
                    className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button type="button" title="Highlight" onClick={() => void createAnnotation("highlight", highlightColor)} className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10">
                    <Highlighter className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <form
                  className="flex w-72 flex-col gap-1 p-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createAnnotation("note", highlightColor, noteDraft);
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
          )}
        </div>

        {panel === "settings" && (
          <aside className="w-64 shrink-0 space-y-4 overflow-auto border-l border-black/10 p-3 text-xs dark:border-white/10">
            <label className="block">
              <span className="text-muted-foreground">Text size — {fontSizePct}%</span>
              <input type="range" min={70} max={200} step={5} value={fontSizePct} onChange={(event) => setFontSizePct(Number(event.target.value))} className="w-full" />
            </label>
            <label className="block">
              <span className="text-muted-foreground">Line spacing — {lineHeight.toFixed(2)}</span>
              <input type="range" min={1.1} max={2.2} step={0.05} value={lineHeight} onChange={(event) => setLineHeight(Number(event.target.value))} className="w-full" />
            </label>
            <div>
              <span className="text-muted-foreground">Theme</span>
              <div className="mt-1 grid grid-cols-2 gap-1">
                {(["system", "light", "sepia", "dark"] as const).map((option) => (
                  <button key={option} type="button" onClick={() => setTheme(option)} className={`rounded border px-2 py-1 capitalize ${theme === option ? "border-primary" : "border-black/10 dark:border-white/10"}`}>
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Layout</span>
              <div className="mt-1 grid grid-cols-2 gap-1">
                {(["paginated", "scrolled"] as const).map((option) => (
                  <button key={option} type="button" onClick={() => setFlow(option)} className={`rounded border px-2 py-1 capitalize ${flow === option ? "border-primary" : "border-black/10 dark:border-white/10"}`}>
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        )}

        {panel === "notes" && (
          <AnnotationsPanel
            annotations={annotations}
            onGo={goToAnnotation}
            onDelete={(annotation) => void removeAnnotation(annotation)}
            onUpdate={(annotation, input) => void updateAnnotation(annotation, input)}
            onSent={(updated) =>
              setAnnotations((current) => current.map((item) => (item.id === updated.id ? updated : item)))
            }
          />
        )}
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 border-t border-black/10 px-3 py-1 text-[11px] text-muted-foreground dark:border-white/10">
        <span className="truncate">{location.label ?? ""}</span>
        <input
          type="range"
          aria-label="Position in book"
          min={0}
          max={1000}
          value={Math.round(location.fraction * 1000)}
          onChange={(event) => void viewRef.current?.goToFraction(Number(event.target.value) / 1000)}
          className="flex-1"
        />
        <span>{Math.round(location.fraction * 100)}%</span>
      </div>
    </div>
  );
}
