"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Home,
  ExternalLink,
  List,
  Loader2,
  NotebookPen,
  Search,
  Settings2,
  X,
} from "lucide-react";
import type {
  ReaderAnnotationDto,
  ReaderHighlightColor,
  ReaderLocator,
} from "@/lib/domain/reader/types";
import {
  formatVerseHref,
  parseVerseHref,
  scriptureTargetKey,
  VERSE_ANCHOR_KIND,
  type ScriptureBookInfo,
  type ScriptureChapterDto,
  type ScriptureContents,
  type ScriptureRef,
  type ScriptureSearchResult,
} from "@/lib/domain/scripture/types";
import {
  buildBookIndex,
  formatReference,
  parseReference,
} from "@/lib/domain/scripture/reference";
import {
  marksForVerse,
  segmentVerse,
} from "@/lib/domain/scripture/verse-marks";
import { gospelLibraryUrl } from "@/lib/domain/scripture/lds";
import { LDS_CORPUS_ID } from "@/lib/domain/scripture/catalog";
import type { LinkAnchor } from "@/lib/domain/content/link-anchor";
import { registerSpeedReaderPagedSource } from "@/extensions/speed-reader/events";
import { useContentFullscreenStore } from "@/state/content-fullscreen-store";
import { useContentAnchorStore } from "@/state/content-anchor-store";
import { useNavigationHistoryStore } from "@/state/navigation-history-store";
import { ReaderApiError, readerApi, scriptureApi } from "../lib/api";
import {
  markInlineStyle,
  markValue,
  parseMark,
  type MarkStyle,
} from "../lib/marks";
import { revealReaderSidebar } from "../lib/sidebar";
import { resolveTheme, themeTone, THEME_COLORS } from "../lib/theme";
import {
  useReaderPreferences,
  useReaderSession,
  type ReaderSidebarView,
  type ReaderTocItem,
} from "../state/reader-store";
import { MarkPopover } from "./MarkPopover";
import {
  ScriptureBrowse,
  ScriptureCrumbs,
  type ScriptureBrowseLevel,
  type ScriptureCrumb,
} from "./ScriptureBrowse";
import { ReaderBookSidebar } from "./ReaderBookSidebar";

/** Press-and-hold on Contents opens it in the right sidebar (as in books). */
const CONTENTS_HOLD_MS = 450;

interface Place {
  bookSlug: string;
  chapter: number;
}

interface VerseSelection {
  verseStart: number;
  verseEnd: number;
  start: number;
  end: number;
  text: string;
  before: string;
  after: string;
  x: number;
  y: number;
}

/** "1 Ne.", "D&C" — the book's reference form. */
function shortName(
  book: Pick<ScriptureBookInfo, "name" | "abbreviations"> | undefined,
  slug: string,
): string {
  return book ? (book.abbreviations[0] ?? book.name) : slug;
}

function chapterText(chapter: ScriptureChapterDto): string {
  return chapter.verses.map((verse) => verse.text).join(" ");
}

/** Keep the selection popover (≤ 18rem wide, centered on x) inside the page. */
function clampPopoverX(x: number, hostWidth: number): number {
  const half = Math.min(150, hostWidth / 2);
  return Math.min(Math.max(x, half), hostWidth - half);
}

/** The selected words, from the verse text itself (no verse numbers). */
function quoteOf(
  verses: ScriptureChapterDto["verses"],
  verseStart: number,
  start: number,
  verseEnd: number,
  end: number,
): string {
  return verses
    .filter((verse) => verse.verse >= verseStart && verse.verse <= verseEnd)
    .map((verse) =>
      verse.text.slice(
        verse.verse === verseStart ? start : 0,
        verse.verse === verseEnd ? end : verse.text.length,
      ),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Offset of (container, offset) within a verse's text element. */
function offsetIn(textEl: Element, container: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(textEl, 0);
  try {
    range.setEnd(container, offset);
  } catch {
    return 0;
  }
  return range.toString().length;
}

/** Where a selection boundary falls: the verse and the offset into its text. */
function boundary(
  node: Node,
  offset: number,
  edge: "start" | "end",
): { verse: number; offset: number; length: number } | null {
  const element = node instanceof Element ? node : node.parentElement;
  const verseEl = element?.closest<HTMLElement>("[data-verse]");
  if (!verseEl) return null;
  const verse = Number(verseEl.dataset.verse);
  const textEl = verseEl.querySelector("[data-verse-text]");
  const length = textEl?.textContent?.length ?? 0;
  if (!textEl) return { verse, offset: 0, length };
  // A boundary on the verse number (not in the text) covers the whole verse.
  if (!textEl.contains(node))
    return { verse, offset: edge === "start" ? 0 : length, length };
  return { verse, offset: offsetIn(textEl, node, offset), length };
}

export function ScriptureReader({
  corpusId,
  contentId,
  progressKey,
  rootTitle,
  paneId,
}: {
  corpusId: string;
  contentId: string;
  /** The workspace pane showing this reader — its Back/Forward history. */
  paneId?: string;
  /**
   * Where reading position is saved. A session (a tree item) keeps its own
   * (`content:<sessionId>`); the bare collection tab uses the collection's.
   * Highlights and notes are always the collection's — shared by sessions.
   */
  progressKey?: string;
  /** The session's own name, shown in place of the collection title. */
  rootTitle?: string;
}) {
  const targetKey = scriptureTargetKey(corpusId);
  const positionKey = progressKey ?? targetKey;
  const rootRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<string, ScriptureChapterDto>());
  const chapterRef = useRef<ScriptureChapterDto | null>(null);
  /** Verse to scroll to after the next render (0 = top); null = stay. */
  const scrollTargetRef = useRef<number | null>(null);
  const persistRef = useRef(true);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentsHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentsHeldRef = useRef(false);

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [contents, setContents] = useState<ScriptureContents | null>(null);
  const [chapter, setChapter] = useState<ScriptureChapterDto | null>(null);
  const [turning, setTurning] = useState(false);
  const [annotations, setAnnotations] = useState<ReaderAnnotationDto[]>([]);
  const [selection, setSelection] = useState<VerseSelection | null>(null);
  const [focusVerses, setFocusVerses] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [aside, setAside] = useState<"contents" | "search" | null>(null);
  const [openBookSlug, setOpenBookSlug] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScriptureSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Browsing (volumes → books → chapters) until a chapter opens; null = reading.
  const [browse, setBrowse] = useState<ScriptureBrowseLevel | null>({
    level: "home",
  });
  const browseRef = useRef<ScriptureBrowseLevel | null>({ level: "home" });
  const [continueAt, setContinueAt] = useState<{
    bookSlug: string;
    chapter: number;
    label: string;
  } | null>(null);

  const immersive = useContentFullscreenStore(
    (state) => state.active && state.contentId === contentId,
  );
  const fontSizePct = useReaderPreferences((state) => state.fontSizePct);
  const lineHeight = useReaderPreferences((state) => state.lineHeight);
  const theme = useReaderPreferences((state) => state.theme);
  const highlightColor = useReaderPreferences((state) => state.highlightColor);
  const setHighlightColor = useReaderPreferences(
    (state) => state.setHighlightColor,
  );

  const books = useMemo(
    () => contents?.volumes.flatMap((volume) => volume.books) ?? [],
    [contents],
  );
  const bookBySlug = useMemo(
    () => new Map(books.map((book) => [book.slug, book])),
    [books],
  );
  const index = useMemo(
    () =>
      buildBookIndex(
        books.map((book) => ({ ...book, chapters: book.chapterCount })),
      ),
    [books],
  );
  const label = useCallback(
    (ref: ScriptureRef) =>
      formatReference(ref, (slug) => shortName(bookBySlug.get(slug), slug)),
    [bookBySlug],
  );

  // ── Loading chapters ────────────────────────────────────────────────────
  const fetchChapter = useCallback(
    async (place: Place): Promise<ScriptureChapterDto> => {
      const key = `${place.bookSlug}/${place.chapter}`;
      const cached = cache.current.get(key);
      if (cached) return cached;
      const loaded = await scriptureApi.chapter(
        corpusId,
        place.bookSlug,
        place.chapter,
      );
      cache.current.set(key, loaded);
      return loaded;
    },
    [corpusId],
  );

  /** Show a chapter (and, optionally, bring verses into view). */
  const goTo = useCallback(
    async (
      place: Place,
      verses?: { start: number; end: number } | null,
    ): Promise<ScriptureChapterDto | null> => {
      setTurning(true);
      try {
        const loaded = await fetchChapter(place);
        chapterRef.current = loaded;
        browseRef.current = null;
        setBrowse(null);
        scrollTargetRef.current = verses?.start ?? 0;
        setChapter(loaded);
        setSelection(null);
        setFocusVerses(verses ?? null);
        return loaded;
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not open that chapter",
        );
        return null;
      } finally {
        setTurning(false);
      }
    },
    [fetchChapter],
  );

  const goToRef = useCallback(
    (ref: ScriptureRef) =>
      goTo(
        { bookSlug: ref.bookSlug, chapter: ref.chapter ?? 1 },
        ref.verseStart != null
          ? { start: ref.verseStart, end: ref.verseEnd ?? ref.verseStart }
          : null,
      ),
    [goTo],
  );

  /** Show a browse level (covers, a volume, a book's chapters). */
  const applyBrowse = useCallback((level: ScriptureBrowseLevel) => {
    browseRef.current = level;
    setBrowse(level);
    setSelection(null);
    pageRef.current?.scrollTo({ top: 0 });
  }, []);

  /** Go to whatever a location anchor names: a view, a chapter or verses. */
  const applyAnchor = useCallback(
    async (anchor: LinkAnchor) => {
      const view = browseLevelFromAnchor(anchor);
      if (view) {
        applyBrowse(view);
        return;
      }
      const ref = anchorRef(anchor);
      if (ref) await goToRef(ref);
    },
    [applyBrowse, goToRef],
  );

  // ── Open the corpus ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let loadedContents: ScriptureContents;
      try {
        loadedContents = await scriptureApi.contents(corpusId);
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(
          error instanceof ReaderApiError && error.status === 404
            ? "This collection isn't loaded yet. Add it in Settings → Extensions → Reader → Scriptures."
            : error instanceof Error
              ? error.message
              : "Could not open this collection",
        );
        setPhase("error");
        return;
      }
      if (cancelled) return;
      setContents(
        rootTitle
          ? {
              ...loadedContents,
              corpus: { ...loadedContents.corpus, title: rootTitle },
            }
          : loadedContents,
      );

      // Opened from a verse link: start at the passage. Otherwise land on the
      // volumes, with "Continue reading" where the reader left off.
      const pending = useContentAnchorStore.getState().take(contentId);
      const start = pending;
      let saved: ReaderAnnotationDto[] = [];
      try {
        const [{ annotations: list }, { progress }] = await Promise.all([
          readerApi.annotations(targetKey),
          readerApi.progress(positionKey),
        ]);
        saved = list;
        const ref = progress?.locator.href
          ? parseVerseHref(progress.locator.href)
          : null;
        if (!cancelled && ref) {
          setContinueAt({
            bookSlug: ref.bookSlug,
            chapter: ref.chapter ?? 1,
            label:
              progress?.locator.label ?? `${ref.bookSlug} ${ref.chapter ?? 1}`,
          });
        }
      } catch {
        // No reader tables: the text still reads, just nothing is saved.
        persistRef.current = false;
      }
      if (cancelled) return;
      setAnnotations(saved);
      if (!loadedContents.volumes.some((volume) => volume.books.length)) {
        setErrorMessage("This collection has no books.");
        setPhase("error");
        return;
      }
      if (start) await applyAnchor(start);
      if (cancelled) return;
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
      if (progressTimer.current) clearTimeout(progressTimer.current);
    };
  }, [applyAnchor, contentId, corpusId, positionKey, rootTitle, targetKey]);

  // Remember where the reader is (per user, per corpus).
  useEffect(() => {
    if (!chapter || !persistRef.current) return;
    if (progressTimer.current) clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => {
      const locator: ReaderLocator = {
        href: formatVerseHref({
          bookSlug: chapter.book.slug,
          chapter: chapter.chapter,
          verseStart: null,
          verseEnd: null,
        }),
        locations: { totalProgression: chapter.fraction },
        label: `${chapter.book.name}${chapter.book.chapterCount > 1 ? ` ${chapter.chapter}` : ""}`,
      };
      void readerApi
        .saveProgress(positionKey, locator, chapter.fraction)
        .catch(() => undefined);
    }, 1200);
  }, [chapter, positionKey]);

  // Bring the focused verses into view (link targets, search results,
  // notes) — once per navigation, not when the focus flash clears.
  useEffect(() => {
    const target = scrollTargetRef.current;
    const page = pageRef.current;
    if (target === null || !page || !chapter) return;
    scrollTargetRef.current = null;
    if (target === 0) page.scrollTo({ top: 0 });
    else
      page
        .querySelector<HTMLElement>(`[data-verse="${target}"]`)
        ?.scrollIntoView({ block: "center" });
  }, [chapter, focusVerses]);

  useEffect(() => {
    if (!focusVerses) return;
    const timer = setTimeout(() => setFocusVerses(null), 2400);
    return () => clearTimeout(timer);
  }, [focusVerses]);

  // A verse link clicked while this collection is already open.
  const pendingAnchor = useContentAnchorStore(
    (state) => state.pending[contentId] ?? null,
  );
  useEffect(() => {
    if (!pendingAnchor || phase !== "ready") return;
    useContentAnchorStore.getState().take(contentId);
    void applyAnchor(pendingAnchor);
  }, [applyAnchor, contentId, pendingAnchor, phase]);

  // Every view is a step in the pane's Back/Forward history (covers →
  // volume → book → chapter), so Back walks the reader's own views before it
  // leaves the reader. Restoring a step (Back) records the same anchor — a
  // no-op in the store.
  const locationAnchor = !contents
    ? null
    : browse
      ? browseAnchor(browse)
      : chapter
        ? `${VERSE_ANCHOR_KIND}:${formatVerseHref({ bookSlug: chapter.book.slug, chapter: chapter.chapter, verseStart: null, verseEnd: null })}`
        : null;
  const locationLabel = !contents
    ? undefined
    : browse
      ? browseTitle(browse, contents)
      : chapter
        ? `${chapter.book.name}${chapter.book.chapterCount > 1 ? ` ${chapter.chapter}` : ""}`
        : undefined;
  useEffect(() => {
    if (phase !== "ready" || !locationAnchor) return;
    useNavigationHistoryStore
      .getState()
      .recordLocation(contentId, paneId, locationAnchor, locationLabel);
  }, [contentId, locationAnchor, locationLabel, paneId, phase]);

  // ── Selection → marks ───────────────────────────────────────────────────
  const readSelection = useCallback(() => {
    const host = hostRef.current;
    const selected = window.getSelection();
    if (
      !host ||
      !selected ||
      selected.isCollapsed ||
      !selected.toString().trim()
    ) {
      setSelection(null);
      return;
    }
    const range = selected.getRangeAt(0);
    if (!pageRef.current?.contains(range.commonAncestorContainer)) return;
    const from = boundary(range.startContainer, range.startOffset, "start");
    const to = boundary(range.endContainer, range.endOffset, "end");
    if (!from || !to) {
      setSelection(null);
      return;
    }
    const verses = chapterRef.current?.verses ?? [];
    const first =
      verses.find((verse) => verse.verse === from.verse)?.text ?? "";
    const last = verses.find((verse) => verse.verse === to.verse)?.text ?? "";
    const rect = range.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    setSelection({
      verseStart: from.verse,
      verseEnd: to.verse,
      start: from.offset,
      end: to.offset,
      text:
        quoteOf(verses, from.verse, from.offset, to.verse, to.offset) ||
        selected.toString().trim(),
      before: first.slice(Math.max(0, from.offset - 80), from.offset),
      after: last.slice(to.offset, to.offset + 80),
      x: clampPopoverX(
        rect.left + rect.width / 2 - hostRect.left,
        hostRect.width,
      ),
      y: rect.top - hostRect.top,
    });
  }, []);

  /** Clicking a verse number selects the whole verse. */
  const selectVerse = useCallback((verse: number, element: HTMLElement) => {
    const host = hostRef.current;
    const text =
      chapterRef.current?.verses.find((entry) => entry.verse === verse)?.text ??
      "";
    if (!host || !text) return;
    window.getSelection()?.removeAllRanges();
    const rect = element.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    setSelection({
      verseStart: verse,
      verseEnd: verse,
      start: 0,
      end: text.length,
      text,
      before: "",
      after: "",
      x: clampPopoverX(
        rect.left + Math.min(rect.width / 2, 160) - hostRect.left,
        hostRect.width,
      ),
      y: rect.top - hostRect.top,
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const selectionRef = useCallback(
    (current: VerseSelection): ScriptureRef | null =>
      chapter
        ? {
            bookSlug: chapter.book.slug,
            chapter: chapter.chapter,
            verseStart: current.verseStart,
            verseEnd: current.verseEnd,
          }
        : null,
    [chapter],
  );

  const createAnnotation = useCallback(
    async (kind: "highlight" | "note", color: string, body?: string) => {
      if (!selection || !chapter) return;
      const ref = selectionRef(selection);
      if (!ref) return;
      if (!persistRef.current) {
        toast.error(
          "Highlights can't be saved until the reader migration is applied",
        );
        return;
      }
      const locator: ReaderLocator = {
        href: formatVerseHref(ref),
        locations: {
          start: selection.start,
          end: selection.end,
          totalProgression: chapter.fraction,
        },
        text: {
          before: selection.before,
          highlight: selection.text,
          after: selection.after,
        },
        label: label(ref),
      };
      try {
        const { annotation } = await readerApi.createAnnotation({
          targetKey,
          kind,
          locator,
          color,
          body: body ?? null,
        });
        setAnnotations((current) => [...current, annotation]);
        clearSelection();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not save the highlight",
        );
      }
    },
    [chapter, clearSelection, label, selection, selectionRef, targetKey],
  );

  const addBookmark = useCallback(async () => {
    if (!chapter) return;
    if (!persistRef.current) {
      toast.error(
        "Bookmarks can't be saved until the reader migration is applied",
      );
      return;
    }
    const ref: ScriptureRef = {
      bookSlug: chapter.book.slug,
      chapter: chapter.chapter,
      verseStart: null,
      verseEnd: null,
    };
    try {
      const { annotation } = await readerApi.createAnnotation({
        targetKey,
        kind: "bookmark",
        locator: {
          href: formatVerseHref(ref),
          locations: { totalProgression: chapter.fraction },
          label: label(ref),
        },
      });
      setAnnotations((current) => [...current, annotation]);
      toast.success("Bookmarked");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not bookmark",
      );
    }
  }, [chapter, label, targetKey]);

  const goToAnnotation = useCallback(
    (annotation: ReaderAnnotationDto) => {
      const ref = annotation.locator.href
        ? parseVerseHref(annotation.locator.href)
        : null;
      if (ref) void goToRef(ref);
      else toast.info("This note has no position in the text");
    },
    [goToRef],
  );

  const removeAnnotation = useCallback(
    async (annotation: ReaderAnnotationDto) => {
      try {
        await readerApi.deleteAnnotation(annotation.id);
        setAnnotations((current) =>
          current.filter((item) => item.id !== annotation.id),
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not delete",
        );
      }
    },
    [],
  );

  const updateAnnotation = useCallback(
    async (
      annotation: ReaderAnnotationDto,
      input: { color?: string; body?: string | null },
    ) => {
      try {
        const { annotation: updated } = await readerApi.updateAnnotation(
          annotation.id,
          input,
        );
        setAnnotations((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not update",
        );
      }
    },
    [],
  );

  const markSent = useCallback((updated: ReaderAnnotationDto) => {
    setAnnotations((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }, []);

  const goToHref = useCallback(
    (href: string) => {
      const ref = parseVerseHref(href);
      if (ref) void goToRef(ref);
    },
    [goToRef],
  );

  // ── The right sidebar's Book tab (notes, contents, display) ────────────
  const toc = useMemo<ReaderTocItem[]>(
    () =>
      contents?.volumes.map((volume) => ({
        label: volume.title,
        href: `${volume.books[0]?.slug ?? ""}/1`,
        subitems: volume.books.map((book) => ({
          label: book.name,
          href: `${book.slug}/1`,
        })),
      })) ?? [],
    [contents],
  );

  useEffect(() => {
    useReaderSession.getState().setOpenBook(contentId, {
      annotations,
      go: goToAnnotation,
      remove: (annotation) => void removeAnnotation(annotation),
      update: (annotation, input) => void updateAnnotation(annotation, input),
      sent: markSent,
      toc,
      currentLabel: chapter?.book.name,
      goToHref,
    });
  }, [
    annotations,
    chapter?.book.name,
    contentId,
    goToAnnotation,
    goToHref,
    markSent,
    removeAnnotation,
    toc,
    updateAnnotation,
  ]);
  useEffect(
    () => () => useReaderSession.getState().setOpenBook(contentId, null),
    [contentId],
  );

  const openSideView = useCallback(
    (view: ReaderSidebarView) => {
      if (immersive) {
        useReaderSession.getState().setSidebarView(contentId, view);
        setDrawerOpen(true);
        return;
      }
      revealReaderSidebar(contentId, view);
    },
    [contentId, immersive],
  );

  const cancelContentsHold = useCallback(() => {
    if (contentsHoldTimer.current) clearTimeout(contentsHoldTimer.current);
    contentsHoldTimer.current = null;
  }, []);
  const startContentsHold = useCallback(() => {
    contentsHeldRef.current = false;
    cancelContentsHold();
    contentsHoldTimer.current = setTimeout(() => {
      contentsHeldRef.current = true;
      setAside(null);
      openSideView("contents");
    }, CONTENTS_HOLD_MS);
  }, [cancelContentsHold, openSideView]);
  useEffect(() => cancelContentsHold, [cancelContentsHold]);

  // ── Speed reading: one chapter is one page ─────────────────────────────
  useEffect(() => {
    if (phase !== "ready") return;
    const page = (dto: ScriptureChapterDto | null) =>
      dto
        ? {
            text: chapterText(dto),
            label: `${dto.book.name}${dto.book.chapterCount > 1 ? ` ${dto.chapter}` : ""}`,
          }
        : null;
    return registerSpeedReaderPagedSource(contentId, {
      current: async () => page(chapterRef.current),
      next: async () => {
        const upcoming = chapterRef.current?.next;
        if (!upcoming) return null;
        return page(
          await goTo({
            bookSlug: upcoming.bookSlug,
            chapter: upcoming.chapter,
          }),
        );
      },
    });
  }, [contentId, goTo, phase]);

  // ── Keyboard: ←/→ turn chapters ────────────────────────────────────────
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
        return;
      if (target?.isContentEditable) return;
      if (!rootRef.current?.contains(document.activeElement ?? null)) return;
      if (browseRef.current) return; // browsing: arrows aren't page turns
      const current = chapterRef.current;
      if (event.key === "ArrowLeft" && current?.prev) void goTo(current.prev);
      if (event.key === "ArrowRight" && current?.next) void goTo(current.next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  // ── Go to a reference, or search ───────────────────────────────────────
  const submitQuery = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const q = query.trim();
      if (!q) return;
      const ref = parseReference(q, index);
      if (ref) {
        await goToRef(ref);
        setAside((current) => (current === "search" ? null : current));
        return;
      }
      setAside("search");
      setSearching(true);
      try {
        setResults(await scriptureApi.search(corpusId, q));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Search failed");
      } finally {
        setSearching(false);
      }
    },
    [corpusId, goToRef, index, query],
  );

  // ── Render ─────────────────────────────────────────────────────────────
  const colors = THEME_COLORS[resolveTheme(theme)];
  const tone = themeTone(theme);
  const book = chapter?.book;
  const prev = chapter?.prev ?? null;
  const next = chapter?.next ?? null;
  // The toolbar names where you are (serif — the collection's voice); its
  // second line is the way back up. No headings repeat it on the page.
  const title = !contents
    ? "Scriptures"
    : browse
      ? browseTitle(browse, contents)
      : book
        ? `${book.name}${book.chapterCount > 1 ? ` ${chapter.chapter}` : ""}`
        : contents.corpus.title;
  const showBrowse = applyBrowse;
  const headerPath = pathTo(browse, book ?? null, contents, showBrowse);
  const openBook = useReaderSession(
    (state) => state.openBooks[contentId] ?? null,
  );
  const annotationsById = useMemo(
    () => new Map(annotations.map((item) => [item.id, item])),
    [annotations],
  );
  const iconButton = "rounded p-1.5 hover:bg-black/5 dark:hover:bg-white/10";
  const pageButton =
    "inline-flex h-7 max-w-[35%] items-center gap-0.5 truncate rounded px-1.5 text-xs hover:bg-black/5 hover:text-foreground disabled:opacity-40 dark:hover:bg-white/10";

  const mark = (style: MarkStyle, color: ReaderHighlightColor) => {
    setHighlightColor(color);
    void createAnnotation("highlight", markValue(style, color));
  };

  return (
    <div
      ref={rootRef}
      data-reader-root
      tabIndex={-1}
      className="flex h-full min-h-0 flex-col outline-none"
    >
      {/* Secondary toolbar: scripture-specific affordances (full screen and
          speed read are the content toolbar's). The path back up gets its own
          line under it, so it never competes with the search box. */}
      <div className="border-b border-black/10 dark:border-white/10">
        <div className="flex items-center gap-1 px-3 py-1.5">
          <button
            type="button"
            title="Contents — hold (or ⌥/⇧/⌘-click) to open in the right sidebar"
            aria-pressed={aside === "contents"}
            onPointerDown={startContentsHold}
            onPointerUp={cancelContentsHold}
            onPointerLeave={cancelContentsHold}
            onClick={(event) => {
              if (contentsHeldRef.current) {
                contentsHeldRef.current = false;
                return;
              }
              if (
                event.altKey ||
                event.shiftKey ||
                event.metaKey ||
                event.ctrlKey
              ) {
                openSideView("contents");
                return;
              }
              setOpenBookSlug(book?.slug ?? null);
              setAside((current) =>
                current === "contents" ? null : "contents",
              );
            }}
            className={`${iconButton} ${aside === "contents" ? "bg-black/10 dark:bg-white/10" : ""}`}
          >
            <List className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1 px-1">
            <div className="truncate font-serif text-base font-semibold leading-tight">
              {title}
            </div>
          </div>
          <form
            onSubmit={(event) => void submitQuery(event)}
            className="relative hidden sm:block"
          >
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Alma 32:21 or a phrase"
              aria-label="Go to a reference or search"
              className="h-7 w-52 rounded border border-black/10 bg-transparent pl-7 pr-2 text-xs dark:border-white/10"
            />
          </form>
          {/* Phones: the search box lives in the search panel. */}
          <button
            type="button"
            title="Go to a reference or search"
            aria-pressed={aside === "search"}
            onClick={() =>
              setAside((current) => (current === "search" ? null : "search"))
            }
            className={`${iconButton} sm:hidden`}
          >
            <Search className="h-4 w-4" />
          </button>
          {corpusId === LDS_CORPUS_ID && chapter && !browse && (
            <a
              href={gospelLibraryUrl(chapter.book.slug, chapter.chapter)}
              target="_blank"
              rel="noreferrer"
              title="Open this chapter in Gospel Library (footnotes, chapter headings)"
              className={iconButton}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
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
          <button
            type="button"
            title="Display settings"
            onClick={() => openSideView("settings")}
            className={iconButton}
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Bookmark this chapter"
            onClick={() => void addBookmark()}
            className={iconButton}
          >
            <Bookmark className="h-4 w-4" />
          </button>
        </div>
        {browse?.level !== "home" && contents && (
          <div className="flex min-w-0 items-center gap-1.5 overflow-hidden px-3 pb-1.5 pl-[2.9rem]">
            {/* The collection itself is implied: home is an icon, the path starts at the volume. */}
            <button
              type="button"
              title={`All of ${contents.corpus.title}`}
              aria-label={`All of ${contents.corpus.title}`}
              onClick={() => showBrowse({ level: "home" })}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            >
              <Home className="h-3.5 w-3.5" />
            </button>
            {headerPath.length > 0 && (
              <>
                <ChevronRight
                  className="h-3 w-3 shrink-0 text-muted-foreground opacity-60"
                  aria-hidden
                />
                <div className="min-w-0 truncate">
                  <ScriptureCrumbs items={headerPath} compact />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* Contents / search beside the text (the owner's navigation
            exception; the same contents are in the right sidebar's rail). */}
        {aside && contents && (
          <aside className="absolute inset-y-0 left-0 z-30 flex w-[min(18rem,85%)] flex-col border-r border-black/10 bg-background shadow-xl sm:static sm:z-auto sm:w-64 sm:shrink-0 sm:shadow-none dark:border-white/10">
            <div className="flex items-center justify-between border-b border-black/10 px-3 py-1.5 text-xs font-medium dark:border-white/10">
              {aside === "contents" ? "Contents" : "Search"}
              <button
                type="button"
                aria-label="Close"
                onClick={() => setAside(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {aside === "search" && (
              <form
                onSubmit={(event) => void submitQuery(event)}
                className="border-b border-black/10 p-2 sm:hidden dark:border-white/10"
              >
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Alma 32:21 or a phrase"
                  aria-label="Go to a reference or search"
                  className="h-8 w-full rounded border border-black/10 bg-transparent px-2 text-sm dark:border-white/10"
                />
              </form>
            )}
            <div className="min-h-0 flex-1 overflow-auto p-2 text-xs">
              {aside === "contents" ? (
                contents.volumes.map((volume) => (
                  <div key={volume.slug} className="mb-2">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {volume.title}
                    </div>
                    {volume.books.map((entry) => (
                      <div key={entry.slug}>
                        <button
                          type="button"
                          onClick={() => {
                            if (entry.chapterCount === 1) {
                              void goTo({ bookSlug: entry.slug, chapter: 1 });
                              setAside(null);
                            } else
                              setOpenBookSlug((current) =>
                                current === entry.slug ? null : entry.slug,
                              );
                          }}
                          className={`w-full truncate rounded px-2 py-1 text-left hover:bg-black/5 dark:hover:bg-white/5 ${
                            entry.slug === book?.slug
                              ? "font-semibold text-primary"
                              : ""
                          }`}
                        >
                          {entry.name}
                        </button>
                        {openBookSlug === entry.slug &&
                          entry.chapterCount > 1 && (
                            <div className="grid grid-cols-6 gap-0.5 px-2 pb-2 pt-1">
                              {Array.from(
                                { length: entry.chapterCount },
                                (_, i) => i + 1,
                              ).map((number) => (
                                <button
                                  key={number}
                                  type="button"
                                  onClick={() => {
                                    void goTo({
                                      bookSlug: entry.slug,
                                      chapter: number,
                                    });
                                    setAside(null);
                                  }}
                                  className={`rounded py-1 text-center tabular-nums hover:bg-black/5 dark:hover:bg-white/10 ${
                                    entry.slug === book?.slug &&
                                    number === chapter?.chapter
                                      ? "bg-primary text-primary-foreground"
                                      : ""
                                  }`}
                                >
                                  {number}
                                </button>
                              ))}
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                ))
              ) : searching ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : results ? (
                <>
                  <p className="px-2 pb-2 text-muted-foreground">
                    {results.total === 0
                      ? "No verses match."
                      : results.total > results.hits.length
                        ? `First ${results.hits.length} of ${results.total} verses`
                        : `${results.total} verse${results.total === 1 ? "" : "s"}`}
                  </p>
                  {results.hits.map((hit) => (
                    <button
                      key={`${hit.bookSlug}-${hit.chapter}-${hit.verse}`}
                      type="button"
                      onClick={() => {
                        void goTo(
                          { bookSlug: hit.bookSlug, chapter: hit.chapter },
                          { start: hit.verse, end: hit.verse },
                        );
                        // On a phone the panel covers the text: get out of the way.
                        if (window.matchMedia("(max-width: 639px)").matches)
                          setAside(null);
                      }}
                      className="mb-1 block w-full rounded px-2 py-1 text-left hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <span className="font-medium">{hit.reference}</span>
                      <span className="line-clamp-2 text-muted-foreground">
                        {hit.text}
                      </span>
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          </aside>
        )}

        <div className="relative min-w-0 flex-1">
          <div
            ref={pageRef}
            className={`h-full overflow-auto ${browse ? "bg-background text-foreground" : ""}`}
            style={
              browse ? undefined : { background: colors.bg, color: colors.fg }
            }
            onPointerUp={(event) => {
              // Verse numbers select their verse themselves (selectVerse).
              if (
                event.target instanceof Element &&
                event.target.closest("button")
              )
                return;
              setTimeout(readSelection, 10);
            }}
          >
            {/* The popover lives in the scrolled content, so it moves with the text. */}
            <div ref={hostRef} className="relative min-h-full">
              {browse && contents && (
                <ScriptureBrowse
                  corpusId={corpusId}
                  contents={contents}
                  level={browse}
                  annotations={annotations}
                  continueAt={continueAt}
                  onNavigate={showBrowse}
                  onOpenChapter={(bookSlug, number) =>
                    void goTo({ bookSlug, chapter: number })
                  }
                />
              )}
              {!browse && chapter && (
                <article
                  className={`mx-auto max-w-[720px] px-6 font-serif transition-opacity sm:px-10 ${immersive ? "py-6" : "py-8"} ${
                    turning ? "opacity-60" : ""
                  }`}
                  style={{
                    fontSize: `${(fontSizePct / 100) * 1.125}rem`,
                    lineHeight,
                  }}
                >
                  <header className="mb-6 text-center">
                    {chapter.chapter === 1 &&
                      chapter.book.fullTitle !== chapter.book.name && (
                        <div className="text-[0.8em] uppercase tracking-wide opacity-70">
                          {chapter.book.fullTitle}
                        </div>
                      )}
                    <h1 className="mt-1 text-[1.4em] font-semibold">
                      {chapter.book.chapterCount > 1
                        ? `${chapter.chapterLabel} ${chapter.chapter}`
                        : chapter.book.name}
                    </h1>
                    {chapter.chapter === 1 && chapter.book.heading && (
                      <p className="mx-auto mt-3 max-w-prose text-[0.85em] italic opacity-80">
                        {chapter.book.heading}
                      </p>
                    )}
                  </header>
                  {chapter.verses.map((verse) => {
                    const focused =
                      focusVerses &&
                      verse.verse >= focusVerses.start &&
                      verse.verse <= focusVerses.end;
                    const segments = segmentVerse(
                      verse.text,
                      marksForVerse(
                        annotations,
                        chapter.book.slug,
                        chapter.chapter,
                        verse.verse,
                        verse.text.length,
                      ),
                    );
                    return (
                      <p
                        key={verse.verse}
                        data-verse={verse.verse}
                        className={`mb-3 rounded transition-colors duration-700 ${focused ? "bg-primary/15" : ""}`}
                      >
                        <button
                          type="button"
                          title="Select this verse"
                          onClick={(event) =>
                            selectVerse(
                              verse.verse,
                              event.currentTarget.parentElement ??
                                event.currentTarget,
                            )
                          }
                          className="mr-1.5 select-none align-super text-[0.65em] font-semibold opacity-60 hover:opacity-100"
                          style={{ color: colors.link }}
                        >
                          {verse.verse}
                        </button>
                        <span data-verse-text>
                          {segments.map((segment) =>
                            segment.marks.length ? (
                              <span
                                key={segment.start}
                                data-annotation={
                                  segment.marks[segment.marks.length - 1]
                                    .annotationId
                                }
                                onClick={() => {
                                  if (window.getSelection()?.isCollapsed)
                                    openSideView("notes");
                                }}
                                className="cursor-pointer rounded-sm"
                                style={Object.assign(
                                  {},
                                  ...segment.marks.map((item) =>
                                    markInlineStyle(item.color, tone),
                                  ),
                                )}
                                title={
                                  segment.marks
                                    .map((item) =>
                                      annotationsById
                                        .get(item.annotationId)
                                        ?.body?.trim(),
                                    )
                                    .filter(Boolean)
                                    .join("\n") || undefined
                                }
                              >
                                {segment.text}
                              </span>
                            ) : (
                              <Fragment key={segment.start}>
                                {segment.text}
                              </Fragment>
                            ),
                          )}
                        </span>
                      </p>
                    );
                  })}
                  <nav className="mt-10 flex items-center justify-between gap-3 border-t border-current/10 pt-4 font-sans text-xs opacity-80">
                    {prev ? (
                      <button
                        type="button"
                        onClick={() => void goTo(prev)}
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" /> {prev.label}
                      </button>
                    ) : (
                      <span />
                    )}
                    {next && (
                      <button
                        type="button"
                        onClick={() => void goTo(next)}
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        {next.label} <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </nav>
                </article>
              )}
              {selection && chapter && !browse && (
                <MarkPopover
                  key={`${selection.verseStart}:${selection.start}-${selection.verseEnd}:${selection.end}`}
                  x={selection.x}
                  y={selection.y}
                  highlightColor={highlightColor}
                  onMark={mark}
                  onNote={(body) =>
                    void createAnnotation(
                      "note",
                      markValue("highlight", parseMark(highlightColor).color),
                      body,
                    )
                  }
                  onCopy={() => {
                    const ref = selectionRef(selection);
                    const citation = `“${selection.text}” (${ref ? label(ref) : title})`;
                    void navigator.clipboard
                      .writeText(citation)
                      .then(() => toast.success("Copied"));
                    clearSelection();
                  }}
                />
              )}
            </div>
          </div>

          {phase === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {phase === "error" && (
            <div className="absolute inset-0 flex items-center justify-center bg-background p-6">
              <div className="max-w-md text-center">
                <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />
                <p className="mt-2 text-sm">{errorMessage}</p>
              </div>
            </div>
          )}
        </div>

        {immersive && drawerOpen && openBook && (
          <aside className="w-80 shrink-0 border-l border-black/10 dark:border-white/10">
            <ReaderBookSidebar
              contentId={contentId}
              book={openBook}
              about={null}
              onClose={() => setDrawerOpen(false)}
            />
          </aside>
        )}
      </div>

      {/* Adjacent chapters + position in the whole collection */}
      {!browse && (
        <div className="flex items-center gap-2 border-t border-black/10 px-2 py-1 text-[11px] text-muted-foreground dark:border-white/10">
          <button
            type="button"
            disabled={!prev}
            onClick={() => prev && void goTo(prev)}
            className={pageButton}
            title="Previous chapter (←)"
          >
            <ChevronLeft className="h-3.5 w-3.5 shrink-0" />{" "}
            <span className="truncate">{prev?.label ?? "Prev"}</span>
          </button>
          <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div
              className="h-full bg-primary/60"
              style={{
                width: `${Math.round((chapter?.fraction ?? 0) * 100)}%`,
              }}
            />
          </div>
          <span>{Math.round((chapter?.fraction ?? 0) * 100)}%</span>
          <button
            type="button"
            disabled={!next}
            onClick={() => next && void goTo(next)}
            className={pageButton}
            title="Next chapter (→)"
          >
            <span className="truncate">{next?.label ?? "Next"}</span>{" "}
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          </button>
        </div>
      )}
    </div>
  );
}

/** The toolbar title while browsing: the level you're on. */
function browseTitle(
  level: ScriptureBrowseLevel,
  contents: ScriptureContents,
): string {
  if (level.level === "home") return contents.corpus.title;
  if (level.level === "volume") {
    return (
      contents.volumes.find((volume) => volume.slug === level.volume)?.title ??
      contents.corpus.title
    );
  }
  return (
    contents.volumes
      .flatMap((volume) => volume.books)
      .find((entry) => entry.slug === level.bookSlug)?.name ??
    contents.corpus.title
  );
}

/** The levels above where you are, each a way back up (empty at the top). */
function pathTo(
  browse: ScriptureBrowseLevel | null,
  readingBook: ScriptureBookInfo | null,
  contents: ScriptureContents | null,
  go: (level: ScriptureBrowseLevel) => void,
): ScriptureCrumb[] {
  if (!contents) return [];
  const books = contents.volumes.flatMap((volume) => volume.books);
  const volumeCrumb = (book: ScriptureBookInfo): ScriptureCrumb => ({
    label: book.volumeTitle,
    onClick: () => go({ level: "volume", volume: book.volume }),
  });
  // The collection is implied (home icon); the path starts at the volume.
  if (!browse && readingBook) {
    return readingBook.chapterCount > 1
      ? [
          volumeCrumb(readingBook),
          {
            label: readingBook.name,
            onClick: () => go({ level: "book", bookSlug: readingBook.slug }),
          },
        ]
      : [volumeCrumb(readingBook)];
  }
  if (browse?.level === "book") {
    const book = books.find((entry) => entry.slug === browse.bookSlug);
    return book ? [volumeCrumb(book)] : [];
  }
  return [];
}

/** Anchor kind for the reader's browse views in the Back/Forward history. */
const VIEW_ANCHOR_KIND = "scripture-view";

function browseAnchor(level: ScriptureBrowseLevel): string {
  if (level.level === "home") return `${VIEW_ANCHOR_KIND}:home`;
  if (level.level === "volume")
    return `${VIEW_ANCHOR_KIND}:volume/${level.volume}`;
  return `${VIEW_ANCHOR_KIND}:book/${level.bookSlug}`;
}

function browseLevelFromAnchor(
  anchor: LinkAnchor,
): ScriptureBrowseLevel | null {
  if (anchor.kind !== VIEW_ANCHOR_KIND) return null;
  if (anchor.id === "home") return { level: "home" };
  const [kind, slug] = anchor.id.split("/");
  if (kind === "volume" && slug) return { level: "volume", volume: slug };
  if (kind === "book" && slug) return { level: "book", bookSlug: slug };
  return null;
}

function anchorRef(anchor: LinkAnchor): ScriptureRef | null {
  return anchor.kind === VERSE_ANCHOR_KIND ? parseVerseHref(anchor.id) : null;
}
