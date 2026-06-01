"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// The PublicPath tree shown in the left sidebar view-mode
export interface PublicPathNode {
  id: string;
  parentId: string | null;
  slug: string;
  title: string;
  description: string | null;
  displayOrder: number;
  icon: string | null;
  children: PublicPathNode[];
  itemCount: number;
  // Tenant this path belongs to. Used to render a tenant-slug prefix on
  // root nodes when the user owns multiple tenants. Null defensively for
  // any path not yet backfilled — shouldn't happen in practice.
  tenantId: string | null;
  tenantSlug: string | null;
}

interface PublishTreeState {
  paths: PublicPathNode[];
  setPaths: (paths: PublicPathNode[]) => void;

  expandedPathIds: Set<string>;
  togglePathExpanded: (id: string) => void;
  setPathExpanded: (id: string, expanded: boolean) => void;

  selectedPathId: string | null;
  setSelectedPathId: (id: string | null) => void;

  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
}

export const usePublishTreeStore = create<PublishTreeState>()(
  persist(
    (set) => ({
      paths: [],
      setPaths: (paths) => set({ paths }),

      expandedPathIds: new Set(),
      togglePathExpanded: (id) =>
        set((s) => {
          const next = new Set(s.expandedPathIds);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { expandedPathIds: next };
        }),
      setPathExpanded: (id, expanded) =>
        set((s) => {
          const next = new Set(s.expandedPathIds);
          if (expanded) next.add(id);
          else next.delete(id);
          return { expandedPathIds: next };
        }),

      selectedPathId: null,
      setSelectedPathId: (id) => set({ selectedPathId: id }),

      isLoading: false,
      setIsLoading: (v) => set({ isLoading: v }),
    }),
    {
      name: "publishing-tree-state",
      version: 1,
      partialize: (s) => ({
        expandedPathIds: Array.from(s.expandedPathIds),
        selectedPathId: s.selectedPathId,
      }),
      merge: (persisted: unknown, current) => ({
        ...current,
        ...(persisted as object),
        expandedPathIds: new Set(
          (persisted as { expandedPathIds?: string[] })?.expandedPathIds ?? []
        ),
      }),
    }
  )
);
