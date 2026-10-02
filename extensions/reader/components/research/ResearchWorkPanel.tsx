"use client";

/**
 * Right-sidebar Work view for the Research tab: everything about the selected
 * Work, with its access ladder spelled out (RESEARCH-READER-PLAN.md §2.2.4) —
 * the copies that exist, which can be kept, and where else to read it.
 */

import { AlertTriangle, ExternalLink, FlaskConical, Plus } from "lucide-react";
import { addWorkToFolder } from "../../lib/use-research";
import { useResearchStore } from "../../state/research-store";
import { accessBadge, RETRACTION_LABELS, typeLabel } from "./work-labels";

const IDENTIFIER_LINKS: Record<string, (value: string) => string> = {
  doi: (value) => `https://doi.org/${value}`,
  arxiv: (value) => `https://arxiv.org/abs/${value}`,
  pmid: (value) => `https://pubmed.ncbi.nlm.nih.gov/${value}/`,
  pmcid: (value) => `https://pmc.ncbi.nlm.nih.gov/articles/${value}/`,
  openalex: (value) => `https://openalex.org/${value}`,
  s2: (value) => `https://www.semanticscholar.org/paper/${value}`,
  nct: (value) => `https://clinicaltrials.gov/study/${value}`,
};

const IDENTIFIER_LABELS: Record<string, string> = {
  doi: "DOI",
  arxiv: "arXiv",
  pmid: "PubMed",
  pmcid: "PMC",
  openalex: "OpenAlex",
  s2: "Semantic Scholar",
  nct: "ClinicalTrials.gov",
  isbn: "ISBN",
};

export function ResearchWorkPanel() {
  const works = useResearchStore((state) => state.works);
  const selectedKey = useResearchStore((state) => state.selectedKey);
  const saved = useResearchStore((state) => state.saved);
  const work = works.find((candidate) => candidate.key === selectedKey) ?? null;

  if (!work) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <FlaskConical className="h-8 w-8" />
        Select a result to see its details.
      </div>
    );
  }

  const badge = accessBadge(work);
  const isSaved = Boolean(saved[work.key]);
  const identifiers = Object.entries(work.identifiers).filter(([scheme]) => scheme !== "url");

  return (
    <div className="h-full space-y-4 overflow-auto p-4 text-sm">
      <div className="space-y-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{typeLabel(work.type)}</div>
        <h2 className="font-serif text-base font-semibold leading-snug">{work.title}</h2>
        {work.authors.length > 0 && (
          <p className="text-xs text-muted-foreground">{work.authors.map((author) => author.name).join(", ")}</p>
        )}
        <p className="text-xs text-muted-foreground">{[work.venue, work.year].filter(Boolean).join(" · ")}</p>
      </div>

      {work.retraction && (
        <div className="flex gap-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-800 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {RETRACTION_LABELS[work.retraction.status]}
            {work.retraction.date ? ` (${work.retraction.date})` : ""}.{" "}
            {work.retraction.notice && (
              <a href={work.retraction.notice} target="_blank" rel="noreferrer" className="underline">
                Read the notice
              </a>
            )}
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => void addWorkToFolder(work, { open: true })}
        className="inline-flex h-8 items-center gap-1.5 rounded bg-primary px-3 text-xs font-medium text-primary-foreground"
      >
        {isSaved ? (
          "Open"
        ) : (
          <>
            <Plus className="h-3.5 w-3.5" /> Add and open
          </>
        )}
      </button>

      {work.tldr && (
        <section className="space-y-1">
          <h3 className="text-xs font-semibold">In one sentence</h3>
          <p className="text-xs">{work.tldr}</p>
          <p className="text-[10px] text-muted-foreground">TLDR from Semantic Scholar</p>
        </section>
      )}
      {work.abstract && (
        <section className="space-y-1">
          <h3 className="text-xs font-semibold">Abstract</h3>
          <p className="whitespace-pre-line text-xs leading-relaxed">{work.abstract}</p>
        </section>
      )}

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold">Where to read it</h3>
        <p className="text-[11px] text-muted-foreground">{badge.title}</p>
        <ul className="space-y-1">
          {work.copies.map((copy) => (
            <li key={copy.url} className="flex items-center gap-2 text-xs">
              <a href={copy.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 underline">
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{copy.host}</span>
              </a>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {[copy.version, copy.license ?? "licence unknown", copy.storable ? "can be kept" : "read on demand"]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
          {work.landingUrl && (
            <li className="text-xs">
              <a href={work.landingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                <ExternalLink className="h-3 w-3" /> Publisher page
              </a>
            </li>
          )}
        </ul>
      </section>

      {identifiers.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-xs font-semibold">Identifiers</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            {identifiers.map(([scheme, values]) => (
              <div key={scheme} className="contents">
                <dt className="text-muted-foreground">{IDENTIFIER_LABELS[scheme] ?? scheme}</dt>
                <dd className="truncate">
                  {IDENTIFIER_LINKS[scheme] ? (
                    <a href={IDENTIFIER_LINKS[scheme](values![0])} target="_blank" rel="noreferrer" className="underline">
                      {values![0]}
                    </a>
                  ) : (
                    values![0]
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <p className="text-[10px] text-muted-foreground">
        Described by {work.provenance.join(", ")}
        {work.citedByCount !== null ? ` · cited ${work.citedByCount.toLocaleString()} times` : ""}
      </p>
    </div>
  );
}
