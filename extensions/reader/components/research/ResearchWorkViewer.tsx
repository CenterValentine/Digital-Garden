"use client";

/**
 * The reader's viewer for a saved research node (RESEARCH-READER-PLAN.md
 * §7.2) — a link node with `resourceType: "research"`. It never scrapes the
 * landing page (publishers answer server fetchers with JavaScript
 * interstitials); it shows the Work we already know, and reads the open copy
 * on demand when there is one. The right sidebar's Work view shows the rest.
 *
 * Stored PDFs are file nodes and open in the file viewer; the shared PDF
 * reader with marks is the next slice.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, BookOpen, ExternalLink, FlaskConical, Loader2 } from "lucide-react";
import { useContentSidebarClaims } from "@/lib/extensions/content-sidebar";
import { READER_EXTENSION_ID } from "../../manifest";
import { researchApi } from "../../lib/research-api";
import { revealReaderSidebar } from "../../lib/sidebar";
import { useResearchStore } from "../../state/research-store";
import { authorLine, RETRACTION_LABELS, toneStyle, typeLabel, typeTone } from "./work-labels";

export function ResearchWorkViewer({ contentId }: { contentId: string }) {
  const node = useResearchStore((state) => state.openWorks[contentId] ?? null);
  const setOpenWork = useResearchStore((state) => state.setOpenWork);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  // The right sidebar's Book tab shows this Work while it's open.
  useEffect(() => {
    const { claim, release } = useContentSidebarClaims.getState();
    claim(contentId, READER_EXTENSION_ID);
    return () => release(contentId, READER_EXTENSION_ID);
  }, [contentId]);

  // The viewer is keyed by content id, so a fresh mount starts with no error;
  // only the request's own outcome sets state here.
  useEffect(() => {
    let cancelled = false;
    researchApi
      .work(contentId)
      .then((dto) => {
        if (!cancelled) setOpenWork(contentId, dto);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this work");
      });
    return () => {
      cancelled = true;
      setOpenWork(contentId, null);
    };
  }, [contentId, setOpenWork]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <AlertTriangle className="h-6 w-6 text-amber-500" />
        {error}
      </div>
    );
  }
  if (!node) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening…
      </div>
    );
  }

  const { work } = node;
  const tone = work.retraction ? "danger" : typeTone(work.type);
  const canReadHere = Boolean(node.copyUrl) && node.copyPolicy !== "link";

  return (
    <div className="flex h-full flex-col" style={toneStyle(tone)}>
      <header className="border-b border-black/10 px-6 py-4 dark:border-white/10">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--work-tone)]">
          {work.retraction ? RETRACTION_LABELS[work.retraction.status] : typeLabel(work.type)}
          {work.year !== null && <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">{work.year}</span>}
        </p>
        <h1 className="font-serif text-xl font-semibold leading-snug">{work.title}</h1>
        {(work.authors.length > 0 || work.venue) && (
          <p className="mt-1 text-sm text-muted-foreground">{[authorLine(work, 6), work.venue].filter(Boolean).join(" · ")}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canReadHere && (
            <button
              type="button"
              onClick={() => setReading((value) => !value)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
            >
              <BookOpen className="h-3.5 w-3.5" />
              {reading ? "Hide the copy" : "Read here"}
            </button>
          )}
          {node.url && (
            <a
              href={node.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open at the source
            </a>
          )}
          <button
            type="button"
            onClick={() => revealReaderSidebar(contentId)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Details
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {reading && node.copyUrl ? (
          <div className="flex h-full flex-col">
            <p className="border-b border-black/10 px-6 py-1.5 text-[11px] text-muted-foreground dark:border-white/10">
              Reading the open copy at {new URL(node.copyUrl).hostname} — fetched each time, never stored (its licence doesn&apos;t allow keeping it).{" "}
              <a href={node.copyUrl} target="_blank" rel="noreferrer" className="underline">
                Open the PDF in a new tab
              </a>
            </p>
            <iframe title={work.title} src={node.copyUrl} className="min-h-0 flex-1 w-full bg-white" />
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
            {work.abstract ? (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Abstract</h2>
                <p className="whitespace-pre-line text-[15px] leading-relaxed">{work.abstract}</p>
              </section>
            ) : (
              <p className="text-sm text-muted-foreground">No abstract was available from the sources that described this work.</p>
            )}
            {!canReadHere && (
              <p className="rounded-md border border-black/10 p-3 text-xs text-muted-foreground dark:border-white/10">
                No free copy was found for this work, so it&apos;s saved as a link. Open it at the source, or through your
                library&apos;s access.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
