/**
 * Research tab state (RESEARCH-READER-PLAN.md §2.3). One search at a time:
 * the query, the merged Works as they stream in, each source's report, and
 * the Work selected for the right sidebar. The scope and filters persist so
 * the tab reopens where the user left it; results don't (they go stale).
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SourceReport } from "@/lib/domain/research/federate";
import type { Work } from "@/lib/domain/research/types";

export type ResearchStatus = "idle" | "searching" | "done" | "error";

export interface ResearchFilters {
  yearFrom?: number;
  yearTo?: number;
  openAccess?: boolean;
  sort: "relevance" | "recent" | "cited";
}

/** A pasted legal citation (Law stub): saved as a link, shown as one result. */
export interface ResearchLinkResult {
  key: string;
  title: string;
  url: string;
  type: string;
}

interface ResearchState {
  scope: string;
  filters: ResearchFilters;
  /** Paid / off-by-default sources the user turned on for their searches. */
  include: string[];
  /** Sources the user turned off. */
  exclude: string[];

  text: string;
  status: ResearchStatus;
  error: string | null;
  works: Work[];
  link: ResearchLinkResult | null;
  /** Latest report per source (the source strip). */
  reports: Record<string, SourceReport>;
  /** Cursor per source for "More results"; null = that source has no more. */
  cursors: Record<string, string | null>;
  selectedKey: string | null;
  /** Work key → the saved node (this session's adds, and duplicates found). */
  saved: Record<string, { contentId: string; copyPolicy: string }>;
  /** Where "Add" puts Works — the "+" target the tab was opened from. */
  targetParentId: string | null;

  setScope: (scope: string) => void;
  setFilters: (patch: Partial<ResearchFilters>) => void;
  toggleSource: (source: string, on: boolean, defaultOn: boolean) => void;
  setText: (text: string) => void;
  startSearch: (append: boolean) => void;
  receiveWorks: (works: Work[], append: boolean, previous: Work[]) => void;
  receiveReport: (report: SourceReport) => void;
  finish: (error?: string | null) => void;
  showSingle: (work: Work | null, link: ResearchLinkResult | null) => void;
  select: (key: string | null) => void;
  markSaved: (key: string, contentId: string, copyPolicy: string) => void;
  setTargetParentId: (parentId: string | null) => void;
}

export const useResearchStore = create<ResearchState>()(
  persist(
    (set) => ({
      scope: "scholarly",
      filters: { sort: "relevance" },
      include: [],
      exclude: [],
      text: "",
      status: "idle",
      error: null,
      works: [],
      link: null,
      reports: {},
      cursors: {},
      selectedKey: null,
      saved: {},
      targetParentId: null,

      setScope: (scope) => set({ scope }),
      setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
      toggleSource: (source, on, defaultOn) =>
        set((state) => ({
          include: on && !defaultOn ? [...new Set([...state.include, source])] : state.include.filter((id) => id !== source),
          exclude: !on && defaultOn ? [...new Set([...state.exclude, source])] : state.exclude.filter((id) => id !== source),
        })),
      setText: (text) => set({ text }),
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
      markSaved: (key, contentId, copyPolicy) =>
        set((state) => ({ saved: { ...state.saved, [key]: { contentId, copyPolicy } } })),
      setTargetParentId: (targetParentId) => set({ targetParentId }),
    }),
    {
      name: "reader:research",
      version: 1,
      partialize: (state) => ({
        scope: state.scope,
        filters: state.filters,
        include: state.include,
        exclude: state.exclude,
      }),
    }
  )
);
