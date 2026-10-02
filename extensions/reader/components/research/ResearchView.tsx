"use client";

/**
 * The Research Find tab (RESEARCH-READER-PLAN.md §2.3): one box, a scope, a
 * row of facets, a source strip, and merged results streaming in. Selecting a
 * result shows it in the right sidebar's Work view — no preview pane here.
 */

import { useMemo } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CircleSlash,
  Clock,
  FlaskConical,
  Link2,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { parseIdentifierQuery } from "@/lib/domain/research/identifiers";
import { RESEARCH_SCOPES, researchScope } from "@/lib/domain/research/scopes";
import { RESEARCH_SOURCES } from "@/lib/domain/research/sources";
import type { Work } from "@/lib/domain/research/types";
import type { SourceReport } from "@/lib/domain/research/federate";
import { READER_RESEARCH_CONTENT_ID } from "../../manifest";
import { revealReaderSidebar } from "../../lib/sidebar";
import { addWorkToFolder, hasMoreResults, runResearchSearch } from "../../lib/use-research";
import { useResearchStore, type ResearchLinkResult } from "../../state/research-store";
import { accessBadge, authorLine, RETRACTION_LABELS, typeLabel } from "./work-labels";

const control =
  "h-9 rounded border border-black/10 bg-transparent px-2 text-sm dark:border-white/10";

const IDENTIFIER_NAMES: Record<string, string> = {
  doi: "a DOI",
  arxiv: "an arXiv id",
  pmid: "a PubMed id",
  pmcid: "a PubMed Central id",
  nct: "a clinical-trial number",
  isbn: "an ISBN",
  case: "a case citation",
  cfr: "a federal regulation",
  usc: "a US Code section",
  patent: "a patent number",
  openalex: "an OpenAlex id",
  s2: "a Semantic Scholar id",
  url: "a link",
};

/** Remote scopes searchable today; local ones (your library, this folder) arrive with the Papers view. */
const PICKER_SCOPES = RESEARCH_SCOPES.filter((scope) => !scope.local);

export function ResearchView() {
  const scopeId = useResearchStore((state) => state.scope);
  const text = useResearchStore((state) => state.text);
  const status = useResearchStore((state) => state.status);
  const error = useResearchStore((state) => state.error);
  const works = useResearchStore((state) => state.works);
  const link = useResearchStore((state) => state.link);
  const setScope = useResearchStore((state) => state.setScope);
  const setText = useResearchStore((state) => state.setText);
  const scope = researchScope(scopeId) ?? RESEARCH_SCOPES[0];
  const identifier = useMemo(() => parseIdentifierQuery(text), [text]);
  const searching = status === "searching";
  const comingSoon = scope.status !== "available" && !identifier;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-black/10 p-3 dark:border-white/10">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void runResearchSearch();
          }}
        >
          <select
            aria-label="Scope"
            value={scope.id}
            onChange={(event) => setScope(event.target.value)}
            className={control}
            title={scope.description}
          >
            {PICKER_SCOPES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
                {option.status === "coming" ? " (coming soon)" : ""}
              </option>
            ))}
          </select>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Words, a DOI, arXiv id, PMID, trial number, case citation or URL"
              className={`${control} w-full pl-8`}
            />
          </div>
          <button
            type="submit"
            disabled={searching || !text.trim() || comingSoon}
            className="h-9 rounded bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {searching ? "Searching…" : identifier ? "Look up" : "Search"}
          </button>
        </form>
        {identifier ? (
          <p className="text-xs text-muted-foreground">
            Looks like {IDENTIFIER_NAMES[identifier[0].scheme] ?? "an identifier"} — goes straight to that work.
          </p>
        ) : (
          <>
            <Facets />
            <SourceStrip scopeSources={scope.sources} />
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {comingSoon ? (
          <Empty icon={<FlaskConical className="h-8 w-8" />}>
            {scope.label} arrives in V1.1. Until then, paste a citation (“410 U.S. 113”, “12 CFR 1026.19”) to save it as a link.
          </Empty>
        ) : link ? (
          <LinkResult link={link} />
        ) : works.length ? (
          <ResultList works={works} />
        ) : searching ? (
          <Empty icon={<Loader2 className="h-6 w-6 animate-spin" />}>Searching…</Empty>
        ) : error ? (
          <Empty icon={<AlertTriangle className="h-6 w-6 text-amber-500" />}>{error}</Empty>
        ) : status === "done" ? (
          <Empty icon={<Search className="h-6 w-6" />}>Nothing found. Try fewer words, or another scope.</Empty>
        ) : (
          <Empty icon={<FlaskConical className="h-8 w-8" />}>
            Search {scope.label.toLowerCase()} — {scope.description.toLowerCase()} Results land in the folder you opened Research from.
          </Empty>
        )}
      </div>
    </div>
  );
}

function Empty({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
      {icon}
      <p>{children}</p>
    </div>
  );
}

function Facets() {
  const filters = useResearchStore((state) => state.filters);
  const setFilters = useResearchStore((state) => state.setFilters);
  const year = (value: string) => {
    const parsed = Number(value);
    return value && Number.isInteger(parsed) && parsed > 1000 ? parsed : undefined;
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="flex items-center gap-1">
        Years
        <input
          inputMode="numeric"
          placeholder="from"
          defaultValue={filters.yearFrom ?? ""}
          onBlur={(event) => setFilters({ yearFrom: year(event.target.value) })}
          className={`${control} h-7 w-16 text-xs`}
        />
        –
        <input
          inputMode="numeric"
          placeholder="to"
          defaultValue={filters.yearTo ?? ""}
          onBlur={(event) => setFilters({ yearTo: year(event.target.value) })}
          className={`${control} h-7 w-16 text-xs`}
        />
      </label>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={Boolean(filters.openAccess)}
          onChange={(event) => setFilters({ openAccess: event.target.checked })}
        />
        Open access only
      </label>
      <select
        aria-label="Sort"
        value={filters.sort}
        onChange={(event) => setFilters({ sort: event.target.value as typeof filters.sort })}
        className={`${control} h-7 text-xs`}
      >
        <option value="relevance">Best match</option>
        <option value="recent">Newest</option>
        <option value="cited">Most cited</option>
      </select>
    </div>
  );
}

const STATUS_ICON: Record<SourceReport["status"], React.ReactNode> = {
  ok: <BadgeCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />,
  error: <AlertTriangle className="h-3 w-3 text-amber-500" />,
  timeout: <Clock className="h-3 w-3 text-amber-500" />,
  skipped: <CircleSlash className="h-3 w-3 text-muted-foreground" />,
};

/** Which sources answered, failed, or are off — a source is provenance, but its health is visible. */
function SourceStrip({ scopeSources }: { scopeSources: string[] }) {
  const reports = useResearchStore((state) => state.reports);
  const status = useResearchStore((state) => state.status);
  const include = useResearchStore((state) => state.include);
  const exclude = useResearchStore((state) => state.exclude);
  const toggle = useResearchStore((state) => state.toggleSource);
  const sources = RESEARCH_SOURCES.filter((source) => scopeSources.includes(source.id) && source.roles.includes("discover"));

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-muted-foreground">Sources</span>
      {sources.map((source) => {
        const on = source.defaultOn ? !exclude.includes(source.id) : include.includes(source.id);
        const report = reports[source.id];
        const detail = report
          ? report.status === "ok"
            ? `${report.count} results in ${(report.ms / 1000).toFixed(1)}s${report.total ? ` (of ${report.total.toLocaleString()})` : ""}`
            : report.error ?? report.status
          : on
            ? status === "searching"
              ? "Waiting…"
              : source.description
            : source.costNote
              ? `Off — uses your key (${source.costNote})`
              : "Off";
        return (
          <button
            key={source.id}
            type="button"
            title={detail}
            onClick={() => toggle(source.id, !on, source.defaultOn)}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
              on
                ? "border-black/15 text-foreground dark:border-white/15"
                : "border-dashed border-black/15 text-muted-foreground line-through dark:border-white/15"
            }`}
          >
            {report
              ? STATUS_ICON[report.status]
              : on && status === "searching" && <Loader2 className="h-3 w-3 animate-spin" />}
            {source.label}
            {report?.status === "ok" && <span className="text-muted-foreground">{report.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ResultList({ works }: { works: Work[] }) {
  const selectedKey = useResearchStore((state) => state.selectedKey);
  const select = useResearchStore((state) => state.select);
  const saved = useResearchStore((state) => state.saved);
  const status = useResearchStore((state) => state.status);
  const more = status !== "searching" && hasMoreResults();

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {works.map((work) => {
          const badge = accessBadge(work);
          return (
            <li key={work.key}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  select(work.key);
                  revealReaderSidebar(READER_RESEARCH_CONTENT_ID);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    select(work.key);
                    revealReaderSidebar(READER_RESEARCH_CONTENT_ID);
                  }
                }}
                className={`group flex gap-3 rounded-lg border p-3 text-left ${
                  selectedKey === work.key
                    ? "border-primary/50 bg-primary/5"
                    : "border-black/10 hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.03]"
                }`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {work.retraction && (
                      <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
                        {RETRACTION_LABELS[work.retraction.status]}
                      </span>
                    )}
                    <span className="font-medium leading-snug">{work.title}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[authorLine(work), work.venue, work.year].filter(Boolean).join(" · ")}
                  </div>
                  {(work.tldr ?? work.abstract) && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{work.tldr ?? work.abstract}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="rounded bg-black/5 px-1.5 py-0.5 dark:bg-white/10">{typeLabel(work.type)}</span>
                    <span
                      title={badge.title}
                      className={`rounded px-1.5 py-0.5 ${
                        badge.tone === "good"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : badge.tone === "ok"
                            ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                            : "bg-black/5 text-muted-foreground dark:bg-white/10"
                      }`}
                    >
                      {badge.label}
                    </span>
                    {work.citedByCount !== null && (
                      <span className="text-muted-foreground">cited {work.citedByCount.toLocaleString()}</span>
                    )}
                    <span className="text-muted-foreground">via {work.provenance.join(", ")}</span>
                  </div>
                </div>
                <button
                  type="button"
                  title={saved[work.key] ? "In your library — open it" : "Add to the folder"}
                  onClick={(event) => {
                    event.stopPropagation();
                    void addWorkToFolder(work, { open: Boolean(saved[work.key]) });
                  }}
                  className="h-8 shrink-0 self-start rounded border border-black/10 px-2 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                >
                  {saved[work.key] ? "Open" : <Plus className="h-4 w-4" />}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {more && (
        <button
          type="button"
          onClick={() => void runResearchSearch({ append: true })}
          className="w-full rounded border border-black/10 py-2 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
        >
          More results
        </button>
      )}
      {status === "searching" && (
        <p className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Still hearing from sources…
        </p>
      )}
    </div>
  );
}

function LinkResult({ link }: { link: ResearchLinkResult }) {
  const saved = useResearchStore((state) => state.saved);
  return (
    <div className="flex items-start gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{link.title}</div>
        <div className="text-xs text-muted-foreground">
          {typeLabel(link.type)} · opens at{" "}
          <a href={link.url} target="_blank" rel="noreferrer" className="underline">
            {new URL(link.url).hostname}
          </a>
          . The Law pack (V1.1) will read it here.
        </div>
      </div>
      <button
        type="button"
        onClick={() => void addWorkToFolder({ key: link.key, title: link.title }, { open: Boolean(saved[link.key]) })}
        className="h-8 shrink-0 rounded border border-black/10 px-2 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
      >
        {saved[link.key] ? "Open" : "Add as link"}
      </button>
    </div>
  );
}
