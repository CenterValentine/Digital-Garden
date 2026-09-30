"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Info, List, Loader2, NotebookPen, Search, Settings2, X, type LucideIcon } from "lucide-react";
import {
  useReaderPreferences,
  useReaderSession,
  type ReaderOpenBook,
  type ReaderSidebarView,
  type ReaderTocItem,
} from "../state/reader-store";
import { AnnotationsPanel } from "./AnnotationsPanel";

/** Icon rail, styled like the sidebar's own tab rail above it. */
const VIEWS: Array<{ id: ReaderSidebarView; label: string; icon: LucideIcon }> = [
  { id: "contents", label: "Contents", icon: List },
  { id: "search", label: "Search", icon: Search },
  { id: "notes", label: "Highlights & notes", icon: NotebookPen },
  { id: "settings", label: "Display settings", icon: Settings2 },
  { id: "about", label: "About this book", icon: Info },
];

/**
 * The open book's side views — highlights & notes, contents, display
 * settings, details. Rendered in the app's right sidebar (Book tab); in full
 * screen, where that sidebar is out of view, the reader shows the same
 * component as a drawer.
 */
export function ReaderBookSidebar({
  contentId,
  book,
  about,
  onClose,
}: {
  contentId: string;
  book: ReaderOpenBook;
  /** Details panel; absent while the book's metadata loads. */
  about: ReactNode | null;
  /** Drawer mode (full screen): a close button. */
  onClose?: () => void;
}) {
  const stored = useReaderSession((state) => state.sidebarView[contentId] ?? "notes");
  const setView = useReaderSession((state) => state.setSidebarView);
  const view = stored === "about" && !about ? "notes" : stored;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-stretch border-b border-black/10 dark:border-white/10" role="tablist">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            aria-label={label}
            title={label}
            disabled={(id === "about" && !about) || (id === "search" && !book.search)}
            onClick={() => setView(contentId, id)}
            className={`relative flex flex-1 items-center justify-center py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              view === id
                ? "border-b-2 border-gold-primary text-gold-primary"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            <Icon className="h-4 w-4" />
            {id === "notes" && book.annotations.length > 0 && (
              <span className="absolute right-[calc(50%-18px)] top-1 rounded-full bg-primary px-1 text-[9px] leading-tight text-primary-foreground">
                {book.annotations.length}
              </span>
            )}
          </button>
        ))}
        {onClose && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="px-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {view === "notes" && (
          <AnnotationsPanel
            hideTitle
            className="h-full"
            annotations={book.annotations}
            onGo={book.go}
            onDelete={book.remove}
            onUpdate={book.update}
            onSent={book.sent}
          />
        )}
        {view === "contents" && <ContentsView book={book} />}
        {view === "search" && book.search && <SearchView contentId={contentId} book={book} />}
        {view === "settings" && <DisplaySettings />}
        {view === "about" && about}
      </div>
    </div>
  );
}

/** The book's table of contents (sidebar view, and the reader's left panel). */
export function ContentsView({ book, onNavigate }: { book: ReaderOpenBook; onNavigate?: () => void }) {
  if (!book.toc.length) {
    return <p className="p-3 text-xs text-muted-foreground">This book has no table of contents.</p>;
  }
  const renderItems = (items: ReaderTocItem[], depth = 0) => (
    <ul className={depth ? "ml-3 border-l border-black/10 pl-2 dark:border-white/10" : ""}>
      {items.map((item) => (
        <li key={`${item.href}-${item.label}`}>
          <button
            type="button"
            onClick={() => {
              book.goToHref(item.href);
              onNavigate?.();
            }}
            className={`w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5 ${
              item.label === book.currentLabel ? "font-semibold text-primary" : ""
            }`}
          >
            {item.label}
          </button>
          {item.subitems?.length ? renderItems(item.subitems, depth + 1) : null}
        </li>
      ))}
    </ul>
  );
  return <div className="h-full overflow-auto p-2">{renderItems(book.toc)}</div>;
}

/** Typography, theme and layout — reader preferences, shared by every book. */
function DisplaySettings() {
  const fontSizePct = useReaderPreferences((state) => state.fontSizePct);
  const lineHeight = useReaderPreferences((state) => state.lineHeight);
  const theme = useReaderPreferences((state) => state.theme);
  const flow = useReaderPreferences((state) => state.flow);
  const setFontSizePct = useReaderPreferences((state) => state.setFontSizePct);
  const setLineHeight = useReaderPreferences((state) => state.setLineHeight);
  const setTheme = useReaderPreferences((state) => state.setTheme);
  const setFlow = useReaderPreferences((state) => state.setFlow);

  const choice = (active: boolean) =>
    `rounded border px-2 py-1 capitalize ${active ? "border-primary" : "border-black/10 dark:border-white/10"}`;

  return (
    <div className="h-full space-y-4 overflow-auto p-3 text-xs">
      <label className="block">
        <span className="text-muted-foreground">Text size — {fontSizePct}%</span>
        <input
          type="range"
          min={70}
          max={200}
          step={5}
          value={fontSizePct}
          onChange={(event) => setFontSizePct(Number(event.target.value))}
          className="w-full"
        />
      </label>
      <label className="block">
        <span className="text-muted-foreground">Line spacing — {lineHeight.toFixed(2)}</span>
        <input
          type="range"
          min={1.1}
          max={2.2}
          step={0.05}
          value={lineHeight}
          onChange={(event) => setLineHeight(Number(event.target.value))}
          className="w-full"
        />
      </label>
      <div>
        <span className="text-muted-foreground">Theme</span>
        <div className="mt-1 grid grid-cols-2 gap-1">
          {(["system", "light", "sepia", "dark"] as const).map((option) => (
            <button key={option} type="button" onClick={() => setTheme(option)} className={choice(theme === option)}>
              {option}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="text-muted-foreground">Layout</span>
        <div className="mt-1 grid grid-cols-2 gap-1">
          {(["paginated", "scrolled"] as const).map((option) => (
            <button key={option} type="button" onClick={() => setFlow(option)} className={choice(flow === option)}>
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Full-text search in what's open (a book, a scripture collection) — its own
 * view in the sidebar rail, like Contents. The open item supplies the search
 * (ReaderOpenBook.search); results stream in and keep across view switches.
 */
function SearchView({ contentId, book }: { contentId: string; book: ReaderOpenBook }) {
  const search = book.search!;
  const saved = useReaderSession((state) => state.searches[contentId] ?? null);
  const setSearch = useReaderSession((state) => state.setSearch);
  const [query, setQuery] = useState(saved?.query ?? "");
  const [running, setRunning] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelRef.current?.(), []);

  const run = (text: string) => {
    const q = text.trim();
    cancelRef.current?.();
    if (!q) {
      search.clear?.();
      setSearch(contentId, null);
      return;
    }
    setRunning(true);
    setSearch(contentId, { query: q, hits: [], done: false });
    cancelRef.current = search.run(q, (hits, done, note) => {
      setSearch(contentId, { query: q, hits, done, note });
      if (done) setRunning(false);
    });
  };

  const hits = saved?.hits ?? [];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        className="border-b border-black/10 p-2 dark:border-white/10"
        onSubmit={(event) => {
          event.preventDefault();
          run(query);
        }}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={search.placeholder}
            aria-label="Search"
            className="h-8 w-full rounded border border-black/10 bg-transparent pl-7 pr-7 text-sm dark:border-white/10"
          />
          {running && (
            <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
      </form>
      <div className="min-h-0 flex-1 overflow-auto p-2 text-xs">
        {saved && (
          <p className="px-2 pb-2 text-muted-foreground">
            {saved.note ??
              (hits.filter((hit) => hit.kind !== "jump").length === 0
                ? saved.done
                  ? "No matches."
                  : "Searching…"
                : `${hits.filter((hit) => hit.kind !== "jump").length} match${hits.length === 1 ? "" : "es"}${saved.done ? "" : "…"}`)}
          </p>
        )}
        {hits.map((hit) => (
          <button
            key={hit.id}
            type="button"
            onClick={() => search.go(hit)}
            className={`mb-1 block w-full rounded px-2 py-1 text-left hover:bg-black/5 dark:hover:bg-white/5 ${
              hit.kind === "jump" ? "border border-primary/30 bg-primary/5" : ""
            }`}
          >
            <span className="font-medium">{hit.label}</span>
            {hit.excerpt && (
              <span className="line-clamp-3 text-muted-foreground">
                {hit.excerpt.pre}
                <mark className="rounded-sm bg-yellow-300/60 px-0.5 text-foreground dark:bg-yellow-500/40">{hit.excerpt.match}</mark>
                {hit.excerpt.post}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

