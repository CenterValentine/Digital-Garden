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
  Settings2,
  Underline,
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
import {
  registerSpeedReaderPagedSource,
  type SpeedReaderPage,
} from "@/extensions/speed-reader/events";
import { useContentFullscreenStore } from "@/state/content-fullscreen-store";
import { useContentAnchorStore } from "@/state/content-anchor-store";
import type { LinkAnchor } from "@/lib/domain/content/link-anchor";
import { ANNOTATION_ANCHOR_KIND } from "../lib/link-anchors";
import { ReaderApiError, readerApi } from "../lib/api";
import { attachSanitizer } from "../lib/sanitize";
import { useReaderPreferences, type ReaderTheme } from "../state/reader-store";
import {
  HIGHLIGHT_LAYER,
  MARK_SWATCH,
  markPaint,
  markValue,
  parseMark,
  type MarkStyle,
  type MarkTone,
} from "../lib/marks";
import { BookDetailsPanel } from "./BookDetailsPanel";
import { ContentsView, ReaderBookSidebar } from "./ReaderBookSidebar";
import { revealReaderSidebar } from "../lib/sidebar";
import { notifyBooksChanged } from "../state/bookshelf-store";
import { useReaderSession, type ReaderSidebarView } from "../state/reader-store";

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

function themeTone(theme: ReaderTheme): MarkTone {
  return resolveTheme(theme) === "dark" ? "dark" : "light";
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

/** Press-and-hold on Contents opens it in the right sidebar. */
const CONTENTS_HOLD_MS = 450;

/** The annotation an anchored wiki-link points at, if it still exists. */
function anchoredAnnotation(anchor: LinkAnchor, annotations: ReaderAnnotationDto[]): ReaderAnnotationDto | null {
  if (anchor.kind !== ANNOTATION_ANCHOR_KIND) return null;
  return annotations.find((annotation) => annotation.id === anchor.id) ?? null;
}

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
  // Full screen hides the app's right sidebar; its Book views open as a drawer.
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Contents: click toggles the TOC beside the page; a long press (or a
  // modifier-click) opens it in the right sidebar instead.
  const [tocOpen, setTocOpen] = useState(false);
  const contentsHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentsHeldRef = useRef(false);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  // Full-screen reading. The app's right sidebar is out of view then, so
  // highlights & notes open as a drawer inside the reader instead.
  // (Full screen itself is the content toolbar's — see content-fullscreen-store.)
  const immersive = useContentFullscreenStore((state) => state.active && state.contentId === contentId);
  const immersiveRef = useRef(false);
  // Marks are painted for the page's tone; the draw handler reads it here.
  const toneRef = useRef<MarkTone>("light");

  const fontSizePct = useReaderPreferences((state) => state.fontSizePct);
  const lineHeight = useReaderPreferences((state) => state.lineHeight);
  const theme = useReaderPreferences((state) => state.theme);
  const flow = useReaderPreferences((state) => state.flow);
  const highlightColor = useReaderPreferences((state) => state.highlightColor);
  const setHighlightColor = useReaderPreferences((state) => state.setHighlightColor);

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  useEffect(() => {
    immersiveRef.current = immersive;
  }, [immersive]);

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
        // Opened from an anchored wiki-link: start at that highlight.
        const pending = useContentAnchorStore.getState().take(contentId);
        const anchored = pending ? anchoredAnnotation(pending, saved) : null;
        if (anchored?.locator.locations.cfi) lastLocation = anchored.locator.locations.cfi;
        else if (pending) toast.info("That highlight no longer exists — opened the book where you left off");
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

        toneRef.current = themeTone(useReaderPreferences.getState().theme);
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
          const paint = markPaint(annotation.color, toneRef.current);
          if (paint.style === "underline") {
            draw(Overlayer.underline, { color: paint.color, width: 2, padding: 1 });
          } else {
            draw(Overlayer.highlight, { color: paint.color });
          }
        });

        // Clicking a highlight shows the notes: in the app's right sidebar,
        // or the reader's own drawer while full screen.
        view.addEventListener("show-annotation", () => {
          if (immersiveRef.current) {
            useReaderSession.getState().setSidebarView(contentId, "notes");
            setDrawerOpen(true);
          } else revealReaderSidebar(contentId, "notes");
        });

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

  // Mark colors follow the page's tone (light/sepia vs dark): set the
  // highlight layer's blend, then repaint the marks already drawn.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || phase !== "ready") return;
    const tone = themeTone(theme);
    view.style.setProperty("--overlayer-highlight-opacity", HIGHLIGHT_LAYER[tone].opacity);
    view.style.setProperty("--overlayer-highlight-blend-mode", HIGHLIGHT_LAYER[tone].blend);
    if (toneRef.current === tone) return;
    toneRef.current = tone;
    for (const annotation of annotationsRef.current) {
      const cfi = annotation.locator.locations.cfi;
      if (!cfi || annotation.kind === "bookmark") continue;
      void view.addAnnotation({ value: cfi, color: annotation.color ?? "yellow" }).catch(() => undefined);
    }
  }, [theme, phase]);

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

  const markSent = useCallback((updated: ReaderAnnotationDto) => {
    setAnnotations((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }, []);

  const goToHref = useCallback((href: string) => {
    void viewRef.current?.goTo(href);
  }, []);

  // The right sidebar's Book tab shows this book's notes, contents and
  // display settings — the reader keeps no side panels of its own.
  useEffect(() => {
    useReaderSession.getState().setOpenBook(contentId, {
      annotations,
      go: goToAnnotation,
      remove: (annotation) => void removeAnnotation(annotation),
      update: (annotation, input) => void updateAnnotation(annotation, input),
      sent: markSent,
      toc,
      currentLabel: location.label,
      goToHref,
    });
  }, [annotations, contentId, goToAnnotation, goToHref, location.label, markSent, removeAnnotation, toc, updateAnnotation]);
  useEffect(() => () => useReaderSession.getState().setOpenBook(contentId, null), [contentId]);

  /**
   * Toolbar shortcuts: launch the app's right sidebar on the Book tab's view
   * (the sidebar's own toggle collapses it). In full screen, where the
   * sidebar is out of view, the same views open as a drawer.
   */
  const cancelContentsHold = useCallback(() => {
    if (contentsHoldTimer.current) clearTimeout(contentsHoldTimer.current);
    contentsHoldTimer.current = null;
  }, []);

  const openSideView = useCallback(
    (view: ReaderSidebarView) => {
      if (immersive) {
        useReaderSession.getState().setSidebarView(contentId, view);
        setDrawerOpen(true);
        return;
      }
      revealReaderSidebar(contentId, view);
    },
    [contentId, immersive]
  );

  const startContentsHold = useCallback(() => {
    contentsHeldRef.current = false;
    cancelContentsHold();
    contentsHoldTimer.current = setTimeout(() => {
      contentsHeldRef.current = true;
      setTocOpen(false);
      openSideView("contents");
    }, CONTENTS_HOLD_MS);
  }, [cancelContentsHold, openSideView]);
  useEffect(() => cancelContentsHold, [cancelContentsHold]);

  // Speed reading starts from the page on screen, one page at a time.
  useEffect(() => {
    if (phase !== "ready") return;
    const visiblePage = (): SpeedReaderPage | null => {
      const last = viewRef.current?.lastLocation;
      const text = last?.range?.toString().trim();
      return text ? { text, label: last?.tocItem?.label } : null;
    };
    return registerSpeedReaderPagedSource(contentId, {
      current: async () => visiblePage(),
      next: async () => {
        const view = viewRef.current;
        if (!view) return null;
        const before = view.lastLocation?.cfi;
        const relocated = new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 2000);
          view.addEventListener(
            "relocate",
            () => {
              clearTimeout(timeout);
              resolve();
            },
            { once: true }
          );
        });
        await view.next();
        await relocated;
        // Didn't move: the end of the book.
        if (view.lastLocation?.cfi === before) return null;
        return visiblePage() ?? { text: "", label: view.lastLocation?.tocItem?.label };
      },
    });
  }, [contentId, phase]);






  // An anchored wiki-link clicked while this book is already open: jump.
  const pendingAnchor = useContentAnchorStore((state) => state.pending[contentId] ?? null);
  useEffect(() => {
    if (!pendingAnchor || phase !== "ready") return;
    useContentAnchorStore.getState().take(contentId);
    const annotation = anchoredAnnotation(pendingAnchor, annotationsRef.current);
    if (annotation) goToAnnotation(annotation);
    else toast.info("That highlight no longer exists");
  }, [contentId, goToAnnotation, pendingAnchor, phase]);

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

  const openBook = useReaderSession((state) => state.openBooks[contentId] ?? null);
  const iconButton = "rounded p-1.5 hover:bg-black/5 dark:hover:bg-white/10";
  const pageButton =
    "inline-flex h-7 items-center gap-0.5 rounded px-1.5 text-xs hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10";
  const mark = (style: MarkStyle, color: (typeof READER_HIGHLIGHT_COLORS)[number]) => {
    setHighlightColor(color);
    void createAnnotation("highlight", markValue(style, color));
  };

  return (
    <div
      data-reader-root
      tabIndex={-1}
      className="flex h-full min-h-0 flex-col outline-none"
    >
      {/* Secondary toolbar: book-specific affordances only (anything that
          generalizes across content types — full screen, speed read — is the
          content toolbar's). The view buttons are shortcuts into the right
          sidebar's Book views. */}
      <div className="flex items-center gap-1 border-b border-black/10 px-3 py-1.5 dark:border-white/10">
        <button
          type="button"
          title="Contents — hold (or ⌥/⇧/⌘-click) to open in the right sidebar"
          aria-pressed={tocOpen}
          onPointerDown={startContentsHold}
          onPointerUp={cancelContentsHold}
          onPointerLeave={cancelContentsHold}
          onClick={(event) => {
            if (contentsHeldRef.current) {
              contentsHeldRef.current = false;
              return; // the hold already opened the sidebar
            }
            if (event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) {
              openSideView("contents");
              return;
            }
            setTocOpen((open) => !open);
          }}
          className={`${iconButton} ${tocOpen ? "bg-black/10 dark:bg-white/10" : ""}`}
        >
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
        <button type="button" title="About this book" onClick={() => openSideView("about")} className={iconButton}>
          <Info className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Highlights & notes"
          onClick={() => openSideView("notes")}
          className={`relative ${iconButton}`}
        >
          <NotebookPen className="h-4 w-4" />
          {annotations.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 rounded-full bg-primary px-1 text-[9px] leading-tight text-primary-foreground">
              {annotations.length}
            </span>
          )}
        </button>
        <button type="button" title="Display settings" onClick={() => openSideView("settings")} className={iconButton}>
          <Settings2 className="h-4 w-4" />
        </button>
        <button type="button" title="Bookmark this page" onClick={() => void addBookmark()} className={iconButton}>
          <Bookmark className="h-4 w-4" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* Table of contents beside the page (the one in-viewer panel the owner
            kept: navigating a book wants the TOC next to the text). The same
            view is in the right sidebar's Book rail. */}
        {tocOpen && openBook && (
          <aside className="w-64 shrink-0 border-r border-black/10 dark:border-white/10">
            <ContentsView book={openBook} onNavigate={() => setTocOpen(false)} />
          </aside>
        )}
        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            aria-label="Previous page"
            title="Previous page (←)"
            onClick={() => void viewRef.current?.goLeft()}
            className="absolute left-0 top-0 z-10 flex h-full w-10 items-center justify-center text-muted-foreground opacity-40 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div ref={containerRef} className="h-full w-full" />
          <button
            type="button"
            aria-label="Next page"
            title="Next page (→)"
            onClick={() => void viewRef.current?.goRight()}
            className="absolute right-0 top-0 z-10 flex h-full w-10 items-center justify-center text-muted-foreground opacity-40 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5"
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
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <Highlighter className="mx-0.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    {READER_HIGHLIGHT_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        title={`Highlight ${color}`}
                        onClick={() => mark("highlight", color)}
                        className={`h-5 w-5 rounded-full border ${color === highlightColor ? "border-foreground" : "border-transparent"}`}
                        style={{ background: MARK_SWATCH[color] }}
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
                  </div>
                  <div className="flex items-center gap-1">
                    <Underline className="mx-0.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    {READER_HIGHLIGHT_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        title={`Underline ${color}`}
                        onClick={() => mark("underline", color)}
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
                    void createAnnotation("note", markValue("highlight", parseMark(highlightColor).color), noteDraft);
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

        {/* Full screen only: the right sidebar's Book views, as a drawer. */}
        {immersive && drawerOpen && openBook && (
          <aside className="w-80 shrink-0 border-l border-black/10 dark:border-white/10">
            <ReaderBookSidebar
              contentId={contentId}
              book={openBook}
              onClose={() => setDrawerOpen(false)}
              about={
                meta ? (
                  <BookDetailsPanel
                    className="h-full rounded-none border-0"
                    subject={{
                      title: meta.title,
                      authors: meta.authors,
                      coverUrl: meta.coverUrl,
                      summary: meta.description,
                      publishedYear: meta.publishedYear,
                      language: meta.language,
                      license: meta.license,
                      isbn: meta.isbn,
                      publisher: meta.publisher,
                    }}
                    query={{
                      title: meta.title,
                      author: meta.authors[0],
                      isbn: meta.isbn ?? undefined,
                      openLibraryId: meta.openLibraryId ?? undefined,
                      contentId,
                    }}
                  />
                ) : null
              }
            />
          </aside>
        )}
      </div>

      {/* Progress + adjacent-page navigation */}
      <div className="flex items-center gap-2 border-t border-black/10 px-2 py-1 text-[11px] text-muted-foreground dark:border-white/10">
        <button type="button" onClick={() => void viewRef.current?.goLeft()} className={pageButton} title="Previous page (←)">
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <span className="max-w-[30%] truncate">{location.label ?? ""}</span>
        <input
          type="range"
          aria-label="Position in book"
          min={0}
          max={1000}
          value={Math.round(location.fraction * 1000)}
          onChange={(event) => void viewRef.current?.goToFraction(Number(event.target.value) / 1000)}
          className="min-w-0 flex-1"
        />
        <span>{Math.round(location.fraction * 100)}%</span>
        <button type="button" onClick={() => void viewRef.current?.goRight()} className={pageButton} title="Next page (→)">
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
