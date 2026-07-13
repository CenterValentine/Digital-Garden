"use client";

import { create } from "zustand";
import type { WorkflowRunStatusValue } from "../shared";

interface WorkflowRunsState {
  /** Run open in the panel's detail view; null = list view. */
  selectedRunId: string | null;
  statusFilter: WorkflowRunStatusValue | "all";
  selectRun: (runId: string | null) => void;
  setStatusFilter: (filter: WorkflowRunStatusValue | "all") => void;
}

export const useWorkflowRunsStore = create<WorkflowRunsState>()((set) => ({
  selectedRunId: null,
  statusFilter: "all",
  selectRun: (runId) => set({ selectedRunId: runId }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
}));
