"use client";

/**
 * The Research Find tab (RESEARCH-READER-PLAN.md §2.3): one box, a scope, a
 * row of facets, a source strip, and merged results streaming in. Selecting a
 * result shows it in the right sidebar's Work view — no preview pane here.
 *
 * Narrow-first: the tab lives in split panes (~470px), so the submit sits
 * inside the input (it can never wrap below), facets are compact chips, and
 * cards are built from the design system's glass surfaces with a type-toned
 * rail from the intent palette (`work-labels.ts`).
 */

import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Check,
  CircleSlash,
  Clock,
  FlaskConical,
  Link2,
  Loader2,
  Plus,
  Quote,
  Search,
} from "lucide-react";
import { getSurfaceStyles } from "@/lib/design/system";
import { parseIdentifierQuery } from "@/lib/domain/research/identifiers";
import { RESEARCH_SCOPES, researchScope } from "@/lib/domain/research/scopes";
import { RESEARCH_SOURCES, researchSource } from "@/lib/domain/research/sources";
import type { Work } from "@/lib/domain/research/types";
import type { SourceReport } from "@/lib/domain/research/federate";
import { READER_RESEARCH_CONTENT_ID } from "../../manifest";
import { revealReaderSidebar } from "../../lib/sidebar";
import { addWorkToFolder, hasMoreResults, runResearchSearch } from "../../lib/use-research";
import { useResearchStore, type ResearchLinkResult } from "../../state/research-store";
import { accessBadge, authorLine, RETRACTION_LABELS, toneStyle, typeLabel, typeTone } from "./work-labels";

const control =
  "h-9 rounded-md border border-black/10 bg-[var(--surface-input)] px-2 text-sm dark:border-white/10";
const chip =
  "inline-flex h-7 items-center gap-1 rounded-full border border-black/10 px-2.5 text-[11px] dark:border-white/10";

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

const glass1 = getSurfaceStyles("glass-1");
const glass2 = getSurfaceStyles("glass-2");

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
    <div className="@container flex h-full flex-col">
      <div className="space-y-2.5 border-b border-black/10 px-3 pb-3 pt-3 dark:border-white/10">
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
            className={`${control} grow @md:grow-0`}
            title={scope.description}
          >
            {PICKER_SCOPES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
                {option.status === "coming" ? " (coming soon)" : ""}
              </option>
            ))}
          </select>
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Words, a DOI, arXiv id, PMID, trial number, case citation or URL"
              className={`${control} w-full pl-8 pr-10`}
            />
            <button
              type="submit"
              aria-label={identifier ? "Look up" : "Search"}
              title={identifier ? "Look up this identifier" : "Search"}
              disabled={searching || !text.trim() || comingSoon}
              className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </form>
        {identifier ? (
          <p className="text-[11px] text-muted-foreground">
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
  const yearField = "h-7 w-12 rounded border border-black/10 bg-transparent px-1 text-center text-[11px] tabular-nums placeholder:text-muted-foreground/70 dark:border-white/10";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label className={`${chip} gap-1.5 pl-2.5 pr-1`}>
        <span className="text-muted-foreground">Years</span>
        <input
          inputMode="numeric"
          placeholder="from"
          defaultValue={filters.yearFrom ?? ""}
          onBlur={(event) => setFilters({ yearFrom: year(event.target.value) })}
          className={yearField}
        />
        <span className="text-muted-foreground">–</span>
        <input
          inputMode="numeric"
          placeholder="to"
          defaultValue={filters.yearTo ?? ""}
          onBlur={(event) => setFilters({ yearTo: year(event.target.value) })}
          className={yearField}
        />
      </label>
      <label
        className={`${chip} cursor-pointer select-none ${
          filters.openAccess ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"
        }`}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={Boolean(filters.openAccess)}
          onChange={(event) => setFilters({ openAccess: event.target.checked })}
        />
        {filters.openAccess && <Check className="h-3 w-3" />}
        Open access
      </label>
      <select
        aria-label="Sort"
        value={filters.sort}
        onChange={(event) => setFilters({ sort: event.target.value as typeof filters.sort })}
        className={`${chip} appearance-none bg-transparent pr-2 text-foreground`}
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
    <div className="flex flex-wrap items-center gap-1.5">
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
            className={`${chip} h-6 px-2 ${
              on
                ? report?.status === "ok"
                  ? "border-emerald-500/30 bg-emerald-500/[0.07]"
                  : report
                    ? "border-amber-500/40 bg-amber-500/[0.08]"
                    : "text-foreground"
                : "border-dashed text-muted-foreground line-through"
            }`}
          >
            {report
              ? STATUS_ICON[report.status]
              : on && status === "searching" && <Loader2 className="h-3 w-3 animate-spin" />}
            {source.label}
            {report?.status === "ok" && <span className="tabular-nums text-muted-foreground">{report.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function sourceLabels(ids: string[]): string {
  return ids.map((id) => researchSource(id)?.label ?? id).join(" · ");
}

function ResultList({ works }: { works: Work[] }) {
  const selectedKey = useResearchStore((state) => state.selectedKey);
  const select = useResearchStore((state) => state.select);
  const saved = useResearchStore((state) => state.saved);
  const status = useResearchStore((state) => state.status);
  const more = status !== "searching" && hasMoreResults();

  return (
    <div className="space-y-2.5">
      <ul className="space-y-2.5">
        {works.map((work) => (
          <WorkCard
            key={work.key}
            work={work}
            selected={selectedKey === work.key}
            savedId={saved[work.key]?.contentId ?? null}
            onSelect={() => {
              select(work.key);
              revealReaderSidebar(READER_RESEARCH_CONTENT_ID);
            }}
          />
        ))}
      </ul>
      {more && (
        <button
          type="button"
          onClick={() => void runResearchSearch({ append: true })}
          style={{ background: glass1.background, border: glass1.border }}
          className="w-full rounded-lg py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
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

function WorkCard({
  work,
  selected,
  savedId,
  onSelect,
}: {
  work: Work;
  selected: boolean;
  savedId: string | null;
  onSelect: () => void;
}) {
  const badge = accessBadge(work);
  const tone = work.retraction ? "danger" : typeTone(work.type);
  const summary = work.tldr ?? work.abstract;
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSelect();
        }}
        style={{
          ...toneStyle(tone),
          background: selected
            ? "color-mix(in srgb, var(--work-tone) 9%, var(--surface-glass-2-bg))"
            : glass1.background,
          border: glass1.border,
          boxShadow: selected ? glass2.boxShadow : glass1.boxShadow,
        }}
        className={`group relative overflow-hidden rounded-lg pl-4 pr-3 pt-3 pb-2.5 outline-none transition-[box-shadow,transform] hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-[var(--work-tone)] ${
          selected ? "ring-1 ring-[var(--work-tone)]" : ""
        }`}
      >
        {/* Type-toned rail */}
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--work-tone)]" />

        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide">
              <span
                className="rounded px-1.5 py-0.5 text-[var(--work-tone)]"
                style={{ background: "color-mix(in srgb, var(--work-tone) 16%, transparent)" }}
              >
                {work.retraction ? RETRACTION_LABELS[work.retraction.status] : typeLabel(work.type)}
              </span>
              {work.year !== null && <span className="tabular-nums text-muted-foreground">{work.year}</span>}
            </div>
            <h3 className="font-serif text-[15px] font-semibold leading-snug [overflow-wrap:anywhere] line-clamp-3">
              {work.title}
            </h3>
            {(work.authors.length > 0 || work.venue) && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {[authorLine(work), work.venue].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <button
            type="button"
            title={savedId ? "In your library — open it" : "Add to the folder"}
            aria-label={savedId ? "Open" : "Add to the folder"}
            onClick={(event) => {
              event.stopPropagation();
              void addWorkToFolder(work, { open: Boolean(savedId) });
            }}
            style={{ background: glass2.background, border: glass1.border }}
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:border-[var(--work-tone)] ${
              savedId ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
            }`}
          >
            {savedId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>

        {summary && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{summary}</p>}

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
          <span
            title={badge.title}
            className={`rounded px-1.5 py-0.5 font-medium ${
              badge.tone === "good"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : badge.tone === "ok"
                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                  : "bg-black/5 text-muted-foreground dark:bg-white/10"
            }`}
          >
            {badge.label}
          </span>
          {work.citedByCount !== null && work.citedByCount > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground">
              <Quote className="h-2.5 w-2.5" />
              {work.citedByCount.toLocaleString()}
            </span>
          )}
          <span className="ml-auto truncate text-muted-foreground/80">{sourceLabels(work.provenance)}</span>
        </div>
      </div>
    </li>
  );
}

function LinkResult({ link }: { link: ResearchLinkResult }) {
  const saved = useResearchStore((state) => state.saved);
  return (
    <div
      style={{ ...toneStyle("accent"), background: glass1.background, border: glass1.border, boxShadow: glass1.boxShadow }}
      className="relative flex items-start gap-3 overflow-hidden rounded-lg py-3 pl-4 pr-3"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--work-tone)]" />
      <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="font-serif text-[15px] font-semibold">{link.title}</div>
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
        style={{ background: glass2.background, border: glass1.border }}
        className="h-8 shrink-0 rounded-full px-3 text-xs hover:border-[var(--work-tone)]"
      >
        {saved[link.key] ? "Open" : "Add as link"}
      </button>
    </div>
  );
}
