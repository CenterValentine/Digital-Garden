/**
 * CRM client state — ONE snapshot per business, shared by every open view.
 *
 * The inbox, the pipeline and every record tab read the same snapshot and
 * project it through lib/domain/crm/model.ts, so a stage changed on the
 * pipeline is the stage the conversation shows — even side by side in two
 * panes — with no cross-view messaging. Mutations apply optimistically to
 * the snapshot, then refetch from the server, which stays the authority.
 *
 * Persisted: only the operator's place (active business, selected contact).
 * Records are always fetched — never trusted from localStorage.
 */

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { projectCrm, type CrmModel, type CrmWorkspaceSnapshot } from "@/lib/domain/crm/model";
import { crmApi, type CrmBusinessSummary } from "../lib/api";

type LoadStatus = "loading" | "ready" | "error";

interface CrmState {
  businesses: CrmBusinessSummary[] | null;
  activeFolderId: string | null;
  snapshots: Record<string, CrmWorkspaceSnapshot>;
  status: Record<string, LoadStatus>;
  errors: Record<string, string | null>;
  selectedContact: Record<string, string | null>;

  loadBusinesses: () => Promise<void>;
  setActiveFolder: (folderId: string) => void;
  load: (folderId: string) => Promise<void>;
  selectContact: (folderId: string, contactId: string | null) => void;
  /** Optimistic local cell patch; returns an undo. */
  patchCell: (folderId: string, tableId: string, rowId: string, columnKey: string, value: unknown) => () => void;
}

const inflight = new Map<string, Promise<void>>();

export const useCrmStore = create<CrmState>()(
  persist(
    (set, get) => ({
      businesses: null,
      activeFolderId: null,
      snapshots: {},
      status: {},
      errors: {},
      selectedContact: {},

      loadBusinesses: async () => {
        const businesses = await crmApi.businesses();
        const active = get().activeFolderId;
        set({
          businesses,
          activeFolderId:
            active && businesses.some((b) => b.folderId === active)
              ? active
              : (businesses[0]?.folderId ?? null),
        });
      },

      setActiveFolder: (folderId) => set({ activeFolderId: folderId }),

      load: (folderId) => {
        // Coalesce: every view mounting at once asks once.
        const pending = inflight.get(folderId);
        if (pending) return pending;
        const run = (async () => {
          if (!get().snapshots[folderId]) {
            set((s) => ({ status: { ...s.status, [folderId]: "loading" } }));
          }
          try {
            const snapshot = await crmApi.workspace(folderId);
            set((s) => ({
              snapshots: { ...s.snapshots, [folderId]: snapshot },
              status: { ...s.status, [folderId]: "ready" },
              errors: { ...s.errors, [folderId]: null },
            }));
          } catch (error) {
            set((s) => ({
              status: { ...s.status, [folderId]: s.snapshots[folderId] ? "ready" : "error" },
              errors: {
                ...s.errors,
                [folderId]: error instanceof Error ? error.message : "Could not load the CRM",
              },
            }));
          } finally {
            inflight.delete(folderId);
          }
        })();
        inflight.set(folderId, run);
        return run;
      },

      selectContact: (folderId, contactId) =>
        set((s) => ({ selectedContact: { ...s.selectedContact, [folderId]: contactId } })),

      patchCell: (folderId, tableId, rowId, columnKey, value) => {
        const before = get().snapshots[folderId];
        if (!before) return () => {};
        const tables = { ...before.tables };
        for (const role of Object.keys(tables) as Array<keyof typeof tables>) {
          const table = tables[role];
          if (table.id !== tableId) continue;
          tables[role] = {
            ...table,
            rows: table.rows.map((r) => {
              if (r.id !== rowId) return r;
              const data = { ...r.data };
              if (value === undefined || value === null || value === "") delete data[columnKey];
              else data[columnKey] = value as never;
              return { ...r, data };
            }),
          };
        }
        set((s) => ({ snapshots: { ...s.snapshots, [folderId]: { ...before, tables } } }));
        return () => set((s) => ({ snapshots: { ...s.snapshots, [folderId]: before } }));
      },
    }),
    {
      name: "dg-crm",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ activeFolderId: s.activeFolderId, selectedContact: s.selectedContact }),
    }
  )
);

/** The projected CRM for one business; loads on mount and when the tab regains focus. */
export function useCrmModel(folderId: string | null): {
  model: CrmModel | null;
  status: LoadStatus | null;
  error: string | null;
} {
  const snapshot = useCrmStore((s) => (folderId ? s.snapshots[folderId] : undefined));
  const status = useCrmStore((s) => (folderId ? (s.status[folderId] ?? null) : null));
  const error = useCrmStore((s) => (folderId ? (s.errors[folderId] ?? null) : null));
  const load = useCrmStore((s) => s.load);

  useEffect(() => {
    if (!folderId) return;
    void load(folderId);
    const onFocus = () => void load(folderId);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [folderId, load]);

  const model = useMemo(() => (snapshot ? projectCrm(snapshot) : null), [snapshot]);
  return { model, status, error };
}
