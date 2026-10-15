"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  FolderOpen,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type {
  BookMetaDto,
  BookSourceInfo,
  CatalogEntry,
  CatalogPage,
} from "@/lib/domain/reader/types";
import { READER_LIBRARY_CONTENT_ID } from "../manifest";
import { readerApi } from "../lib/api";
import { revealReaderSidebar } from "../lib/sidebar";
import { openBookTab, useAcquire } from "../lib/use-acquire";
import { READER_BOOKS_CHANGED_EVENT } from "../state/bookshelf-store";
import { useReaderSession } from "../state/reader-store";
import { BOOK_TILE_GRID, BookTile } from "./BookTile";
import { FORMAT_LABELS } from "./CatalogEntryCard";
import { ConnectionsPanel, ImportPanel } from "./IntegrationsPanel";

type LibraryTab = "books" | "find" | "catalogs" | "import" | "connections";

const TABS: Array<{ id: LibraryTab; label: string }> = [
  { id: "books", label: "My books" },
  { id: "find", label: "Find books" },
  { id: "catalogs", label: "Catalogs" },
  { id: "import", label: "Import highlights" },
  { id: "connections", label: "Connections" },
];

const DEFAULT_SOURCE_ID = "opds:preset:gutenberg";

const STATUS_LABELS: Record<string, string> = {
  want: "Want to read",
  reading: "Reading",
  finished: "Finished",
  reference: "Reference",
};

/** Sources (Google Books especially) repeat a volume within and across pages. */
function entryKey(entry: CatalogEntry): string {
  return `${entry.id}\u0000${entry.title}`;
}

function uniqueEntries(entries: CatalogEntry[]): CatalogEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = entryKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstReadableIndex(entry: CatalogEntry): number {
  return entry.acquisitions.findIndex((acquisition) => FORMAT_LABELS[acquisition.type.split(";")[0]]);
}

/** Show a book in the right sidebar's Book tab. */
function useSelectInSidebar() {
  const setSelection = useReaderSession((state) => state.setSidebarSelection);
  return useCallback(
    (selection: Parameters<typeof setSelection>[1]) => {
      setSelection(READER_LIBRARY_CONTENT_ID, selection);
      revealReaderSidebar(READER_LIBRARY_CONTENT_ID);
    },
    [setSelection]
  );
}

function ResultsList({
  page,
  sourceId,
  onMore,
  loadingMore,
  onNavigate,
}: {
  page: CatalogPage;
  sourceId: string;
  onMore?: () => void;
  loadingMore?: boolean;
  onNavigate?: (href: string, title: string) => void;
}) {
  const acquire = useAcquire();
  const select = useSelectInSidebar();
  const selection = useReaderSession(
    (state) => state.sidebarSelection[READER_LIBRARY_CONTENT_ID] ?? null
  );
  const selectedKey = selection?.kind === "entry" ? entryKey(selection.entry) : null;
  const entries = uniqueEntries(page.entries);
  return (
    <div className="space-y-3">
      {page.navigation.length > 0 && onNavigate && (
        <ul className="grid gap-1 sm:grid-cols-2">
          {page.navigation.map((nav) => (
            <li key={nav.href}>
              <button
                type="button"
                onClick={() => onNavigate(nav.href, nav.title)}
                className="flex w-full items-start gap-2 rounded border border-black/10 p-2 text-left text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
              >
                <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium">{nav.title}</span>
                  {nav.summary && (
                    <span className="block text-xs text-muted-foreground line-clamp-1">{nav.summary}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {entries.length > 0 && (
        <div className={BOOK_TILE_GRID}>
          {entries.map((entry) => {
            const readable = firstReadableIndex(entry);
            return (
              <BookTile
                key={entryKey(entry)}
                title={entry.title}
                authors={entry.authors}
                coverUrl={entry.coverUrl}
                badge={entry.license}
                selected={selectedKey === entryKey(entry)}
                onSelect={() => select({ kind: "entry", sourceId, entry })}
                onQuickAdd={readable >= 0 ? () => acquire(sourceId, entry, readable) : undefined}
              />
            );
          })}
        </div>
      )}
      {entries.length === 0 && page.navigation.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No books found. Try a specific title or author — very common words like &quot;the&quot; are
          ignored by most catalogs.
        </p>
      )}
      {page.nextHref && onMore && (
        <button
          type="button"
          onClick={onMore}
          disabled={loadingMore}
          className="h-8 rounded border border-black/10 px-3 text-xs dark:border-white/10"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

function MyBooks({ onFind }: { onFind: () => void }) {
  const [books, setBooks] = useState<BookMetaDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const select = useSelectInSidebar();
  const selection = useReaderSession(
    (state) => state.sidebarSelection[READER_LIBRARY_CONTENT_ID] ?? null
  );
  const selectedId = selection?.kind === "book" ? selection.book.contentId : null;

  useEffect(() => {
    const reload = () => setVersion((current) => current + 1);
    window.addEventListener(READER_BOOKS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(READER_BOOKS_CHANGED_EVENT, reload);
  }, []);

  useEffect(() => {
    let cancelled = false;
    readerApi
      .books()
      .then((data) => {
        if (!cancelled) {
          setBooks(data.books);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Could not load your books");
        setBooks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (!books) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (error) return <p className="text-sm text-muted-foreground">{error}</p>;
  if (books.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-black/15 p-6 text-center dark:border-white/15">
        <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm">No books yet.</p>
        <p className="text-xs text-muted-foreground">
          Find a free book, connect your OPDS library, or upload an EPUB into any folder — EPUBs open
          here automatically.
        </p>
        <button
          type="button"
          onClick={onFind}
          className="mt-3 h-8 rounded bg-primary px-3 text-xs font-medium text-primary-foreground"
        >
          Find books
        </button>
      </div>
    );
  }
  return (
    <div className={BOOK_TILE_GRID}>
      {books.map((book) => (
        <BookTile
          key={book.contentId}
          title={book.title}
          authors={book.authors}
          coverUrl={book.coverUrl}
          status={
            [book.kind === "link" ? "Link" : null, book.readingStatus ? STATUS_LABELS[book.readingStatus] : null]
              .filter(Boolean)
              .join(" · ") || null
          }
          selected={selectedId === book.contentId}
          onSelect={() => select({ kind: "book", book })}
          onOpen={() => openBookTab(book.contentId, book.title, book.kind ?? "file")}
        />
      ))}
    </div>
  );
}

function FindBooks({ sources }: { sources: BookSourceInfo[] }) {
  // Gutenberg's own catalog first: fast and reliable (Gutendex is a slower mirror).
  const searchable = useMemo(
    () =>
      sources
        .filter((source) => source.searchable)
        .sort((a, b) => Number(b.id === DEFAULT_SOURCE_ID) - Number(a.id === DEFAULT_SOURCE_ID)),
    [sources]
  );
  const [sourceId, setSourceId] = useState(DEFAULT_SOURCE_ID);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<CatalogPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const source = searchable.find((candidate) => candidate.id === sourceId);

  // Only the newest request may write results: a slow earlier search (or
  // "Load more") resolving late must not overwrite or append to a newer one.
  const requestSeq = useRef(0);

  const run = async () => {
    if (!query.trim()) return;
    const seq = ++requestSeq.current;
    setPage(null);
    setLoading(true);
    try {
      const result = await readerApi.search(sourceId, query);
      if (seq === requestSeq.current) setPage({ ...result, entries: uniqueEntries(result.entries) });
    } catch (error) {
      if (seq === requestSeq.current) {
        toast.error(error instanceof Error ? error.message : "Search failed");
        setPage(null);
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  };

  const more = async () => {
    if (!page?.nextHref) return;
    const seq = requestSeq.current;
    setLoadingMore(true);
    try {
      const next = await readerApi.search(sourceId, query, page.nextHref);
      if (seq !== requestSeq.current) return;
      setPage({
        ...next,
        entries: uniqueEntries([...page.entries, ...next.entries]),
        navigation: page.navigation,
      });
    } catch (error) {
      if (seq === requestSeq.current) {
        toast.error(error instanceof Error ? error.message : "Could not load more");
      }
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <select
          aria-label="Source"
          value={sourceId}
          onChange={(event) => {
            requestSeq.current++;
            setSourceId(event.target.value);
            setPage(null);
            setLoading(false);
          }}
          className="h-9 rounded border border-black/10 bg-transparent px-2 text-sm dark:border-white/10"
        >
          {searchable.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </select>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title, author or subject"
            className="h-9 w-full rounded border border-black/10 bg-transparent pl-8 pr-2 text-sm dark:border-white/10"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="h-9 rounded bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      {source && <p className="text-xs text-muted-foreground">{source.description}</p>}
      {page && (
        <>
          {page.total !== undefined && (
            <p className="text-xs text-muted-foreground">{page.total.toLocaleString()} results</p>
          )}
          <ResultsList
            page={page}
            sourceId={sourceId}
            onMore={more}
            loadingMore={loadingMore}
            onNavigate={
              sourceId.startsWith("opds:")
                ? async (href) => {
                    const seq = ++requestSeq.current;
                    setLoading(true);
                    try {
                      const result = await readerApi.browse(sourceId, href);
                      if (seq === requestSeq.current) setPage(result);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not open that entry");
                    } finally {
                      setLoading(false);
                    }
                  }
                : undefined
            }
          />
        </>
      )}
    </div>
  );
}

interface BrowseFrame {
  title: string;
  href?: string;
  page: CatalogPage;
}

function Catalogs({
  sources,
  onChanged,
}: {
  sources: BookSourceInfo[];
  onChanged: () => void;
}) {
  const catalogs = sources.filter((source) => source.browsable);
  const [active, setActive] = useState<BookSourceInfo | null>(null);
  const [stack, setStack] = useState<BrowseFrame[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ url: "", name: "", username: "", password: "" });
  const [adding, setAdding] = useState(false);
  const [loginFor, setLoginFor] = useState<BookSourceInfo | null>(null);
  const [login, setLogin] = useState({ username: "", password: "" });
  const [signingIn, setSigningIn] = useState(false);

  const open = async (source: BookSourceInfo, href?: string, title?: string) => {
    if (!href && source.requiresLogin && !source.custom) {
      setLoginFor(source);
      return;
    }
    setLoading(true);
    try {
      const page = await readerApi.browse(source.id, href);
      setActive(source);
      setStack((current) => [
        ...(href ? current : []),
        { title: title ?? page.title ?? source.label, href, page },
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the catalog");
    } finally {
      setLoading(false);
    }
  };

  if (active && stack.length > 0) {
    const frame = stack[stack.length - 1];
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => {
              if (stack.length > 1) setStack(stack.slice(0, -1));
              else {
                setActive(null);
                setStack([]);
              }
            }}
            className="inline-flex items-center gap-1 rounded px-1 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <span className="text-muted-foreground">{active.label}</span>
          {stack.slice(1).map((item) => (
            <span key={item.href} className="text-muted-foreground">
              / {item.title}
            </span>
          ))}
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <ResultsList
          page={frame.page}
          sourceId={active.id}
          onNavigate={(href, title) => void open(active, href, title)}
          onMore={
            frame.page.nextHref
              ? async () => {
                  try {
                    const next = await readerApi.browse(active.id, frame.page.nextHref);
                    setStack([
                      ...stack.slice(0, -1),
                      {
                        ...frame,
                        page: {
                          ...next,
                          entries: uniqueEntries([...frame.page.entries, ...next.entries]),
                          navigation: [...frame.page.navigation, ...next.navigation],
                        },
                      },
                    ]);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not load more");
                  }
                }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ul className="grid gap-2 sm:grid-cols-2">
        {catalogs.map((catalog) => (
          <li
            key={catalog.id}
            className="flex items-start justify-between gap-2 rounded-lg border border-black/10 p-3 dark:border-white/10"
          >
            <button type="button" onClick={() => void open(catalog)} className="flex-1 text-left">
              <span className="text-sm font-semibold">{catalog.label}</span>
              <span className="block text-xs text-muted-foreground line-clamp-2">{catalog.description}</span>
              {catalog.requiresLogin && !catalog.custom && (
                <span className="mt-1 inline-block rounded bg-amber-500/10 px-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                  Sign-in required
                </span>
              )}
            </button>
            {catalog.custom && (
              <button
                type="button"
                aria-label={`Remove ${catalog.label}`}
                onClick={async () => {
                  await readerApi.deleteCatalog(catalog.id);
                  onChanged();
                }}
                className="text-muted-foreground hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {loginFor?.requiresLogin && (
        <form
          className="space-y-2 rounded-lg border border-primary/40 p-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!loginFor.feedUrl) return;
            setSigningIn(true);
            try {
              await readerApi.addCatalog({
                url: loginFor.feedUrl,
                name: loginFor.label,
                username: login.username.trim(),
                password: login.password || undefined,
              });
              toast.success(`${loginFor.label} connected`);
              setLoginFor(null);
              setLogin({ username: "", password: "" });
              onChanged();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Sign-in failed");
            } finally {
              setSigningIn(false);
            }
          }}
        >
          <h3 className="text-sm font-semibold">Sign in to {loginFor.label}</h3>
          <p className="text-xs text-muted-foreground">
            {loginFor.requiresLogin.hint}
            {loginFor.requiresLogin.signupUrl && (
              <>
                {" "}
                <a
                  href={loginFor.requiresLogin.signupUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  Learn more
                </a>
              </>
            )}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              required
              autoFocus
              autoComplete="username"
              placeholder={loginFor.requiresLogin.usernameLabel}
              value={login.username}
              onChange={(event) => setLogin({ ...login, username: event.target.value })}
              className="h-8 rounded border border-black/10 bg-transparent px-2 text-xs dark:border-white/10"
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder={loginFor.requiresLogin.passwordLabel ?? "Password"}
              value={login.password}
              onChange={(event) => setLogin({ ...login, password: event.target.value })}
              className="h-8 rounded border border-black/10 bg-transparent px-2 text-xs dark:border-white/10"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={signingIn || !login.username.trim()}
              className="h-8 rounded bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {signingIn ? "Checking…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => setLoginFor(null)}
              className="h-8 rounded px-3 text-xs text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <form
        className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10"
        onSubmit={async (event) => {
          event.preventDefault();
          setAdding(true);
          try {
            await readerApi.addCatalog({
              url: form.url.trim(),
              name: form.name.trim() || undefined,
              username: form.username || undefined,
              password: form.password || undefined,
            });
            setForm({ url: "", name: "", username: "", password: "" });
            toast.success("Catalog added");
            onChanged();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not add the catalog");
          } finally {
            setAdding(false);
          }
        }}
      >
        <h3 className="flex items-center gap-1 text-sm font-semibold">
          <Plus className="h-4 w-4" /> Add your library (OPDS)
        </h3>
        <p className="text-xs text-muted-foreground">
          Calibre content server: <code>https://your-host/opds</code> · Kavita:{" "}
          <code>…/api/opds/&lt;api-key&gt;</code> · Komga: <code>…/opds/v2/catalog</code> · any OPDS
          feed. A server on your home network must be reachable from the internet (e.g. Tailscale
          Funnel or Cloudflare Tunnel) — private addresses are blocked.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            required
            type="url"
            placeholder="Catalog URL"
            value={form.url}
            onChange={(event) => setForm({ ...form, url: event.target.value })}
            className="h-8 rounded border border-black/10 bg-transparent px-2 text-xs dark:border-white/10 sm:col-span-2"
          />
          <input
            placeholder="Name (optional)"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className="h-8 rounded border border-black/10 bg-transparent px-2 text-xs dark:border-white/10 sm:col-span-2"
          />
          <input
            placeholder="Username (optional)"
            autoComplete="off"
            value={form.username}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
            className="h-8 rounded border border-black/10 bg-transparent px-2 text-xs dark:border-white/10"
          />
          <input
            type="password"
            placeholder="Password (optional)"
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            className="h-8 rounded border border-black/10 bg-transparent px-2 text-xs dark:border-white/10"
          />
        </div>
        <button
          type="submit"
          disabled={adding || !form.url}
          className="h-8 rounded bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {adding ? "Checking feed…" : "Add catalog"}
        </button>
      </form>
    </div>
  );
}

export function LibraryView() {
  const [tab, setTab] = useState<LibraryTab>("books");
  const [sources, setSources] = useState<BookSourceInfo[]>([]);
  const [tablesReady, setTablesReady] = useState(true);
  const targetParentId = useReaderSession((state) => state.libraryTargetParentId);

  const [sourcesVersion, setSourcesVersion] = useState(0);
  const reloadSources = useCallback(() => setSourcesVersion((version) => version + 1), []);

  useEffect(() => {
    let cancelled = false;
    readerApi
      .sources()
      .then((data) => {
        if (cancelled) return;
        setSources(data.sources);
        setTablesReady(data.tablesReady);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Could not load book sources");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sourcesVersion]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-black/10 px-6 pb-2 pt-5 dark:border-white/10">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <BookOpen className="h-5 w-5" /> Library
        </h1>
        <p className="text-xs text-muted-foreground">
          Books you add are saved as ordinary files{" "}
          {targetParentId ? "in the folder you opened the Library from" : "at the top of your file tree"} —
          read and mark them up here.
        </p>
        <nav className="mt-3 flex flex-wrap gap-1" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                tab === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      {!tablesReady && (
        <div className="mx-6 mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            The reader&apos;s database tables haven&apos;t been migrated yet, so saving books, progress and
            highlights is unavailable. Apply{" "}
            <code>docs/notes-feature/work-tracking/reader-schema-additions.prisma</code> and run the
            reader migration.
          </span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {tab === "books" && <MyBooks onFind={() => setTab("find")} />}
        {tab === "find" && <FindBooks sources={sources} />}
        {tab === "catalogs" && <Catalogs sources={sources} onChanged={reloadSources} />}
        {tab === "import" && <ImportPanel />}
        {tab === "connections" && <ConnectionsPanel />}
      </div>
    </div>
  );
}
