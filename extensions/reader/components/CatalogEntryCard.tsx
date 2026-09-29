"use client";

import { useState } from "react";
import { BookOpen, Download, ExternalLink, Library, Loader2 } from "lucide-react";
import {
  librarySearchUrl,
  type CatalogEntry,
} from "@/lib/domain/reader/types";

const FORMAT_LABELS: Record<string, string> = {
  "application/epub+zip": "EPUB",
  "application/pdf": "PDF",
  "application/x-mobipocket-ebook": "MOBI",
  "application/vnd.amazon.ebook": "AZW3",
  "application/x-fictionbook+xml": "FB2",
  "application/vnd.comicbook+zip": "CBZ",
};

const LICENSE_LABELS: Record<string, string> = {
  "public-domain": "Public domain",
  "creative-commons": "Creative Commons",
  owned: "Yours",
};

export function formatLabel(type: string): string {
  return FORMAT_LABELS[type.split(";")[0]] ?? (type.split("/").pop()?.toUpperCase() || "File");
}

interface CatalogEntryCardProps {
  entry: CatalogEntry;
  onAdd: (entry: CatalogEntry, acquisitionIndex: number) => Promise<void>;
}

export function CatalogEntryCard({ entry, onAdd }: CatalogEntryCardProps) {
  const readable = entry.acquisitions
    .map((acquisition, index) => ({ acquisition, index }))
    .filter(({ acquisition }) => FORMAT_LABELS[acquisition.type.split(";")[0]]);
  const [format, setFormat] = useState(readable[0]?.index ?? 0);
  const [busy, setBusy] = useState(false);
  const paidOnly = entry.acquisitions.length > 0 && readable.length === 0;

  return (
    <article className="flex gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="h-28 w-20 shrink-0 overflow-hidden rounded bg-black/5 dark:bg-white/5">
        {entry.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote catalog covers, arbitrary hosts
          <img
            src={entry.coverUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <BookOpen className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="line-clamp-2 text-sm font-semibold">{entry.title}</h3>
        {entry.authors.length > 0 && (
          <p className="truncate text-xs text-muted-foreground">{entry.authors.join(", ")}</p>
        )}
        <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
          {entry.publishedYear && <span>{entry.publishedYear}</span>}
          {entry.language && <span className="uppercase">{entry.language}</span>}
          {entry.license && LICENSE_LABELS[entry.license] && (
            <span className="rounded bg-emerald-500/10 px-1.5 text-emerald-700 dark:text-emerald-300">
              {LICENSE_LABELS[entry.license]}
            </span>
          )}
        </div>
        {entry.summary && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{entry.summary}</p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {readable.length > 0 && (
            <>
              {readable.length > 1 && (
                <select
                  aria-label="Format"
                  value={format}
                  onChange={(event) => setFormat(Number(event.target.value))}
                  className="h-7 rounded border border-black/10 bg-transparent px-1 text-xs dark:border-white/10"
                >
                  {readable.map(({ acquisition, index }) => (
                    <option key={index} value={index}>
                      {formatLabel(acquisition.type)}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onAdd(entry, format);
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex h-7 items-center gap-1 rounded bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Add to library
              </button>
            </>
          )}
          {paidOnly && (
            <span className="text-xs text-muted-foreground">Purchase or borrow required</span>
          )}
          {entry.externalUrl && (
            <a
              href={entry.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {entry.externalLabel ?? "Source"}
            </a>
          )}
          {readable.length === 0 && (
            <a
              href={librarySearchUrl(entry.title, entry.authors[0])}
              target="_blank"
              rel="noreferrer"
              title="Check availability at your public library (opens OverDrive / Libby)"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Library className="h-3 w-3" />
              Find at your library
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
