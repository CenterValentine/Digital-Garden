"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { BookOpen, ChevronRight, Loader2, NotebookPen } from "lucide-react";
import type { ReaderAnnotationDto } from "@/lib/domain/reader/types";
import {
  volumeCover,
  type VolumeCoverStyle,
} from "@/lib/domain/scripture/covers";
import {
  parseVerseHref,
  type ScriptureBookChapters,
  type ScriptureBookInfo,
  type ScriptureContents,
} from "@/lib/domain/scripture/types";
import { scriptureApi } from "../lib/api";

/**
 * Browsing a scripture collection before reading: volumes as bound-book
 * covers → a volume's books → a book's chapters → (the reader) verses.
 * The contents panel beside the text stays the quick jump; this is the
 * default way in.
 */
export type ScriptureBrowseLevel =
  | { level: "home" }
  | { level: "volume"; volume: string }
  | { level: "book"; bookSlug: string };

export interface ScriptureCrumb {
  label: string;
  onClick?: () => void;
}

/** "Book of Mormon › Alma › 32" — every step but the last goes back up. */
export function ScriptureCrumbs({
  items,
  compact = false,
}: {
  items: ScriptureCrumb[];
  compact?: boolean;
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center gap-1 font-sans text-muted-foreground ${compact ? "flex-nowrap text-[11px]" : "flex-wrap text-xs"}`}
    >
      {items.map((item, index) => (
        <span
          key={`${index}-${item.label}`}
          className="inline-flex items-center gap-1"
        >
          {index > 0 && (
            <ChevronRight className="h-3 w-3 opacity-60" aria-hidden />
          )}
          {item.onClick ? (
            <button
              type="button"
              onClick={item.onClick}
              className="rounded px-0.5 hover:text-foreground hover:underline"
            >
              {item.label}
            </button>
          ) : (
            <span className="px-0.5 text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Width budget for one line of lettering, in cover-widths (cqw) — inside the inner border. */
const LETTERING_BUDGET_CQW = 62;
/** Average uppercase serif advance, in em, before tracking. */
const CAP_ADVANCE_EM = 0.7;

/**
 * Split "1 Thessalonians" into a small ordinal line and the name, the way
 * printed editions set numbered books.
 */
function splitOrdinal(title: string): { ordinal: string | null; name: string } {
  const match = /^(\d+|[IVX]+)\s+(.+)$/.exec(title.trim());
  return match
    ? { ordinal: match[1], name: match[2] }
    : { ordinal: null, name: title };
}

/**
 * Gold lettering sized to its longest word, so "THESSALONIANS" fits the
 * border as surely as "ENOS": font = min(the size's base, budget ÷ (longest
 * word × advance)), all in the cover's own width (cqw).
 */
function CoverLettering({
  title,
  foil,
  size,
}: {
  title: string;
  foil: string;
  size: "large" | "small";
}) {
  if (!title) return null;
  const { ordinal, name } = splitOrdinal(title);
  const longest = Math.max(...name.split(/\s+/).map((word) => word.length), 1);
  const tracking = longest > 9 ? 0.03 : size === "large" ? 0.12 : 0.08;
  const fit = LETTERING_BUDGET_CQW / (longest * (CAP_ADVANCE_EM + tracking));
  const base = size === "large" ? 8.6 : 9;
  const fontSize = `clamp(6px, ${Math.min(base, fit).toFixed(2)}cqw, ${size === "large" ? 15 : 11}px)`;
  const shadow = "0 1px 0 rgba(0,0,0,0.45)";
  return (
    <span
      className="flex flex-col items-center font-serif uppercase leading-snug"
      style={{ color: foil, textShadow: shadow }}
    >
      {ordinal && (
        <span
          style={{
            fontSize: `clamp(6px, ${(base * 0.8).toFixed(2)}cqw, 12px)`,
            letterSpacing: "0.1em",
          }}
        >
          {ordinal}
        </span>
      )}
      <span style={{ fontSize, letterSpacing: `${tracking}em` }}>{name}</span>
    </span>
  );
}

/** A bound-book cover: leather, a spine, a double foil border, gold lettering. */
function Cover({
  title,
  subtitle,
  style,
  size = "large",
}: {
  title: string;
  subtitle?: string;
  style: VolumeCoverStyle;
  size?: "large" | "small";
}) {
  const { leather, foil } = style;
  return (
    <div
      className="relative aspect-[3/4] w-full overflow-hidden rounded-l-[3px] rounded-r-md shadow-md transition-transform duration-200 group-hover:-translate-y-1 group-hover:shadow-xl"
      style={{
        // Lettering scales with the cover's own width (cqw), so a long title
        // never crowds the foil border on a narrow pane.
        containerType: "inline-size",
        background: [
          "radial-gradient(120% 80% at 30% 15%, rgba(255,255,255,0.10), transparent 60%)",
          "radial-gradient(140% 90% at 80% 110%, rgba(0,0,0,0.35), transparent 60%)",
          `linear-gradient(135deg, color-mix(in srgb, ${leather} 88%, white), ${leather} 45%, color-mix(in srgb, ${leather} 70%, black))`,
        ].join(", "),
      }}
    >
      {/* Spine */}
      <div
        className="absolute inset-y-0 left-0 w-[8%]"
        style={{
          background: `linear-gradient(90deg, color-mix(in srgb, ${leather} 55%, black), color-mix(in srgb, ${leather} 85%, black))`,
          boxShadow: `inset -1px 0 0 color-mix(in srgb, ${foil} 35%, transparent)`,
        }}
      />
      {/* Foil borders */}
      <div
        className="absolute inset-[8%] left-[15%] rounded-sm border"
        style={{ borderColor: `color-mix(in srgb, ${foil} 70%, transparent)` }}
      />
      <div
        className="absolute inset-[10.5%] left-[17.5%] rounded-sm border"
        style={{ borderColor: `color-mix(in srgb, ${foil} 35%, transparent)` }}
      />
      {/* Lettering */}
      <div className="absolute inset-[14%] left-[20%] flex flex-col items-center justify-center gap-2 text-center">
        <CoverLettering title={title} foil={foil} size={size} />
        <svg
          viewBox="0 0 60 8"
          className={size === "large" ? "w-12" : "w-8"}
          aria-hidden
        >
          <path
            d="M0 4 H24 M36 4 H60"
            stroke={foil}
            strokeWidth="0.8"
            opacity="0.8"
          />
          <path
            d="M30 0.5 L33.5 4 L30 7.5 L26.5 4 Z"
            fill={foil}
            opacity="0.9"
          />
        </svg>
        {subtitle && (
          <span
            className="font-serif text-[10px] italic opacity-80"
            style={{ color: foil }}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

/** Book chapters are fixed text: fetch each book's cards once per session. */
const chaptersCache = new Map<string, Promise<ScriptureBookChapters>>();

function loadBookChapters(
  corpusId: string,
  bookSlug: string,
): Promise<ScriptureBookChapters> {
  const key = `${corpusId}/${bookSlug}`;
  let cached = chaptersCache.get(key);
  if (!cached) {
    cached = scriptureApi.bookChapters(corpusId, bookSlug).catch((error) => {
      chaptersCache.delete(key);
      throw error;
    });
    chaptersCache.set(key, cached);
  }
  return cached;
}

/** How many of the user's marks fall in each "book/chapter". */
function markCounts(annotations: ReaderAnnotationDto[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const annotation of annotations) {
    if (annotation.kind === "bookmark" || !annotation.locator.href) continue;
    const ref = parseVerseHref(annotation.locator.href);
    if (!ref) continue;
    const key = `${ref.bookSlug}/${ref.chapter ?? 1}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function ScriptureBrowse({
  corpusId,
  contents,
  level,
  annotations,
  continueAt,
  onNavigate,
  onOpenChapter,
}: {
  corpusId: string;
  contents: ScriptureContents;
  level: ScriptureBrowseLevel;
  annotations: ReaderAnnotationDto[];
  /** Where the reader left off, for the "Continue reading" card. */
  continueAt: { bookSlug: string; chapter: number; label: string } | null;
  onNavigate: (level: ScriptureBrowseLevel) => void;
  onOpenChapter: (bookSlug: string, chapter: number) => void;
}) {
  const books = useMemo(
    () => contents.volumes.flatMap((volume) => volume.books),
    [contents],
  );
  const bookBySlug = useMemo(
    () => new Map(books.map((book) => [book.slug, book])),
    [books],
  );
  const marks = useMemo(() => markCounts(annotations), [annotations]);

  const openBook = (book: ScriptureBookInfo) =>
    book.chapterCount === 1
      ? onOpenChapter(book.slug, 1)
      : onNavigate({ level: "book", bookSlug: book.slug });

  if (level.level === "home") {
    const continueBook = continueAt
      ? bookBySlug.get(continueAt.bookSlug)
      : null;
    return (
      <div className="@container mx-auto max-w-5xl px-4 py-5 sm:px-6">
        {continueAt && continueBook && (
          <button
            type="button"
            onClick={() =>
              onOpenChapter(continueAt.bookSlug, continueAt.chapter)
            }
            className="group mb-5 flex w-full max-w-sm items-center gap-3 rounded-lg border border-black/10 px-3 py-2 text-left hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.04]"
          >
            <div className="w-7 shrink-0">
              <Cover
                title=""
                style={volumeCover(continueBook.volume)}
                size="small"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Continue reading
              </div>
              <div className="truncate font-serif text-base leading-tight">
                {continueAt.label}
                <span className="ml-2 font-sans text-xs text-muted-foreground">
                  {continueBook.volumeTitle}
                </span>
              </div>
            </div>
            <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        )}

        {/* The volumes share one row, sized to the pane (capped at 160px, never
            stretched); a phone-width pane takes three per row instead. */}
        <div
          className="grid grid-cols-3 gap-x-3 gap-y-5 @xl:gap-x-4 @xl:[grid-template-columns:repeat(var(--volumes),minmax(0,160px))]"
          style={
            {
              "--volumes": Math.min(contents.volumes.length, 6),
            } as CSSProperties
          }
        >
          {contents.volumes.map((volume) => (
            <button
              key={volume.slug}
              type="button"
              onClick={() =>
                onNavigate({ level: "volume", volume: volume.slug })
              }
              className="group self-start text-left"
            >
              <Cover title={volume.title} style={volumeCover(volume.slug)} />
              <div className="mt-2 text-sm font-medium">{volume.title}</div>
              <div className="text-xs text-muted-foreground">
                {volume.books.length}{" "}
                {volume.books.length === 1 ? "book" : "books"}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (level.level === "volume") {
    const volume = contents.volumes.find(
      (entry) => entry.slug === level.volume,
    );
    if (!volume) return null;
    const style = volumeCover(volume.slug);
    return (
      <div className="@container mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-x-3 gap-y-5 @md:grid-cols-[repeat(auto-fill,minmax(84px,104px))] @md:gap-x-4">
          {volume.books.map((book) => {
            const bookMarks = [...marks.entries()]
              .filter(([key]) => key.startsWith(`${book.slug}/`))
              .reduce((sum, [, count]) => sum + count, 0);
            return (
              <button
                key={book.slug}
                type="button"
                onClick={() => openBook(book)}
                className="group self-start text-left"
              >
                <Cover title={book.name} style={style} size="small" />
                <div className="mt-2 flex items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{book.name}</span>
                  {bookMarks > 0 && <MarkBadge count={bookMarks} />}
                </div>
                <div className="text-xs text-muted-foreground">
                  {book.chapterCount}{" "}
                  {volume.slug === "dc-testament"
                    ? book.chapterCount === 1
                      ? "section"
                      : "sections"
                    : book.chapterCount === 1
                      ? "chapter"
                      : "chapters"}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const book = bookBySlug.get(level.bookSlug);
  if (!book) return null;
  return (
    <BookChapters
      key={book.slug}
      corpusId={corpusId}
      book={book}
      marks={marks}
      onOpenChapter={onOpenChapter}
    />
  );
}

function BookChapters({
  corpusId,
  book,
  marks,
  onOpenChapter,
}: {
  corpusId: string;
  book: ScriptureBookInfo;
  marks: Map<string, number>;
  onOpenChapter: (bookSlug: string, chapter: number) => void;
}) {
  const [data, setData] = useState<ScriptureBookChapters | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadBookChapters(corpusId, book.slug)
      .then((loaded) => !cancelled && setData(loaded))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [book.slug, corpusId]);

  const label =
    data?.chapterLabel ??
    (book.volume === "dc-testament" ? "Section" : "Chapter");

  return (
    <div className="@container mx-auto max-w-5xl px-4 py-5 sm:px-6">
      {(book.fullTitle !== book.name || book.heading) && (
        <div className="mb-4 max-w-3xl font-serif text-sm text-muted-foreground">
          {book.fullTitle !== book.name && <div>{book.fullTitle}</div>}
          {book.heading && (
            <p className="mt-1 line-clamp-3 italic">{book.heading}</p>
          )}
        </div>
      )}

      {failed ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Couldn&apos;t load the chapters.
        </p>
      ) : !data ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 @md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] @md:gap-3">
          {data.chapters.map((chapter) => {
            const count = marks.get(`${book.slug}/${chapter.chapter}`) ?? 0;
            return (
              <button
                key={chapter.chapter}
                type="button"
                onClick={() => onOpenChapter(book.slug, chapter.chapter)}
                className="group flex flex-col rounded-lg border border-black/10 p-3 text-left transition hover:-translate-y-0.5 hover:border-black/20 hover:shadow-md dark:border-white/10 dark:hover:border-white/20"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {label}
                  </span>
                  <span className="font-serif text-2xl font-semibold leading-none">
                    {chapter.chapter}
                  </span>
                  {count > 0 && <MarkBadge count={count} />}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {chapter.verseCount} vv.
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 font-serif text-[13px] leading-snug text-muted-foreground group-hover:text-foreground">
                  {chapter.opening}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MarkBadge({ count }: { count: number }) {
  return (
    <span
      title={`${count} highlight${count === 1 ? "" : "s"} or note${count === 1 ? "" : "s"}`}
      className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 text-[10px] font-normal text-primary"
    >
      <NotebookPen className="h-2.5 w-2.5" /> {count}
    </span>
  );
}
