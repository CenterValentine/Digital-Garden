"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  Download,
  ExternalLink,
  Library,
  Link2,
  Loader2,
  X,
} from "lucide-react";
import {
  librarySearchUrl,
  type BookDetails,
  type BookDetailsQuery,
  type CatalogEntry,
} from "@/lib/domain/reader/types";
import { readerApi } from "../lib/api";
import { FORMAT_LABELS, LICENSE_LABELS, formatLabel } from "./CatalogEntryCard";

/** Everything the panel can show before details arrive. */
export interface BookPanelSubject {
  title: string;
  authors: string[];
  coverUrl?: string | null;
  summary?: string | null;
  publishedYear?: number | null;
  language?: string | null;
  license?: string | null;
  isbn?: string | null;
  publisher?: string | null;
}

interface BookDetailsPanelProps {
  subject: BookPanelSubject;
  query: BookDetailsQuery;
  onClose?: () => void;
  /** Catalog entry → offer Add (with the enriched description). */
  entry?: CatalogEntry;
  onAdd?: (entry: CatalogEntry, acquisitionIndex: number) => Promise<void>;
  /** No free download: keep the book as a link to its source. */
  onAddLink?: (entry: CatalogEntry) => Promise<void>;
  /** Library book → offer Read. */
  onRead?: () => void;
  /** Extra buttons beside Read/Add (e.g. "Add shortcut here"). */
  extraActions?: ReactNode;
  className?: string;
}

function longer(a?: string | null, b?: string | null): string | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return b.length > a.length ? b : a;
}

export function BookDetailsPanel({
  subject,
  query,
  onClose,
  entry,
  onAdd,
  onAddLink,
  onRead,
  extraActions,
  className,
}: BookDetailsPanelProps) {
  const [details, setDetails] = useState<BookDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let cancelled = false;
    readerApi
      .details(JSON.parse(queryKey) as BookDetailsQuery)
      .then((result) => {
        if (!cancelled) setDetails(result);
      })
      .catch(() => {
        if (!cancelled) setDetails(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryKey]);

  const description = longer(subject.summary, details?.description);
  const descriptionSource =
    description && description === details?.description ? details.descriptionSource : null;
  const cover = (!coverFailed && (subject.coverUrl ?? details?.coverUrl)) || null;
  const year = subject.publishedYear ?? details?.publishedYear;
  const publisher = subject.publisher ?? details?.publisher;
  const isbn = subject.isbn ?? details?.isbn;
  const readable = (entry?.acquisitions ?? [])
    .map((acquisition, index) => ({ acquisition, index }))
    .filter(({ acquisition }) => FORMAT_LABELS[acquisition.type.split(";")[0]]);

  return (
    <aside
      className={`flex flex-col overflow-hidden rounded-lg border border-black/10 bg-background dark:border-white/10 ${className ?? ""}`}
    >
      <div className="flex items-center justify-between border-b border-black/10 px-3 py-2 dark:border-white/10">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          About this book
        </span>
        {onClose && (
          <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex-1 space-y-3 overflow-auto p-4">
        <div className="flex gap-3">
          <div className="h-36 w-24 shrink-0 overflow-hidden rounded bg-black/5 shadow-sm dark:bg-white/5">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote catalog covers, arbitrary hosts
              <img
                src={cover}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setCoverFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <BookOpen className="h-7 w-7 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold leading-snug">{subject.title}</h2>
            {subject.authors.length > 0 && (
              <p className="text-sm text-muted-foreground">{subject.authors.join(", ")}</p>
            )}
            <dl className="grid grid-cols-[auto,1fr] gap-x-2 text-xs text-muted-foreground">
              {year ? (<><dt>Published</dt><dd>{year}</dd></>) : null}
              {publisher ? (<><dt>Publisher</dt><dd className="truncate">{publisher}</dd></>) : null}
              {details?.pageCount ? (<><dt>Pages</dt><dd>{details.pageCount}</dd></>) : null}
              {subject.language ? (<><dt>Language</dt><dd className="uppercase">{subject.language}</dd></>) : null}
              {isbn ? (<><dt>ISBN</dt><dd>{isbn}</dd></>) : null}
              {subject.license && LICENSE_LABELS[subject.license] ? (
                <><dt>License</dt><dd>{LICENSE_LABELS[subject.license]}</dd></>
              ) : null}
            </dl>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onRead && (
            <button type="button" onClick={onRead} className="inline-flex h-8 items-center gap-1 rounded bg-primary px-3 text-xs font-medium text-primary-foreground">
              <BookOpen className="h-3.5 w-3.5" /> Read
            </button>
          )}
          {extraActions}
          {entry && onAdd && readable.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  // Save the best description we found with the book.
                  await onAdd({ ...entry, summary: longer(entry.summary, details?.description) }, readable[0].index);
                } finally {
                  setBusy(false);
                }
              }}
              className="inline-flex h-8 items-center gap-1 rounded bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Add to library ({formatLabel(readable[0].acquisition.type)})
            </button>
          )}
          {entry && onAddLink && readable.length === 0 && entry.externalUrl && (
            <button
              type="button"
              disabled={busy}
              title="No free download — save it to your library as a link to its source page"
              onClick={async () => {
                setBusy(true);
                try {
                  await onAddLink({ ...entry, summary: longer(entry.summary, details?.description) });
                } finally {
                  setBusy(false);
                }
              }}
              className="inline-flex h-8 items-center gap-1 rounded bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Add to library as link
            </button>
          )}
          {entry?.externalUrl && (
            <a href={entry.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <ExternalLink className="h-3 w-3" /> {entry.externalLabel ?? "Source"}
            </a>
          )}
          {(!entry || readable.length === 0) && (
            <a
              href={librarySearchUrl(subject.title, subject.authors[0])}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Library className="h-3 w-3" /> Find at your library
            </a>
          )}
        </div>

        <section>
          {description ? (
            <>
              <p className="whitespace-pre-line text-sm leading-relaxed">{description}</p>
              {descriptionSource && (
                <p className="mt-1 text-[11px] text-muted-foreground">Description from {descriptionSource}</p>
              )}
            </>
          ) : loading ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking up a description…
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              No description found
              {details?.checked.length ? ` — checked ${details.checked.join(", ")}` : ""}.
              {details?.failed.length
                ? ` ${details.failed.join(", ")} didn't respond; reopen the book later to retry.`
                : ""}
            </p>
          )}
        </section>

        {details && details.subjects.length > 0 && (
          <section className="flex flex-wrap gap-1">
            {details.subjects.map((subjectName) => (
              <span key={subjectName} className="rounded bg-black/5 px-1.5 py-0.5 text-[11px] text-muted-foreground dark:bg-white/10">
                {subjectName}
              </span>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}

export function subjectFromEntry(entry: CatalogEntry): BookPanelSubject {
  return {
    title: entry.title,
    authors: entry.authors,
    coverUrl: entry.coverUrl,
    summary: entry.summary,
    publishedYear: entry.publishedYear,
    language: entry.language,
    license: entry.license,
    isbn: entry.isbn,
  };
}

export function queryFromEntry(sourceId: string, entry: CatalogEntry): BookDetailsQuery {
  return {
    sourceId,
    entryId: entry.id,
    title: entry.title,
    author: entry.authors[0],
    isbn: entry.isbn,
    openLibraryId: entry.openLibraryId,
  };
}
