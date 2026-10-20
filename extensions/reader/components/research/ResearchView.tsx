"use client";

/**
 * The Research Find tab (RESEARCH-READER-PLAN.md §2.3): one box with a
 * fielded query syntax, a grouped scope picker, a quick-pane for filters and
 * sources, and merged results streaming in. Selecting a result shows it in
 * the right sidebar's Work view — no preview pane here.
 *
 * Narrow-first: the tab lives in split panes (~470px). The submit sits inside
 * the input (it can never wrap below); filters and the source strip are
 * stowed in a quick-pane behind one button that wears the active-filter
 * count; cards use the design system's glass surfaces with a type-toned rail
 * from the intent palette (`work-labels.ts`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  SlidersHorizontal,
  X,
} from "lucide-react";
import { ContentTreePicker, useWorkspaceViewOptions } from "@/components/content/pickers/ContentTreePicker";
import { getSurfaceStyles } from "@/lib/design/system";
import { FIELD_GROUPS, RESEARCH_FIELDS } from "@/lib/domain/research/fields";
import { parseIdentifierQuery } from "@/lib/domain/research/identifiers";
import { activeFieldCount } from "@/lib/domain/research/query-syntax";
import { RESEARCH_SCOPES, researchScope, SCOPE_GROUPS } from "@/lib/domain/research/scopes";
import { RESEARCH_SOURCES, researchSource } from "@/lib/domain/research/sources";
import { KNOWN_WORK_TYPES, type SavedWorkRef, type Work } from "@/lib/domain/research/types";
import type { SourceReport } from "@/lib/domain/research/federate";
import { READER_RESEARCH_CONTENT_ID } from "../../manifest";
import { revealReaderSidebar } from "../../lib/sidebar";
import { useTreeTargetStore } from "@/state/tree-target-store";
import { addWorkToFolder, hasMoreResults, openSavedRef, runResearchSearch, savedWhere } from "../../lib/use-research";
import { useResearchStore, type ResearchLinkResult } from "../../state/research-store";
import { accessBadge, authorLine, RETRACTION_LABELS, toneStyle, typeLabel, typeTone } from "./work-labels";

const control =
  "h-9 rounded-md border border-black/10 bg-[var(--surface-input)] px-2 text-sm dark:border-white/10";
const field =
  "h-8 w-full rounded-md border border-black/10 bg-[var(--surface-input)] px-2 text-xs dark:border-white/10";
const chip =
  "inline-flex h-6 items-center gap-1 rounded-full border border-black/10 px-2 text-[11px] dark:border-white/10";

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

/** Holding Add this long opens the picker (the reader's Contents hold uses the same). */
const ADD_HOLD_MS = 450;

/**
 * The Add control: a click adds to the tree's live target; a hold (or a
 * right-click) opens the shared tree picker so the user chooses the folder
 * and the exact slot — the same "+ … here" affordances every picker has.
 */
function AddControl({
  work,
  savedRefs,
  tone,
}: {
  work: Work | { key: string; title: string };
  /** Nodes that already hold this Work; empty = not in the library. */
  savedRefs: SavedWorkRef[];
  tone: "card" | "link";
}) {
  const savedId = savedRefs[0]?.contentId ?? null;
  const targetLabel = useTreeTargetStore((state) => state.addTarget?.label ?? "the folder you opened Research from");
  const { views, defaultViewId } = useWorkspaceViewOptions();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);
  // The picker's anchor is captured when it opens, never read from the ref during render.
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);

  const cancelHold = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }, []);
  const startHold = useCallback(() => {
    heldRef.current = false;
    cancelHold();
    holdTimer.current = setTimeout(() => {
      heldRef.current = true;
      setPickerAnchor(buttonRef.current);
    }, ADD_HOLD_MS);
  }, [cancelHold]);
  useEffect(() => cancelHold, [cancelHold]);

  const addLabel = tone === "link" ? "Add as link" : "Add";
  const where = savedWhere(savedRefs);
  return (
    <>
      {savedId && (
        <button
          type="button"
          data-no-select
          title={`Already in ${where} — open it`}
          onClick={(event) => {
            event.stopPropagation();
            openSavedRef(savedRefs[0], work.title);
          }}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300"
        >
          <Check className="h-3 w-3" />
          Open{savedRefs.length > 1 ? ` (${savedRefs.length})` : ""}
        </button>
      )}
      <button
        ref={buttonRef}
        type="button"
        title={
          savedId
            ? `Already in ${where} — add another to ${targetLabel} (a stored PDF gets a shortcut) · hold or right-click to choose where`
            : `Add to ${targetLabel} · hold or right-click to choose where`
        }
        data-no-select
        onPointerDown={(event) => {
          // The card selects on click; a press on Add — held or not — is Add's alone.
          event.stopPropagation();
          startHold();
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          cancelHold();
        }}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          cancelHold();
          setPickerAnchor(event.currentTarget);
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (heldRef.current) {
            heldRef.current = false;
            return;
          }
          void addWorkToFolder(work, { again: Boolean(savedId) });
        }}
        className="inline-flex h-6 shrink-0 select-none items-center gap-1 rounded-full border border-black/10 px-2 text-[11px] font-medium text-foreground transition-colors hover:border-[var(--work-tone)] hover:bg-[color-mix(in_srgb,var(--work-tone)_12%,transparent)] dark:border-white/15"
      >
        <Plus className="h-3 w-3" />
        {addLabel}
      </button>
      {pickerAnchor && (
        <ContentTreePicker
          anchorEl={pickerAnchor}
          onPick={() => undefined}
          onClose={() => setPickerAnchor(null)}
          views={views}
          defaultViewId={defaultViewId}
          searchPlaceholder="Where should this paper go? Search… or browse below"
          quickCreate={{
            defaultTitle: work.title,
            noun: "paper",
            verb: "Add",
            pickCreatesInside: true,
            leafPickPlacesAfter: true,
            create: async ({ parentId, place }) => {
              const saved = await addWorkToFolder(work, { parentId, place, again: Boolean(savedId) });
              return saved
                ? { id: saved.contentId, title: saved.title, contentType: saved.copyPolicy === "stored" ? "file" : "external" }
                : null;
            },
            onCreated: () => setPickerAnchor(null),
          }}
        />
      )}
    </>
  );
}

export function ResearchView() {
  const scopeId = useResearchStore((state) => state.scope);
  const text = useResearchStore((state) => state.text);
  const fields = useResearchStore((state) => state.fields);
  const status = useResearchStore((state) => state.status);
  const error = useResearchStore((state) => state.error);
  const works = useResearchStore((state) => state.works);
  const link = useResearchStore((state) => state.link);
  const reports = useResearchStore((state) => state.reports);
  const paneOpen = useResearchStore((state) => state.paneOpen);
  const setScope = useResearchStore((state) => state.setScope);
  const setText = useResearchStore((state) => state.setText);
  const setPaneOpen = useResearchStore((state) => state.setPaneOpen);
  const scope = researchScope(scopeId) ?? RESEARCH_SCOPES[0];
  const identifier = useMemo(() => parseIdentifierQuery(text), [text]);
  const searching = status === "searching";
  const comingSoon = scope.status !== "available" && !identifier;
  const activeCount = activeFieldCount(fields);
  const sourceTrouble = Object.values(reports).some((report) => report.status !== "ok" && report.status !== "skipped");

  return (
    <div className="@container flex h-full flex-col">
      <div className="space-y-2 border-b border-black/10 px-3 pb-2.5 pt-3 dark:border-white/10">
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
            className={`${control} grow @md:max-w-[46%] @md:grow-0`}
            title={scope.description}
          >
            {SCOPE_GROUPS.map((group) => {
              const members = PICKER_SCOPES.filter((option) => option.group === group);
              if (!members.length) return null;
              return (
                <optgroup key={group} label={group}>
                  {members.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                      {option.status === "coming" ? " (coming soon)" : ""}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <div className="flex min-w-[200px] flex-1 gap-1.5">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Words · a DOI or citation · author:… after:2015 oa:yes"
                spellCheck={false}
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
            <button
              type="button"
              aria-label="Filters and sources"
              aria-expanded={paneOpen}
              title="Filters and sources"
              onClick={() => setPaneOpen(!paneOpen)}
              className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors ${
                paneOpen
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-black/10 text-muted-foreground hover:text-foreground dark:border-white/10"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {activeCount > 0 && (
                <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground">
                  {activeCount}
                </span>
              )}
              {sourceTrouble && activeCount === 0 && (
                <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" />
              )}
            </button>
          </div>
        </form>
        {identifier && (
          <p className="text-[11px] text-muted-foreground">
            Looks like {IDENTIFIER_NAMES[identifier[0].scheme] ?? "an identifier"} — goes straight to that work.
          </p>
        )}
        {paneOpen && <QuickPane scopeSources={scope.sources} onClose={() => setPaneOpen(false)} />}
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

const TYPE_OPTIONS = KNOWN_WORK_TYPES.filter((type) => !["case", "statute", "regulation", "patent", "archival", "webpage", "other"].includes(type));

/**
 * Filters and sources, stowed. Every control writes a token into the box
 * (`setFields` → `applyFields`), so the box always shows the whole query.
 */
function QuickPane({ scopeSources, onClose }: { scopeSources: string[]; onClose: () => void }) {
  const fields = useResearchStore((state) => state.fields);
  const setFields = useResearchStore((state) => state.setFields);
  const paneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const year = (value: string) => {
    const parsed = Number(value);
    return value && Number.isInteger(parsed) && parsed > 1000 ? parsed : undefined;
  };
  const number = (value: string) => {
    const parsed = Number(value);
    return value && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  };

  return (
    <div
      ref={paneRef}
      style={{ background: glass2.background, border: glass1.border, boxShadow: glass2.boxShadow }}
      className="space-y-3 rounded-lg p-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Filters</span>
        <div className="flex items-center gap-2">
          {activeFieldCount(fields) > 0 && (
            <button
              type="button"
              onClick={() =>
                setFields({
                  author: undefined,
                  venue: undefined,
                  types: undefined,
                  field: undefined,
                  yearFrom: undefined,
                  yearTo: undefined,
                  openAccess: undefined,
                  minCitations: undefined,
                  sort: undefined,
                })
              }
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            >
              Clear all
            </button>
          )}
          <button type="button" aria-label="Close" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 @md:grid-cols-3">
        <Labeled label="Years">
          <div className="flex items-center gap-1">
            <input
              inputMode="numeric"
              placeholder="from"
              value={fields.yearFrom ?? ""}
              onChange={(event) => setFields({ yearFrom: year(event.target.value) })}
              className={`${field} text-center tabular-nums`}
            />
            <span className="text-muted-foreground">–</span>
            <input
              inputMode="numeric"
              placeholder="to"
              value={fields.yearTo ?? ""}
              onChange={(event) => setFields({ yearTo: year(event.target.value) })}
              className={`${field} text-center tabular-nums`}
            />
          </div>
        </Labeled>
        <Labeled label="Sort">
          <select value={fields.sort ?? "relevance"} onChange={(event) => setFields({ sort: event.target.value as typeof fields.sort })} className={field}>
            <option value="relevance">Best match</option>
            <option value="recent">Newest</option>
            <option value="cited">Most cited</option>
          </select>
        </Labeled>
        <Labeled label="Access">
          <label className={`${field} flex cursor-pointer items-center gap-2`}>
            <input
              type="checkbox"
              checked={Boolean(fields.openAccess)}
              onChange={(event) => setFields({ openAccess: event.target.checked || undefined })}
            />
            Open access only
          </label>
        </Labeled>
        <Labeled label="Type">
          <select value={fields.types?.[0] ?? ""} onChange={(event) => setFields({ types: event.target.value ? [event.target.value] : undefined })} className={field}>
            <option value="">Any</option>
            {TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {typeLabel(type)}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Field">
          <select value={fields.field ?? ""} onChange={(event) => setFields({ field: event.target.value || undefined })} className={field}>
            <option value="">Any</option>
            {FIELD_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {RESEARCH_FIELDS.filter((entry) => entry.group === group).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Labeled>
        <Labeled label="Cited at least">
          <input
            inputMode="numeric"
            placeholder="e.g. 50"
            value={fields.minCitations ?? ""}
            onChange={(event) => setFields({ minCitations: number(event.target.value) })}
            className={`${field} tabular-nums`}
          />
        </Labeled>
        <Labeled label="Author">
          <input
            placeholder="name"
            value={fields.author ?? ""}
            onChange={(event) => setFields({ author: event.target.value || undefined })}
            className={field}
          />
        </Labeled>
        <Labeled label="Venue" className="col-span-2 @md:col-span-2">
          <input
            placeholder="journal or conference"
            value={fields.venue ?? ""}
            onChange={(event) => setFields({ venue: event.target.value || undefined })}
            className={field}
          />
        </Labeled>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Everything here is also a word in the box: <code>author:haenlein venue:&quot;small ruminant&quot; after:2015 cites&gt;=50 type:article oa:yes</code>. A
        source greys out a filter it can&apos;t honour.
      </p>

      <div className="space-y-1.5 border-t border-black/10 pt-2.5 dark:border-white/10">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sources</span>
        <SourceStrip scopeSources={scopeSources} />
      </div>
    </div>
  );
}

function Labeled({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
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
  const fields = useResearchStore((state) => state.fields);
  const toggle = useResearchStore((state) => state.toggleSource);
  const sources = RESEARCH_SOURCES.filter((source) => scopeSources.includes(source.id) && source.roles.includes("discover"));

  // Facets set in the box that this source can't honour — shown in its tooltip.
  const ignoredBy = (facets: string[]) =>
    [
      fields.author && !facets.includes("author") ? "author" : null,
      fields.venue && !facets.includes("venue") ? "venue" : null,
      fields.field && !facets.includes("field") ? "field" : null,
      fields.minCitations && !facets.includes("minCitations") ? "min citations" : null,
      fields.openAccess && !facets.includes("openAccess") ? "open access" : null,
      fields.types?.length && !facets.includes("type") ? "type" : null,
    ].filter(Boolean) as string[];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sources.map((source) => {
        const on = source.defaultOn ? !exclude.includes(source.id) : include.includes(source.id);
        const report = reports[source.id];
        const ignored = ignoredBy(source.facets);
        const detail = [
          report
            ? report.status === "ok"
              ? `${report.count} results in ${(report.ms / 1000).toFixed(1)}s${report.total ? ` (of ${report.total.toLocaleString()})` : ""}`
              : report.error ?? report.status
            : on
              ? status === "searching"
                ? "Waiting…"
                : source.description
              : source.costNote
                ? `Off — uses your key (${source.costNote})`
                : "Off",
          ignored.length ? `Ignores: ${ignored.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("\n");
        return (
          <button
            key={source.id}
            type="button"
            title={detail}
            onClick={() => toggle(source.id, !on, source.defaultOn)}
            className={`${chip} ${
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
            {on && ignored.length > 0 && <span className="text-amber-600 dark:text-amber-400">·{ignored.length}</span>}
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
            savedRefs={saved[work.key] ?? []}
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
  savedRefs,
  onSelect,
}: {
  work: Work;
  selected: boolean;
  savedRefs: SavedWorkRef[];
  onSelect: () => void;
}) {
  const badge = accessBadge(work);
  const tone = work.retraction ? "danger" : typeTone(work.type);
  const summary = work.tldr ?? work.abstract;
  const kind = work.retraction ? RETRACTION_LABELS[work.retraction.status] : typeLabel(work.type);
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          // A click (or a held press) on Add is not a pick of the card.
          if ((event.target as HTMLElement).closest("[data-no-select]")) return;
          onSelect();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !(event.target as HTMLElement).closest("[data-no-select]")) onSelect();
        }}
        style={{
          ...toneStyle(tone),
          background: selected
            ? "color-mix(in srgb, var(--work-tone) 9%, var(--surface-glass-2-bg))"
            : glass1.background,
          border: glass1.border,
          boxShadow: selected ? glass2.boxShadow : glass1.boxShadow,
        }}
        className={`group relative overflow-hidden rounded-lg py-3 pl-4 pr-3 outline-none transition-[box-shadow,transform] hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-[var(--work-tone)] ${
          selected ? "ring-1 ring-[var(--work-tone)]" : ""
        }`}
      >
        {/* Type-toned rail */}
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--work-tone)]" />

        {/* Header: the title leads; the type, year and venue read as one dateline under it. */}
        <h3 className="font-serif text-[15px] font-semibold leading-snug [overflow-wrap:anywhere] line-clamp-3">{work.title}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] leading-tight">
          <span className="font-semibold uppercase tracking-wide text-[var(--work-tone)]">{kind}</span>
          {work.year !== null && (
            <>
              <span className="text-muted-foreground/60">·</span>
              <span className="tabular-nums text-muted-foreground">{work.year}</span>
            </>
          )}
          {work.venue && (
            <>
              <span className="text-muted-foreground/60">·</span>
              <span className="min-w-0 truncate text-muted-foreground">{work.venue}</span>
            </>
          )}
        </p>
        {work.authors.length > 0 && <p className="mt-0.5 truncate text-xs text-muted-foreground">{authorLine(work)}</p>}

        {summary && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{summary}</p>}

        <div className="mt-2 flex items-center gap-x-2 text-[10px]">
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
            <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground" title="Times cited">
              <Quote className="h-2.5 w-2.5" />
              {work.citedByCount.toLocaleString()}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-muted-foreground/80">{sourceLabels(work.provenance)}</span>
          <AddControl work={work} savedRefs={savedRefs} tone="card" />
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
          . Saved as a link until the Law pack (V1.1) can read it here.
        </div>
      </div>
      <AddControl work={{ key: link.key, title: link.title }} savedRefs={saved[link.key] ?? []} tone="link" />
    </div>
  );
}
