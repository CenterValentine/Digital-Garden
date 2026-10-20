/**
 * Research tab state (RESEARCH-READER-PLAN.md §2.3). One search at a time:
 * the query, the merged Works as they stream in, each source's report, and
 * the Work selected for the right sidebar.
 *
 * The box text is the single source of truth for filters: tokens such as
 * `after:2015 oa:yes` live in it (`lib/domain/research/query-syntax.ts`),
 * and the quick-pane edits the text by rewriting tokens. The scope, text
 * and source toggles persist so the tab reopens where the user left it;
 * results don't (they go stale).
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SourceReport } from "@/lib/domain/research/federate";
import { applyFields, parseFieldedQuery, type QueryFields } from "@/lib/domain/research/query-syntax";
import type { ResearchWorkNodeDto, SavedWorkRef, Work } from "@/lib/domain/research/types";

export type ResearchStatus = "idle" | "searching" | "done" | "error";

/** A pasted legal citation (Law stub): saved as a link, shown as one result. */
export interface ResearchLinkResult {
  key: string;
  title: string;
  url: string;
  type: string;
}

interface ResearchState {
  scope: string;
  /** Paid / off-by-default sources the user turned on for their searches. */
  include: string[];
  /** Sources the user turned off. */
  exclude: string[];
  /** The box: free words plus filter tokens. */
  text: string;
  /** Parsed from `text` on every change — never set directly. */
  fields: QueryFields;
  /** The quick-pane (filters + sources) is open. */
  paneOpen: boolean;

  status: ResearchStatus;
  error: string | null;
  works: Work[];
  link: ResearchLinkResult | null;
  /** Latest report per source (the source strip). */
  reports: Record<string, SourceReport>;
  /** Cursor per source for "More results"; null = that source has no more. */
  cursors: Record<string, string | null>;
  selectedKey: string | null;
  /**
   * Work key → the nodes that already hold it: what the server reports with
   * each search, plus this session's adds. Empty array = checked, not saved.
   */
  saved: Record<string, SavedWorkRef[]>;
  /** Where "Add" puts Works — the "+" target the tab was opened from. */
  targetParentId: string | null;
  /** Research nodes open in the reader, by content id — the sidebar's Work view reads these. */
  openWorks: Record<string, ResearchWorkNodeDto>;

  setScope: (scope: string) => void;
  toggleSource: (source: string, on: boolean, defaultOn: boolean) => void;
  setText: (text: string) => void;
  /** Edit filters from the pane: rewrites the box's tokens. */
  setFields: (patch: Partial<QueryFields>) => void;
  setPaneOpen: (open: boolean) => void;
  startSearch: (append: boolean) => void;
  receiveWorks: (works: Work[], append: boolean, previous: Work[]) => void;
  receiveReport: (report: SourceReport) => void;
  finish: (error?: string | null) => void;
  showSingle: (work: Work | null, link: ResearchLinkResult | null) => void;
  select: (key: string | null) => void;
  receiveSaved: (refs: Record<string, SavedWorkRef[]>) => void;
  markSaved: (key: string, ref: SavedWorkRef) => void;
  setTargetParentId: (parentId: string | null) => void;
  setOpenWork: (contentId: string, node: ResearchWorkNodeDto | null) => void;
}

export const useResearchStore = create<ResearchState>()(
  persist(
    (set) => ({
      scope: "scholarly",
      include: [],
      exclude: [],
      text: "",
      fields: {},
      paneOpen: false,
      status: "idle",
      error: null,
      works: [],
      link: null,
      reports: {},
      cursors: {},
      selectedKey: null,
      saved: {},
      targetParentId: null,
      openWorks: {},

      setScope: (scope) => set({ scope }),
      toggleSource: (source, on, defaultOn) =>
        set((state) => ({
          include: on && !defaultOn ? [...new Set([...state.include, source])] : state.include.filter((id) => id !== source),
          exclude: !on && defaultOn ? [...new Set([...state.exclude, source])] : state.exclude.filter((id) => id !== source),
        })),
      setText: (text) => set({ text, fields: parseFieldedQuery(text).fields }),
      setFields: (patch) =>
        set((state) => {
          const text = applyFields(state.text, patch);
          return { text, fields: parseFieldedQuery(text).fields };
        }),
      setPaneOpen: (paneOpen) => set({ paneOpen }),
      startSearch: (append) =>
        set({
          status: "searching",
          error: null,
          link: null,
          reports: {},
          // "More results" keeps the Works and cursors already shown.
          ...(append ? {} : { works: [], cursors: {}, selectedKey: null }),
        }),
      receiveWorks: (works, append, previous) =>
        set(() => {
          if (!append) return { works };
          // "More results": keep earlier pages first, add only Works not already shown.
          const seen = new Set(previous.map((work) => work.key));
          return { works: [...previous, ...works.filter((work) => !seen.has(work.key))] };
        }),
      receiveReport: (report) =>
        set((state) => ({
          reports: { ...state.reports, [report.source]: report },
          cursors: report.status === "ok" ? { ...state.cursors, [report.source]: report.next } : state.cursors,
        })),
      finish: (error = null) => set({ status: error ? "error" : "done", error }),
      showSingle: (work, link) =>
        set({
          status: "done",
          error: null,
          works: work ? [work] : [],
          link,
          reports: {},
          cursors: {},
          selectedKey: work?.key ?? null,
        }),
      select: (key) => set({ selectedKey: key }),
      receiveSaved: (refs) => set((state) => ({ saved: { ...state.saved, ...refs } })),
      markSaved: (key, ref) =>
        set((state) => ({
          saved: { ...state.saved, [key]: [...(state.saved[key] ?? []).filter((r) => r.contentId !== ref.contentId), ref] },
        })),
      setTargetParentId: (targetParentId) => set({ targetParentId }),
      setOpenWork: (contentId, node) =>
        set((state) => {
          const openWorks = { ...state.openWorks };
          if (node) openWorks[contentId] = node;
          else delete openWorks[contentId];
          return { openWorks };
        }),
    }),
    {
      name: "reader:research",
      version: 2,
      partialize: (state) => ({
        scope: state.scope,
        include: state.include,
        exclude: state.exclude,
        text: state.text,
      }),
      // The persisted text carries the tokens; derive the fields on rehydrate.
      onRehydrateStorage: () => (state) => {
        if (state) state.fields = parseFieldedQuery(state.text).fields;
      },
      migrate: (persisted) => {
        const old = (persisted ?? {}) as Record<string, unknown>;
        return { scope: old.scope ?? "scholarly", include: old.include ?? [], exclude: old.exclude ?? [], text: "" } as never;
      },
    }
  )
);
